import { Packr, Unpackr, addExtension, UnpackrStream, decodeIter } from '../node-index.js';
import { assert } from 'chai';
import vm from 'node:vm';

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
		return error;
	}
	assert.fail(`${label}: decoded ${String(value)} from a truncated encoding`);
}

function assertLowerBound(missingBytes, end, encoded, label) {
	if (missingBytes === undefined) return;
	assert.isAtLeast(missingBytes, 1, label);
	assert.isAtMost(end + missingBytes, encoded.length, `${label}: missingBytes ${missingBytes} overshoots`);
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
					const { missingBytes } = assertIncomplete(() => unpackr.unpack(Buffer.from(encoded.subarray(0, end))), `${label} [0, ${end})`);
					assertLowerBound(missingBytes, end, encoded, `${label} [0, ${end})`);
					// delimited only by the end argument, followed by bytes that must not be read
					const hints = [0xc1, 0x00, 0xff].map(fill => {
						const padded = Buffer.concat([encoded.subarray(0, end), Buffer.alloc(16, fill)]);
						return assertIncomplete(() => unpackr.unpack(padded, end), `${label} end=${end}`).missingBytes;
					});
					assert.isTrue(hints.every(hint => hint === hints[0]), `${label} end=${end}: missingBytes depends on bytes past the end: ${hints}`);
					assertLowerBound(hints[0], end, encoded, `${label} end=${end}`);
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

suite('values split across many chunks', function () {
	this.timeout(20000);
	const bin32Header = Buffer.from([0xc6, 0xff, 0xff, 0xff, 0xff]); // bin 32 declaring 4 GiB

	function countUnpacks(unpackr) {
		const unpackMultiple = unpackr.unpackMultiple;
		const counter = { calls: 0, bytes: 0 };
		unpackr.unpackMultiple = function (source) {
			counter.calls++;
			counter.bytes += source.length;
			return unpackMultiple.apply(this, arguments);
		};
		return counter;
	}
	function chunked(bytes, size) {
		const chunks = [];
		for (let start = 0; start < bytes.length; start += size) chunks.push(bytes.subarray(start, start + size));
		return chunks;
	}
	function receive(stream, count) {
		const received = [];
		return new Promise(resolve => {
			stream.on('data', value => {
				received.push(value);
				if (received.length === count) resolve({ received });
			});
			stream.on('error', error => resolve({ received, error }));
		});
	}

	test('a large declared bin is unpacked once, not once per chunk', async () => {
		const stream = new UnpackrStream();
		const counter = countUnpacks(stream.unpackr);
		let error;
		stream.on('data', () => {});
		stream.on('error', e => error = e);
		stream.write(bin32Header);
		for (let i = 0; i < 2000; i++) stream.write(Buffer.alloc(16384));
		await new Promise(resolve => setImmediate(resolve));
		assert.isUndefined(error, error?.message);
		assert.equal(counter.calls, 1);
		assert.equal(stream.incompleteLength, 5 + 2000 * 16384);
	});

	test('the incomplete buffer size limit still applies while unpacking is skipped', async () => {
		const stream = new UnpackrStream({ maxIncompleteBufferSize: 5 + 10 * 16384 });
		const counter = countUnpacks(stream.unpackr);
		const outcome = receive(stream, 1);
		stream.write(bin32Header);
		for (let i = 0; i < 10; i++) stream.write(Buffer.alloc(16384));
		await new Promise(resolve => setImmediate(resolve));
		assert.isNotOk(stream.destroyed);
		stream.write(Buffer.alloc(1));
		const { error } = await outcome;
		assert.equal(error?.message, 'Maximum incomplete buffer size exceeded');
		assert.equal(counter.calls, 1);
		assert.isNotOk(stream.incompleteBuffer);
	});

	test('a value is emitted on the chunk that completes it', async () => {
		const values = [
			[{ id: 1, payload: Buffer.alloc(1000000, 7) }, 2], // bin 32 inside a map
			[{ text: 'y'.repeat(1000), list: ['z'.repeat(100000)] }, 2], // str 16, and str 32 inside an array
			// many small elements only bound the bytes needed a little ahead, so these are unpacked again on most chunks
			[new Array(5000).fill(0).map((_, i) => ({ i, b: Buffer.alloc(100, i) })), Infinity],
		];
		for (const options of [{}, { useRecords: false }]) {
			const packr = new Packr(options);
			for (const [value, maxUnpacks] of values) {
				const stream = new UnpackrStream(options);
				const counter = countUnpacks(stream.unpackr);
				const outcome = receive(stream, 1);
				const encoded = packr.pack(value);
				for (const chunk of chunked(encoded, 16384)) stream.write(chunk); // not ended: the sender may be waiting
				const { received, error } = await outcome;
				assert.isUndefined(error, error?.message);
				assert.deepStrictEqual(received, [new Unpackr(options).unpack(encoded)]);
				assert.isAtMost(counter.calls, maxUnpacks);
			}
		}
	});

	test('held bytes are copied in bounded total', () => {
		// followed by another value, so the completing chunk holds more than the held value needs
		const encoded = Buffer.concat([new Packr().pack({ id: 1, payload: Buffer.alloc(4000000, 7) }), new Packr().pack({ id: 2 })]);
		const { allocUnsafe, concat } = Buffer;
		let allocated = 0;
		Buffer.allocUnsafe = function (size) {
			allocated += size;
			return allocUnsafe.apply(this, arguments);
		};
		Buffer.concat = function (list, length) {
			allocated += length;
			return concat.apply(this, arguments);
		};
		try {
			const values = [...decodeIter(chunked(encoded, 1000))];
			assert.equal(values[0].payload.length, 4000000);
			assert.equal(values[1].id, 2);
		} finally {
			Buffer.allocUnsafe = allocUnsafe;
			Buffer.concat = concat;
		}
		assert.isAtMost(allocated, 2.5 * encoded.length);
	});

	test('a Uint8Array from another realm is accepted while a value is held', async () => {
		const foreign = vm.runInNewContext('new Uint8Array([1, 2, 3, 4])');
		assert.deepStrictEqual([...decodeIter([Buffer.from([0xc4, 0x04]), foreign])], [Buffer.from([1, 2, 3, 4])]);
		const stream = new UnpackrStream();
		const outcome = receive(stream, 1);
		stream.write(Buffer.from([0xc4, 0x04]));
		stream.write(foreign);
		assert.deepStrictEqual((await outcome).received, [Buffer.from([1, 2, 3, 4])]);
	});

	test('a chunk that is not bytes is rejected while a value is held', async () => {
		assert.throws(() => [...decodeIter([Buffer.from([0xc4, 0x04]), 'ab'])], TypeError);
		const stream = new UnpackrStream();
		const outcome = receive(stream, 1);
		stream.write(Buffer.from([0xc4, 0x04]));
		stream.write('ab');
		assert.instanceOf((await outcome).error, TypeError);
	});

	test('a buffer reused by the caller is copied before it is held', async () => {
		const expected = [Buffer.from([1, 2, 3, 4, 5, 6])];
		function * chunks() {
			yield Buffer.from([0xc4, 0x06, 0x01]);
			const scratch = Buffer.from([2, 3]);
			yield scratch;
			scratch.set([4, 5]);
			yield scratch;
			yield Buffer.from([6]);
		}
		assert.deepStrictEqual([...decodeIter(chunks())], expected);
		const asyncValues = [];
		for await (const value of decodeIter((async function * () { yield * chunks(); })())) asyncValues.push(value);
		assert.deepStrictEqual(asyncValues, expected);
		const stream = new UnpackrStream();
		const outcome = receive(stream, 1);
		for (const chunk of chunks()) await new Promise(resolve => stream.write(chunk, resolve));
		assert.deepStrictEqual((await outcome).received, expected);
	});

	test('a value that completes past the limit is still unpacked', () => {
		assert.deepStrictEqual([...decodeIter([Buffer.from([0xc4, 0x06]), Buffer.from([1, 2, 3, 4, 5, 6])], { maxIncompleteBufferSize: 3 })],
			[Buffer.from([1, 2, 3, 4, 5, 6])]);
	});

	test('decodeIter honors maxIncompleteBufferSize', async () => {
		const chunks = () => [bin32Header, Buffer.alloc(10), Buffer.alloc(10)];
		const consumed = [];
		const counted = function * () {
			for (const chunk of chunks()) {
				consumed.push(chunk);
				yield chunk;
			}
		};
		assert.throws(() => [...decodeIter(counted(), { maxIncompleteBufferSize: 15 })], 'Maximum incomplete buffer size exceeded');
		assert.equal(consumed.length, 3);
		try {
			for await (const value of decodeIter((async function * () { yield * chunks(); })(), { maxIncompleteBufferSize: 15 }));
			assert.fail('should throw');
		} catch (error) {
			assert.equal(error.message, 'Maximum incomplete buffer size exceeded');
		}
		assert.throws(() => [...decodeIter(chunks(), { maxIncompleteBufferSize: Infinity })], /Unexpected end/);
		assert.throws(() => [...decodeIter([bin32Header, Buffer.alloc(0x4000000)])], 'Maximum incomplete buffer size exceeded');
	});

	test('values before an oversized remainder are delivered once, before the error', async () => {
		const bytes = Buffer.concat([Buffer.from([0x01, 0xa1, 0x61]), bin32Header, Buffer.alloc(20)]);
		const iterated = [];
		assert.throws(() => { for (const value of decodeIter([bytes], { maxIncompleteBufferSize: 10 })) iterated.push(value); },
			'Maximum incomplete buffer size exceeded');
		assert.deepStrictEqual(iterated, [1, 'a']);
		const stream = new UnpackrStream({ maxIncompleteBufferSize: 10 });
		const outcome = receive(stream, 3);
		stream.write(bytes);
		const { received, error } = await outcome;
		assert.deepStrictEqual(received, [1, 'a']);
		assert.equal(error?.message, 'Maximum incomplete buffer size exceeded');
	});

	test('values before a remainder that cannot be held are still delivered', () => {
		const from = Buffer.from;
		Buffer.from = function () {
			throw new RangeError('Array buffer allocation failed');
		};
		const iterated = [];
		try {
			assert.throws(() => { for (const value of decodeIter([new Uint8Array([0x01, 0xc4, 0x06, 0x02])])) iterated.push(value); },
				'Array buffer allocation failed');
		} finally {
			Buffer.from = from;
		}
		assert.deepStrictEqual(iterated, [1]);
	});

	test('empty chunks while waiting do not unpack again', async () => {
		const chunks = [Buffer.from([0x01, 0xa1]), ...new Array(1000).fill(Buffer.alloc(0)), Buffer.from([0x61])];
		assert.deepStrictEqual([...decodeIter(chunks)], [1, 'a']);
		const stream = new UnpackrStream();
		const counter = countUnpacks(stream.unpackr);
		const outcome = receive(stream, 2);
		for (const chunk of chunks) stream.write(chunk);
		assert.deepStrictEqual((await outcome).received, [1, 'a']);
		assert.equal(counter.calls, 2);
	});

	test('input ending before the declared length is reported', async () => {
		assert.throws(() => [...decodeIter([bin32Header, Buffer.alloc(100)])], /Unexpected end/);
		const stream = new UnpackrStream();
		const outcome = receive(stream, 1);
		stream.write(bin32Header);
		stream.write(Buffer.alloc(100));
		stream.end();
		assert.match((await outcome).error?.message, /Unexpected end/);
	});

	test('a length read past the end argument gives no hint', () => {
		// the array 16 length bytes are physically present but past end; dc 00 00 would complete it with two bytes
		const error = assertIncomplete(() => new Unpackr().unpack(Buffer.from([0xdc, 0xc1, 0xc1]), 1), 'dc');
		assert.isUndefined(error.missingBytes);
		assert.equal(assertIncomplete(() => new Unpackr().unpack(Buffer.from([0xdc, 0x00, 0x05])), 'dc 00 05').missingBytes, 5);
	});

	test('independent streams interleaved', async () => {
		const packr = new Packr();
		const values = [{ a: Buffer.alloc(100000, 1) }, ['x'.repeat(70000), 3]];
		const streams = values.map(() => new UnpackrStream());
		const outcomes = streams.map(stream => receive(stream, 1));
		const chunkLists = values.map(value => chunked(packr.pack(value), 1000));
		for (let i = 0; i < Math.max(...chunkLists.map(list => list.length)); i++)
			chunkLists.forEach((list, s) => list[i] && streams[s].write(list[i]));
		for (let s = 0; s < values.length; s++)
			assert.deepStrictEqual((await outcomes[s]).received, [values[s]]);
	});

	const sequence = [{ a: 'hello', bin: Buffer.alloc(300, 1) }, 'x'.repeat(300), 'k'.repeat(70000), [1, 2.5, 'three'],
		new Array(300).fill(0).map((_, i) => i), new Map([[1, Buffer.alloc(70000, 2)]]), { a: 'again', b: [1] }];
	test('decodeIter reassembles a sequence cut into chunks of every size', () => {
		for (const options of [{}, { useRecords: false }]) {
			const packr = new Packr(options);
			const encoded = Buffer.concat(sequence.map(item => packr.pack(item)));
			const expected = new Unpackr(options).unpackMultiple(encoded);
			for (let size = 1; size < encoded.length; size = size < 64 ? size + 1 : size * 2 + 1)
				assert.deepStrictEqual([...decodeIter(chunked(encoded, size), options)], expected, `${JSON.stringify(options)} size ${size}`);
		}
	});
});

suite('end beyond the source', function () {
	test('reads nothing past the end of the source view', () => {
		// a Buffer view into a shared ArrayBuffer (as Node's Buffer pool hands out), followed by other data
		const shared = new Uint8Array(256);
		shared.set(Buffer.from('SECRET-PASSWORD!'), 2);
		const view = Buffer.from(shared.buffer, 0, 2);
		view[0] = 0x91; view[1] = 0xb0; // [fixstr(16)], whose body lies outside the view
		for (const end of [18, 200]) {
			try {
				const value = new Unpackr().unpack(view, { end });
				assert.fail('should not unpack: ' + JSON.stringify(value));
			} catch (error) {
				assert.notInclude(error.message, 'SECRET', `end ${end}`);
				assert.isTrue(error.incomplete, error.message);
			}
		}
	});
});
