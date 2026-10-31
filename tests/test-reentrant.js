import { assert } from 'chai';
import { Packr, Unpackr, addExtension, unpackMultiple } from '../node-index.js';

const extensionType = 0x30;

function extension(bytes) {
	return Buffer.concat([Buffer.from([0xc7, bytes.length, extensionType]), bytes]);
}

suite('reentrant unpackMultiple', () => {
	for (const mode of ['another instance', 'same instance', 'exported function']) {
		test(`restores the outer array with ${mode}`, () => {
			const outer = new Unpackr();
			const inner = mode === 'same instance' ? outer : new Unpackr();
			addExtension({ type: extensionType, unpack: bytes => mode === 'exported function' ? unpackMultiple(bytes) : inner.unpackMultiple(bytes) });
			const source = Buffer.concat([Buffer.from([0x92]), extension(Buffer.from([1, 2, 3, 4])), Buffer.from([5])]);
			assert.deepStrictEqual(outer.unpack(source), [[1, 2, 3, 4], 5]);
			assert.deepStrictEqual(outer.unpackMultiple(Buffer.from([6, 7])), [6, 7]);
		});
	}

	test('restores each level of nested multi-value extensions', () => {
		const unpackr = new Unpackr();
		addExtension({ type: extensionType, unpack: bytes => unpackr.unpackMultiple(bytes) });
		const nested = Buffer.concat([Buffer.from([1]), extension(Buffer.from([2, 3])), Buffer.from([4])]);
		const source = Buffer.concat([Buffer.from([0x92]), extension(nested), Buffer.from([5])]);
		assert.deepStrictEqual(unpackr.unpack(source), [[1, [2, 3], 4], 5]);
	});

	for (const stopAfter of [1, 2, 3]) {
		test(`restores the outer decode after a nested callback stops at ${stopAfter}`, () => {
			const received = [];
			addExtension({ type: extensionType, unpack(bytes) {
				new Unpackr().unpackMultiple(bytes, (value, start, end) => {
					received.push([value, start, end]);
					return received.length < stopAfter;
				});
				return 'nested';
			} });
			const source = Buffer.concat([Buffer.from([0x92]), extension(Buffer.from([1, 0xcc, 128, 3])), Buffer.from([5])]);
			assert.deepStrictEqual(new Unpackr().unpack(source), ['nested', 5]);
			assert.deepStrictEqual(received, [[1, 0, 1], [128, 1, 3], [3, 3, 4]].slice(0, stopAfter));
		});
	}

	test('a callback can read another sequence, including after the final value', () => {
		const unpackr = new Unpackr();
		const received = [];
		unpackr.unpackMultiple(Buffer.from([1, 0xcc, 128, 3]), (value, start, end) => {
			received.push([value, start, end]);
			assert.deepStrictEqual(unpackr.unpackMultiple(Buffer.from([4, 5])), [4, 5]);
		});
		assert.deepStrictEqual(received, [[1, 0, 1], [128, 1, 3], [3, 3, 4]]);
	});

	test('restores outer record definitions overwritten by the nested sequence', () => {
		const outerPackr = new Packr({ sequential: true, maxSharedStructures: 0 });
		const innerPackr = new Packr({ sequential: true, maxSharedStructures: 0 });
		const before = Buffer.from(outerPackr.pack({ outer: 1 }));
		const after = Buffer.from(outerPackr.pack({ outer: 4 }));
		const nested = Buffer.concat([Buffer.from(innerPackr.pack({ inner: 2 })), Buffer.from(innerPackr.pack({ inner: 3 }))]);
		const unpackr = new Unpackr();
		addExtension({ type: extensionType, unpack: bytes => unpackr.unpackMultiple(bytes) });
		const source = Buffer.concat([Buffer.from([0x93]), before, extension(nested), after]);
		assert.deepStrictEqual(unpackr.unpack(source), [{ outer: 1 }, [{ inner: 2 }, { inner: 3 }], { outer: 4 }]);
	});

	test('a caught nested truncation preserves the outer source and error offsets', () => {
		const unpackr = new Unpackr();
		let caught;
		addExtension({ type: extensionType, unpack(bytes) {
			try {
				unpackr.unpackMultiple(bytes);
			} catch (error) {
				caught = error;
				return 'caught';
			}
		} });
		const source = Buffer.concat([Buffer.from([0x92]), extension(Buffer.from([1, 0xa2, 0x61])), Buffer.from([5])]);
		assert.deepStrictEqual(unpackr.unpack(source), ['caught', 5]);
		assert.isTrue(caught.incomplete);
		assert.equal(caught.lastPosition, 1);
		assert.deepStrictEqual(caught.values, [1]);
		assert.deepStrictEqual(unpackr.unpackMultiple(Buffer.from([6, 7])), [6, 7]);
	});

	test('an uncaught nested truncation is fatal for a complete outer value', () => {
		const unpackr = new Unpackr();
		addExtension({ type: extensionType, unpack: bytes => unpackr.unpackMultiple(bytes) });
		const source = Buffer.concat([Buffer.from([0x92]), extension(Buffer.from([1, 0xa2, 0x61])), Buffer.from([5])]);
		let caught;
		try {
			unpackr.unpack(source);
		} catch (error) {
			caught = error;
		}
		assert.match(caught.message, /Unexpected end/);
		assert.isFalse(caught.incomplete);
		assert.deepStrictEqual(unpackr.unpackMultiple(Buffer.from([6, 7])), [6, 7]);
	});
});
