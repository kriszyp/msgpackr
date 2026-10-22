import { Packr, Unpackr, UnpackrStream, decodeIter, addExtension } from '../node-index.js';
import { assert } from 'chai';

function chunks(bytes, size) {
	const result = [];
	for (let i = 0; i < bytes.length; i += size) result.push(bytes.subarray(i, i + size));
	return result;
}

function countedDecode(parts, options) {
	const original = Unpackr.prototype.unpackMultiple;
	let calls = 0;
	Unpackr.prototype.unpackMultiple = function () {
		calls++;
		return original.apply(this, arguments);
	};
	try {
		return { values: [...decodeIter(parts, options)], calls };
	} finally {
		Unpackr.prototype.unpackMultiple = original;
	}
}

async function streamed(parts, options) {
	const stream = options ? new UnpackrStream({ unpackr: new Unpackr(options) }) : new UnpackrStream();
	const original = stream.unpackr.unpackMultiple;
	let calls = 0;
	stream.unpackr.unpackMultiple = function () {
		calls++;
		return original.apply(this, arguments);
	};
	const values = [];
	stream.on('data', value => values.push(value));
	await new Promise((resolve, reject) => {
		stream.on('error', reject);
		stream.on('end', resolve);
		for (const part of parts) stream.write(part);
		stream.end();
	});
	return { values, calls };
}

suite('resumable stream structure scan', function () {
	this.timeout(30000);

	for (const mib of [1, 2, 4]) {
		test(`array32 of short strings, ${mib} MiB, needs only two decodes`, async () => {
			const count = Math.floor(mib * 1024 * 1024 / 21);
			const bytes = Buffer.alloc(5 + 21 * count, 0x61);
			bytes[0] = 0xdd;
			bytes.writeUInt32BE(count, 1);
			for (let i = 5; i < bytes.length; i += 21) bytes[i] = 0xb4;
			const parts = chunks(bytes, 16384);
			const start = performance.now();
			for (const result of [countedDecode(parts), await streamed(parts)]) {
				assert.equal(result.values.length, 1);
				assert.equal(result.values[0].length, count);
				assert.isTrue(result.values[0].every(value => value === 'a'.repeat(20)));
				assert.isAtMost(result.calls, 2);
			}
			assert.isBelow(performance.now() - start, 10000, 'generous wall-time sanity limit');
		});
	}

	test('fanout-2 tree split into tiny chunks needs only two decodes', async () => {
		let tree = 'leaf';
		for (let depth = 0; depth < 16; depth++) tree = [tree, tree];
		const bytes = new Packr({ useRecords: false }).pack(tree);
		for (const result of [countedDecode(chunks(bytes, 31)), await streamed(chunks(bytes, 31))]) {
			assert.deepStrictEqual(result.values, [tree]);
			assert.isAtMost(result.calls, 2);
		}
	});

	class Wrapped {
		constructor(value) { this.value = value; }
	}
	addExtension({ Class: Wrapped, type: 0x36, write: value => value.value, read: value => new Wrapped(value) });

	const shared = [['name', 'value']];
	const recordValue = [{ name: 'first', value: [1, 2, 3] }, { name: 'second', value: [4, 5] }];
	const cyclic = { name: 'cycle' };
	cyclic.self = cyclic;
	const fixtures = [
		['inline records', () => new Packr().pack(recordValue), () => ({})],
		['shared records', () => new Packr({ structures: shared.map(s => s.slice()) }).pack(recordValue), () => ({ structures: shared.map(s => s.slice()) })],
		['loaded records', () => new Packr({ structures: shared.map(s => s.slice()) }).pack(recordValue), () => ({ getStructures: () => shared.map(s => s.slice()) })],
		['two-byte inline records', () => Buffer.from([0x92, 0xd5, 0x72, 0x60, 0, 0x91, 0xa1, 0x61, 0x92, 1, 2, 0x60, 0, 0x92, 3, 4]), () => ({})],
		['negative own record ids', () => Buffer.from([0x92, 0xd5, 0x72, 0x40, 1, 0x91, 0xa1, 0x61, 1, 0xd5, 0x72, 0x40, 1, 0x91, 0xa1, 0x61, 2]), () => ({})],
		['structured clone', () => new Packr({ structuredClone: true }).pack([cyclic, cyclic]), () => ({})],
		['moreTypes', () => new Packr({ moreTypes: true }).pack([new Set([1, 'two']), /abc/gi, new TypeError('bad'), new Uint16Array([1, 500]), new Date(1700000000000)]), () => ({})],
		['bundled strings', () => new Packr({ bundleStrings: true }).pack(['hello world', 'another string', 'π strings', { nested: 'more words' }]), () => ({})],
		['custom read extension', () => new Packr().pack([new Wrapped({ nested: ['hello', 'world'] }), new Wrapped([1, 2])]), () => ({})],
		['all scalar widths', () => new Packr({ useRecords: false, moreTypes: true }).pack([null, true, false, undefined, -33, -129, -32769, 128, 256, 65536, 2 ** 40, -(2 ** 40), 1.25, 2n ** 63n, Buffer.alloc(300), 's'.repeat(300)]), () => ({})],
	];
	for (const [label, encode, options] of fixtures) {
		test(`${label}: both APIs split at every offset and one byte at a time`, async () => {
			const bytes = Buffer.from(encode());
			const expected = [new Unpackr(options()).unpack(bytes)];
			for (let split = 1; split < bytes.length; split++) {
				const parts = [bytes.subarray(0, split), bytes.subarray(split)];
				assert.deepStrictEqual(countedDecode(parts, options()).values, expected, `iterator split ${split}`);
				assert.deepStrictEqual((await streamed(parts, options())).values, expected, `stream split ${split}`);
			}
			for (const result of [countedDecode(chunks(bytes, 1), options()), await streamed(chunks(bytes, 1), options())]) {
				assert.deepStrictEqual(result.values, expected);
				assert.isAtMost(result.calls, 2);
			}
		});
	}

	test('bundle rollover and records stay linear', async () => {
		const value = Array.from({ length: 10000 }, (_, i) => ({ name: `long string ${i}`, text: 'unicode ππππ' }));
		const bytes = new Packr({ bundleStrings: true }).pack(value);
		for (const result of [countedDecode(chunks(bytes, 97)), await streamed(chunks(bytes, 97))]) {
			assert.deepStrictEqual(result.values, [value]);
			assert.isAtMost(result.calls, 2);
		}
	});

	test('definitions in completed values survive a split following record', async () => {
		const bytes = Buffer.from([0xd4, 0x72, 0x40, 0x91, 0xa1, 0x61, 1, 0x40, 0x93, 1, 2, 3]);
		const parts = [bytes.subarray(0, 10), bytes.subarray(10, 11), bytes.subarray(11)];
		assert.deepStrictEqual(countedDecode(parts).values, [{ a: 1 }, { a: [1, 2, 3] }]);
		assert.deepStrictEqual((await streamed(parts)).values, [{ a: 1 }, { a: [1, 2, 3] }]);
	});

	test('a failed definition cannot turn an earlier integer into a record', async () => {
		const bytes = Buffer.from([0x93, 0x40, 0xd4, 0x72, 0x40, 0x91, 0xa1, 0x61, 1, 0xa2, 0x62, 0x63]);
		const parts = [bytes.subarray(0, 11), bytes.subarray(11)];
		const expected = [[64, { a: 1 }, 'bc']];
		assert.deepStrictEqual(countedDecode(parts).values, expected);
		assert.deepStrictEqual((await streamed(parts)).values, expected);
	});

	test('multiple replacements restore the structure from before the failed value', async () => {
		const bytes = Buffer.from([0x95, 0x40, 0, 0xd4, 0x72, 0x40, 0x91, 0xa1, 0x62, 1,
			0xd4, 0x72, 0x40, 0x91, 0xa1, 0x63, 2, 0xa2, 0x78, 0x79, 0x40, 3]);
		const expected = [[{ a: 0 }, { b: 1 }, { c: 2 }, 'xy', { c: 3 }]];
		const parts = [bytes.subarray(0, 19), bytes.subarray(19)];
		assert.deepStrictEqual(countedDecode(parts, { structures: [['a']] }).values, expected);
		assert.deepStrictEqual((await streamed(parts, { structures: [['a']] })).values, expected);
	});

	test('async decodeIter resumes a scan and returns trailing values', async () => {
		const value = Array.from({ length: 100 }, (_, i) => ({ i, text: 'words' }));
		const bytes = Buffer.concat([new Packr().pack(value), Buffer.from([1, 2])]);
		const result = [];
		for await (const item of decodeIter((async function * () { yield * chunks(bytes, 7); })())) result.push(item);
		assert.deepStrictEqual(result, [value, 1, 2]);
	});
});
