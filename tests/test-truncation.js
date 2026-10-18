import { Packr, Unpackr, addExtension, UnpackrStream, decodeIter } from '../node-index.js';
import { assert } from 'chai';

// A prefix of a valid encoding can only fail because bytes are missing, so it must always be reported as
// incomplete. UnpackrStream relies on this to wait for the next chunk instead of erroring.
const values = {
	'small ints': [0, 1, 127, 128, 255, 256, 65535, 65536, 0xffffffff, 2 ** 32, 2 ** 53 - 1],
	'negative ints': [-1, -32, -33, -128, -129, -32769, -(2 ** 31) - 1, -(2 ** 53)],
	bigints: [2n ** 64n - 1n, -(2n ** 63n)],
	floats: [1.5, 0.1, -1e300, 3.4e38, NaN, Infinity],
	strings: ['', 'a', 'x'.repeat(31), 'y'.repeat(32), 'z'.repeat(300), 'é∂ü😀'.repeat(5), 'k'.repeat(70000)],
	'object keys': { a: 1, bb: 2, ccc: 3, dddd: 4, eeeee: 5, ffffffffffffffff: 6, ['g'.repeat(23)]: 7, ['h'.repeat(31)]: 8 },
	'repeated keys': [{ name: 'a', id: 1 }, { name: 'b', id: 2 }, { name: 'c', id: 3 }],
	buffers: [Buffer.alloc(0), Buffer.from('hello'), Buffer.alloc(300, 7)],
	'typed arrays': [new Uint16Array([1, 2, 3]), new Float64Array([1.5, 2.5]), new Int32Array([-1, 7])],
	'large array': new Array(300).fill(0).map((_, i) => i),
	'large map': new Map(new Array(300).fill(0).map((_, i) => [i, 'v' + i])),
	set: new Set([1, 'two', 3]),
	date: new Date(1700000000000),
	regexp: /ab+c/gi,
	error: new Error('boom'),
	nested: { list: [[1, [2, [3, { deep: [4] }]]]], map: new Map([['k', { v: [1.5] }]]) }
};

const configs = {
	default: {},
	'useRecords: false': { useRecords: false },
	'mapsAsObjects: false': { mapsAsObjects: false },
	'moreTypes + structuredClone': { moreTypes: true, structuredClone: true },
	bundleStrings: { bundleStrings: true },
	useFloat32: { useFloat32: 1 },
	'int64AsType: number': { int64AsType: 'number' },
	variableMapSize: { variableMapSize: true },
	sequential: { sequential: true },
	'shared structures': { structures: [] },
	'records + bundleStrings + structuredClone': { useRecords: true, bundleStrings: true, structuredClone: true, moreTypes: true }
};

function assertIncomplete(unpack, label) {
	let value;
	try {
		value = unpack();
	} catch (error) {
		assert.isTrue(error.incomplete, `${label}: threw a non-incomplete ${error.constructor.name}: ${error.message}`);
		return;
	}
	assert.fail(`${label}: decoded ${String(value)} from a truncated encoding`);
}

suite('truncated encodings', function () {
	this.timeout(20000);
	for (const [configLabel, options] of Object.entries(configs)) {
		test(configLabel, () => {
			for (const [label, value] of Object.entries(values)) {
				// separate copies so a packr and unpackr can share structures
				const encoded = new Packr({ ...options }).pack(value);
				const unpackr = new Unpackr({ ...options });
				unpackr.unpack(encoded);
				for (let end = 0; end < encoded.length; end += end < 512 || end > encoded.length - 512 ? 1 : 251) {
					// a copy, so the DataView ends with the data, as it does for a stream chunk
					assertIncomplete(() => unpackr.unpack(Buffer.from(encoded.subarray(0, end))), `${label} [0, ${end})`);
					// delimited only by the end argument, followed by bytes that must not be read
					const padded = Buffer.concat([encoded.subarray(0, end), Buffer.alloc(16, 0xc1)]);
					assertIncomplete(() => unpackr.unpack(padded, end), `${label} end=${end}`);
				}
			}
		});
	}

	const items = [{ a: 'hello' }, [1, 2.5, 'three'], 'x'.repeat(40), 70000, new Map([[1, 2]]), { a: 'again', b: [1] }];
	test('UnpackrStream reassembles a sequence split at every offset', async () => {
		const packr = new Packr();
		const encoded = Buffer.concat(items.map(item => packr.pack(item)));
		const expected = items.map(item => new Unpackr().unpack(packr.pack(item)));
		for (let split = 1; split < encoded.length; split++) {
			const stream = new UnpackrStream();
			const received = [];
			let failure;
			stream.on('data', value => received.push(value));
			stream.on('error', error => failure = error);
			stream.write(encoded.subarray(0, split));
			stream.write(encoded.subarray(split));
			stream.end();
			await new Promise(resolve => {
				stream.on('finish', resolve);
				stream.on('error', resolve);
			});
			assert.isUndefined(failure, `split at ${split}: ${failure?.message}`);
			assert.deepStrictEqual(received, expected, `split at ${split}`);
		}
	});

	test('decodeIter reassembles a sequence split at every offset', () => {
		const packr = new Packr();
		const encoded = Buffer.concat(items.map(item => packr.pack(item)));
		const expected = items.map(item => new Unpackr().unpack(packr.pack(item)));
		for (let split = 1; split < encoded.length; split++) {
			assert.deepStrictEqual([...decodeIter([encoded.subarray(0, split), encoded.subarray(split)])], expected,
				`split at ${split}`);
		}
	});
});

// The unpacker recurses once per level of nesting; input nested deeper than the call stack allows must fail
// as a normal (fatal) error, not be mistaken for truncated input that more bytes could complete.
const deeplyNested = {
	arrays: Buffer.alloc(100000, 0x91),
	maps: Buffer.alloc(200000, 0x81).map((byte, i) => i % 2 ? 0x01 : byte),
	'array16 headers': Buffer.alloc(300000, 0xdc).map((byte, i) => i % 3 == 0 ? byte : i % 3 == 1 ? 0 : 1)
};

suite('deeply nested input', function () {
	for (const [label, bytes] of Object.entries(deeplyNested)) {
		test(label, () => {
			for (const unpackr of [new Unpackr(), new Unpackr({ mapsAsObjects: false }), new Unpackr({ useRecords: false })]) {
				for (const unpack of [bytes => unpackr.unpack(bytes), bytes => unpackr.unpackMultiple(bytes)]) {
					try {
						unpack(bytes);
						assert.fail('should not unpack');
					} catch (error) {
						assert.instanceOf(error, RangeError);
						assert.isNotOk(error.incomplete, error.message);
					}
				}
				assert.deepStrictEqual(unpackr.unpack(Buffer.from([0x92, 0x01, 0xa1, 0x61])), [1, 'a'], 'unpackr recovers');
			}
		});
	}

	test('UnpackrStream errors instead of waiting for more data', async () => {
		const stream = new UnpackrStream();
		stream.on('data', () => {});
		const error = await new Promise(resolve => {
			stream.on('error', resolve);
			stream.write(deeplyNested.arrays);
		});
		assert.instanceOf(error, RangeError);
		assert.isNotOk(stream.incompleteBuffer);
	});

	test('UnpackrStream and decodeIter emit the values that precede a fatal error', async () => {
		const bytes = Buffer.concat([Buffer.from([0x01, 0xa1, 0x61]), deeplyNested.arrays]);
		const stream = new UnpackrStream();
		const received = [];
		stream.on('data', value => received.push(value));
		await new Promise(resolve => {
			stream.on('error', resolve);
			stream.write(bytes);
		});
		assert.deepStrictEqual(received, [1, 'a']);
		const iterated = [];
		assert.throws(() => { for (const value of decodeIter([bytes])) iterated.push(value); }, RangeError);
		assert.deepStrictEqual(iterated, [1, 'a']);
	});

	test('moderately nested data still unpacks', () => {
		let value = 'leaf';
		for (let i = 0; i < 1000; i++) value = i % 2 ? [value] : { a: value };
		assert.deepStrictEqual(new Unpackr().unpack(new Packr().pack(value)), value);
	});
});

suite('complete but invalid input is not incomplete', function () {
	test('an extension unpacking truncated embedded data', async () => {
		addExtension({ type: 0x2a, unpack: bytes => new Unpackr().unpack(bytes) });
		const bytes = Buffer.from([0xd5, 0x2a, 0x92, 0x01]); // fixext 2 holding a truncated [1, ...]
		try {
			new Unpackr().unpack(bytes);
			assert.fail('should not unpack');
		} catch (error) {
			assert.isNotOk(error.incomplete, error.message);
		}
		const stream = new UnpackrStream();
		stream.on('data', () => {});
		const error = await new Promise(resolve => {
			stream.on('error', resolve);
			stream.write(bytes);
		});
		assert.isNotOk(error.incomplete);
		assert.isNotOk(stream.incompleteBuffer);
	});

	test('a fixext 1 split after its type is incomplete, even for an extension that unpacks', async () => {
		addExtension({ type: 0x2d, unpack: bytes => new Unpackr().unpack(bytes) });
		const stream = new UnpackrStream();
		const received = [];
		let failure;
		stream.on('data', value => received.push(value));
		stream.on('error', error => failure = error);
		stream.write(Buffer.from([0xd4, 0x2d]));
		stream.write(Buffer.from([0x07]));
		stream.end();
		await new Promise(resolve => {
			stream.on('finish', resolve);
			stream.on('error', resolve);
		});
		assert.isUndefined(failure, failure?.message);
		assert.deepStrictEqual(received, [7]);
	});

	test('a read extension unpacking a bin split across chunks', async () => {
		addExtension({ type: 0x2e, read: data => new Unpackr().unpack(data) });
		const value = [1, 'two', [3]];
		const bytes = Buffer.concat([Buffer.from([0xd4, 0x2e, 0x00]), new Packr().pack(new Packr().pack(value))]);
		for (let split = 1; split < bytes.length; split++) {
			assert.deepStrictEqual([...decodeIter([bytes.subarray(0, split), bytes.subarray(split)])], [value], `split at ${split}`);
		}
	});

	test('an extension sees whether its own nested unpack was incomplete', () => {
		addExtension({ type: 0x2b, unpack: bytes => {
			try {
				return new Unpackr().unpack(bytes);
			} catch (error) {
				return { incomplete: error.incomplete };
			}
		} });
		assert.deepStrictEqual(new Unpackr().unpack(Buffer.from([0xd5, 0x2b, 0x92, 0x01])), { incomplete: true });
	});

	test('an extension throwing a non-Error value', () => {
		addExtension({ type: 0x2c, unpack: () => { throw 'invalid'; } });
		assert.throws(() => new Unpackr().unpack(Buffer.from([0xd4, 0x2c, 0x00])), 'invalid');
	});
});

suite('end of input', function () {
	test('decodeIter reports a value left incomplete at the end', async () => {
		const bytes = Buffer.from([0x01, 0x92, 0x01]);
		const received = [];
		assert.throws(() => { for (const value of decodeIter([bytes])) received.push(value); }, /Unexpected end/);
		assert.deepStrictEqual(received, [1]);
		try {
			for await (const value of decodeIter((async function * () { yield bytes; })())) received.push(value);
			assert.fail('should throw');
		} catch (error) {
			assert.match(error.message, /Unexpected end/);
		}
	});

	test('an empty final chunk is not an incomplete value', async () => {
		const stream = new UnpackrStream();
		const received = [];
		let failure;
		stream.on('data', value => received.push(value));
		stream.on('error', error => failure = error);
		stream.write(Buffer.from([0x01]));
		stream.write(Buffer.alloc(0));
		stream.end();
		await new Promise(resolve => {
			stream.on('finish', resolve);
			stream.on('error', resolve);
		});
		assert.isUndefined(failure, failure?.message);
		assert.deepStrictEqual(received, [1]);
		assert.deepStrictEqual([...decodeIter([Buffer.from([0x01]), Buffer.alloc(0)])], [1]);
	});

	test('UnpackrStream reports a value left incomplete at the end', async () => {
		const stream = new UnpackrStream();
		const received = [];
		stream.on('data', value => received.push(value));
		const error = await new Promise(resolve => {
			stream.on('error', resolve);
			stream.on('finish', () => resolve());
			stream.write(Buffer.from([0x01, 0x92, 0x01])); // 1, then an array of 2 with only 1 element
			stream.end();
		});
		assert.deepStrictEqual(received, [1]);
		assert.match(error?.message, /Unexpected end/);
	});
});
