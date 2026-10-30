import { Packr, Unpackr, UnpackrStream, decodeIter, addExtension } from '../node-index.js';
import { unpackChunk, streamUnpackr } from '../iterators.js';
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

	test('each header is scanned once', () => {
		const count = 50000;
		const bytes = new Packr({ useRecords: false }).pack(Array.from({ length: count }, (_, i) => 'item ' + i));
		const state = { unpackr: streamUnpackr(new Unpackr()), maxIncompleteBufferSize: Infinity };
		const values = [];
		for (const part of chunks(bytes, 100)) values.push(...unpackChunk(state, part));
		assert.equal(values[0].length, count);
		assert.equal(state.incompleteScanner.headers, count + 1);
	});

	test('a record definition with extension-produced keys is counted once it is complete', async () => {
		addExtension({ type: 0x37, read: value => value ? ['a', 'b'] : ['a'] });
		for (const [input, expected] of [[0, { a: 10 }], [1, { a: 10, b: 20 }]]) {
			const bytes = Buffer.from([0xd4, 0x72, 0x40, 0xd4, 0x37, 0, input, 10, ...(input ? [20] : []), 0x40, 30, ...(input ? [40] : []), 7]);
			const values = [expected, input ? { a: 30, b: 40 } : { a: 30 }, 7];
			assert.deepStrictEqual(new Unpackr().unpackMultiple(bytes), values);
			for (let split = 1; split < bytes.length; split++) {
				const parts = [bytes.subarray(0, split), bytes.subarray(split)];
				assert.deepStrictEqual(countedDecode(parts).values, values, `iterator split ${split}`);
				assert.deepStrictEqual((await streamed(parts)).values, values, `stream split ${split}`);
			}
			assert.deepStrictEqual(countedDecode(chunks(bytes, 1)).values, values);
		}
	});

	test('a custom extension that reads past its data is rejected only on fragmented input', async () => {
		class Pair {
			constructor(first, second) { this.first = first; this.second = second; }
		}
		addExtension({ Class: Pair, type: 0x38, write: pair => pair.first, read: first => new Pair(first, new Unpackr().unpack(Buffer.from([0xc0]))) });
		const sibling = { type: 0x39, unpack: () => readSibling() };
		let readSibling;
		const { read } = await import('../unpack.js');
		readSibling = () => read();
		addExtension(sibling);
		const abc = [0xd4, 0x39, 0, 0xa3, 0x61, 0x62, 0x63];
		for (const [bytes, expected] of [[[0x92, ...abc, 5], ['abc', 5]], [[0x91, ...abc], ['abc']], [abc, 'abc']].map(([bytes, expected]) => [Buffer.from(bytes), expected])) {
			assert.deepStrictEqual(new Unpackr().unpack(bytes), expected);
			assert.deepStrictEqual(countedDecode([bytes]).values, [expected]);
			const splits = [];
			for (let split = 1; split < bytes.length; split++) splits.push([bytes.subarray(0, split), bytes.subarray(split)]);
			splits.push(chunks(bytes, 1));
			for (const parts of splits) {
				assert.throws(() => countedDecode(parts), /Extension type 57 read beyond its own data/, `iterator split ${parts[0].length}`);
				let error;
				await streamed(parts).catch(e => error = e);
				assert.match(error && error.message, /Extension type 57 read beyond its own data/, `stream split ${parts[0].length}`);
			}
		}
		const nested = new Packr().pack([new Pair('x'), 1]);
		assert.deepStrictEqual(countedDecode(chunks(nested, 1)).values, [[new Pair('x', null), 1]]);
	});

	test('keys counted from a record defined earlier in the same value', async () => {
		addExtension({ type: 0x3b, read: Object.keys });
		const bytes = Buffer.from([0x92, 0xd4, 0x72, 0x40, 0x91, 0xa1, 0x61, 0, 0xd4, 0x72, 0x41, 0xd4, 0x3b, 0, 0x40, 1, 10]);
		const expected = [[{ a: 0 }, { a: 10 }]];
		assert.deepStrictEqual([new Unpackr().unpack(bytes)], expected);
		for (let split = 1; split < bytes.length; split++) {
			const parts = [bytes.subarray(0, split), bytes.subarray(split)];
			assert.deepStrictEqual(countedDecode(parts).values, expected, `iterator split ${split}`);
			assert.deepStrictEqual((await streamed(parts)).values, expected, `stream split ${split}`);
		}
		assert.deepStrictEqual(countedDecode(chunks(bytes, 1)).values, expected);
	});

	test('keys counted from an extension argument that refers to a record defined earlier in the value', async () => {
		addExtension({ type: 0x3e, read: value => typeof value === 'number' ? [] : ['a'] });
		const bytes = Buffer.from('92d4724090d47241d43e0040a3616263', 'hex');
		const expected = [[{}, { a: 'abc' }]];
		assert.deepStrictEqual([new Unpackr().unpack(bytes)], expected);
		const parts = [bytes.subarray(0, 1), bytes.subarray(1, 12), bytes.subarray(12)];
		assert.deepStrictEqual(countedDecode(parts).values, expected);
		assert.deepStrictEqual((await streamed(parts)).values, expected);
	});

	test('keys from an extension that does not use earlier records stay linear', () => {
		addExtension({ type: 0x3f, read: () => ['x'] });
		const tail = Buffer.alloc(2048);
		for (let i = 0; i < 2048; i += 2) tail.set([0xa1, 0x61], i);
		const bytes = Buffer.concat([Buffer.from('93d4724090d47241d43f000001dc0400', 'hex'), tail]);
		const result = countedDecode(chunks(bytes, 1));
		assert.deepStrictEqual(result.values, [new Unpackr().unpack(bytes)]);
		assert.isAtMost(result.calls, 2);
	});

	test('a re-registered, changed extension is guarded with its new read', () => {
		const extension = { type: 0x35, read: value => ({ old: value }) };
		addExtension(extension);
		const bytes = Buffer.from([0x91, 0xd4, 0x35, 0, 1]);
		assert.deepStrictEqual(countedDecode(chunks(bytes, 1)).values, [[{ old: 1 }]]);
		extension.read = value => ({ new: value });
		addExtension(extension);
		assert.deepStrictEqual(countedDecode(chunks(bytes, 1)).values, [[{ new: 1 }]]);
	});

	test('a non-error thrown while scanning is reported as an error', async () => {
		for (const thrown of [0, false, '', null]) {
			const options = () => ({ getStructures() { throw thrown; } });
			const parts = [Buffer.from([0x91]), Buffer.from([0x40])];
			assert.throws(() => countedDecode(parts, options()), Error);
			let error;
			await streamed(parts, options()).catch(e => error = e);
			assert.instanceOf(error, Error);
		}
	});

	test('structures are loaded again for each missing id, as unpack does', async () => {
		const options = () => {
			let calls = 0;
			return { getStructures: () => calls++ ? [['a'], ['b']] : [['a']] };
		};
		const bytes = Buffer.from('9240a17841a179', 'hex');
		const expected = [[{ a: 'x' }, { b: 'y' }]];
		assert.deepStrictEqual([new Unpackr(options()).unpack(bytes)], expected);
		const parts = [bytes.subarray(0, 1), bytes.subarray(1, 5), bytes.subarray(5)];
		assert.deepStrictEqual(countedDecode(parts, options()).values, expected);
		assert.deepStrictEqual((await streamed(parts, options())).values, expected);
	});

	test('an extension reading past its data through its read callback is rejected on fragmented input', () => {
		addExtension({ type: 0x3c, unpack: (data, readAt) => readAt(5) });
		const bytes = Buffer.from([0x91, 0xd5, 0x3c, 0, 0, 0xa1, 0x78]);
		assert.deepStrictEqual(new Unpackr().unpackMultiple(bytes), [['x'], 'x']);
		for (let split = 1; split < 5; split++)
			assert.throws(() => countedDecode([bytes.subarray(0, split), bytes.subarray(split)]), /Extension type 60 read beyond/);
		addExtension({ type: 0x3c, unpack: (data, readAt) => readAt(3) });
		const within = Buffer.from([0x91, 0xd5, 0x3c, 0xa1, 0x79]);
		assert.deepStrictEqual(countedDecode(chunks(within, 1)).values, [['y']]);
	});

	test('a frozen extension is guarded without affecting other values', () => {
		addExtension(Object.freeze({ type: 0x3d, read: value => ({ frozen: value }) }));
		const bytes = new Packr().pack([1, 2, 3]);
		assert.deepStrictEqual(countedDecode(chunks(bytes, 1)).values, [[1, 2, 3]]);
		const frozen = Buffer.from([0x91, 0xd4, 0x3d, 0, 0xa1, 0x7a]);
		assert.deepStrictEqual(countedDecode(chunks(frozen, 1)).values, [[{ frozen: 'z' }]]);
		assert.deepStrictEqual(new Unpackr().unpack(frozen), [{ frozen: 'z' }]);
	});

	test('a malformed bundle decodes as it does from one buffer', () => {
		const bytes = Buffer.from([0x91, 0xd6, 0x62, 0, 0, 0, 6, 0xc1, 1, 0, 0xa0]);
		const expected = [new Unpackr().unpack(bytes)];
		assert.deepStrictEqual(countedDecode(chunks(bytes, 1)).values, expected);
	});

	test('unframeable values report the same error as one chunk', async () => {
		const unknownExtension = [0x92, 0xa1, 0x61, 0xd4, 0x5f, 0];
		const undefinedRecordId = [0x92, 0xd5, 0x72, 0x60, 0, 0x91, 0xa1, 0x61, 1, 0x60, 5];
		const nonStringBundle = [0x92, 0xd6, 0x62, 0, 0, 0, 6, 0xc1, 1, 1, 2];
		for (const bytes of [unknownExtension, undefinedRecordId, nonStringBundle].map(bytes => Buffer.from(bytes))) {
			let expected;
			try { countedDecode([bytes]); } catch (error) { expected = error.message; }
			assert.isString(expected);
			for (let split = 1; split < bytes.length; split++) {
				assert.throws(() => countedDecode([bytes.subarray(0, split), bytes.subarray(split)]), expected, `split ${split}`);
			}
			assert.throws(() => countedDecode(chunks(bytes, 1)), expected);
		}
	});

	test('held values honour maxIncompleteBufferSize and a completing chunk may exceed it', () => {
		const bytes = new Packr().pack(['x'.repeat(1000), 'y'.repeat(1000)]);
		assert.throws(() => [...decodeIter(chunks(bytes, 100), { maxIncompleteBufferSize: 1500 })], /Maximum incomplete buffer size exceeded/);
		const parts = [bytes.subarray(0, 1000), bytes.subarray(1000)];
		assert.deepStrictEqual([...decodeIter(parts, { maxIncompleteBufferSize: 1500 })], [['x'.repeat(1000), 'y'.repeat(1000)]]);
	});

	test('a reused caller buffer and binary views are not aliased with held bytes', () => {
		const bytes = new Packr().pack([Buffer.from([1, 2, 3]), 'after', Buffer.from([4, 5])]);
		const reused = Buffer.alloc(3);
		const state = { unpackr: streamUnpackr(new Unpackr()), maxIncompleteBufferSize: Infinity };
		const results = [];
		for (let i = 0; i < bytes.length; i += 3) {
			bytes.subarray(i, i + 3).copy(reused);
			results.push(...unpackChunk(state, reused.subarray(0, Math.min(3, bytes.length - i))));
		}
		reused.fill(0xff);
		assert.deepStrictEqual(results, [[Buffer.from([1, 2, 3]), 'after', Buffer.from([4, 5])]]);
	});

	test('async decodeIter resumes a scan and returns trailing values', async () => {
		const value = Array.from({ length: 100 }, (_, i) => ({ i, text: 'words' }));
		const bytes = Buffer.concat([new Packr().pack(value), Buffer.from([1, 2])]);
		const result = [];
		for await (const item of decodeIter((async function * () { yield * chunks(bytes, 7); })())) result.push(item);
		assert.deepStrictEqual(result, [value, 1, 2]);
	});
});
