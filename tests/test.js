import chai from 'chai';
import * as msgpackr from '../node-index.js';
//inspector.open(9229, null, true); debugger
import { readFileSync } from 'fs';
let allSampleData = [];
for (let i = 1; i < 6; i++) {
	allSampleData.push(JSON.parse(readFileSync(new URL(`./example${i > 1 ? i : ''}.json`, import.meta.url))));
}
allSampleData.push({
	name: 'some other types',
	date: new Date(),
	empty: '',
});
const sampleData = allSampleData[3];
function tryRequire(module) {
	try {
		return require(module);
	} catch(error) {
		return {};
	}
}

let seed = 0;
function random() {
	seed++;
	let a = seed * 15485863;
	return (a * a * a % 2038074743) / 2038074743;
}
//if (typeof chai === 'undefined') { chai = require('chai') }
var assert = chai.assert;
//if (typeof msgpackr === 'undefined') { msgpackr = require('..') }
var Packr = msgpackr.Packr;
var Unpackr = msgpackr.Unpackr;
var unpack = msgpackr.unpack;
var unpackMultiple = msgpackr.unpackMultiple;
var roundFloat32 = msgpackr.roundFloat32;
var pack = msgpackr.pack;
var DECIMAL_FIT = msgpackr.FLOAT32_OPTIONS.DECIMAL_FIT;

var addExtension = msgpackr.addExtension;
var zlib = tryRequire('zlib');
var deflateSync = zlib.deflateSync;
var inflateSync = zlib.inflateSync;
var deflateSync = zlib.brotliCompressSync;
var inflateSync = zlib.brotliDecompressSync;
var constants = zlib.constants;
try {
//	var { decode, encode } = require('msgpack-lite')
} catch (error) {}

var ITERATIONS = 4000;

class ExtendArray extends Array {
}

class ExtendArray2 extends Array {
}

class ExtendArray3 extends Array {
}


class ExtendObject {
}


suite('msgpackr basic tests', function() {
	test('pack/unpack data', function () {
		var data = {
			data: [
				{a: 1, name: 'one', type: 'odd', isOdd: true},
				{a: 2, name: 'two', type: 'even'},
				{a: 3, name: 'three', type: 'odd', isOdd: true},
				{a: 4, name: 'four', type: 'even'},
				{a: 5, name: 'five', type: 'odd', isOdd: true},
				{a: 6, name: 'six', type: 'even', isOdd: null}
			],
			description: 'some names',
			types: ['odd', 'even'],
			convertEnumToNum: [
				{prop: 'test'},
				{prop: 'test'},
				{prop: 'test'},
				{prop: 1},
				{prop: 2},
				{prop: [undefined]},
				{prop: null}
			]
		};
		let structures = [];
		let packr = new Packr({structures});
		var serialized = packr.pack(data);
		serialized = packr.pack(data);
		serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data);
	});

	test('mixed structures', function () {
		let data1 = {a: 1, b: 2, c: 3};
		let data2 = {a: 1, b: 2, d: 4};
		let data3 = {a: 1, b: 2, e: 5};
		let structures = [];
		let packr = new Packr({structures});
		var serialized = packr.pack(data1);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data1);
		var serialized = packr.pack(data2);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data2);
		var serialized = packr.pack(data3);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data3);
	});

	test('mixed array', function () {
		var data = [
			'one',
			'two',
			'one',
			10,
			11,
			null,
			true,
			'three',
			'three',
			'one', [
				3, -5, -50, -400, 1.3, -5.3, true
			]
		];
		let structures = [];
		let packr = new Packr({structures});
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data);
	});
	test('255 chars', function () {
		const data = 'RRZG9A6I7xupPeOZhxcOcioFsuhszGOdyDUcbRf4Zef2kdPIfC9RaLO4jTM5JhuZvTsF09fbRHMGtqk7YAgu3vespeTe9l61ziZ6VrMnYu2CamK96wCkmz0VUXyqaiUoTPgzk414LS9yYrd5uh7w18ksJF5SlC2e91rukWvNqAZJjYN3jpkqHNOFchCwFrhbxq2Lrv1kSJPYCx9blRg2hGmYqTbElLTZHv20iNqwZeQbRMgSBPT6vnbCBPnOh1W';
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.equal(deserialized, data);
	});
	test('overlong UTF-8 string', function () {
		const payload = Buffer.concat([
			Buffer.from([0xa2]),         // msgpack fixstr, 2 bytes
			Buffer.from([0xc0, 0xaf]),   // overlong "/"
		]);

		const result = unpack(payload);
		assert.notEqual(result, '/');
	});
	test('invalid UTF-8 continuation bytes', function () {
		const replacement = '\uFFFD';
		const strings = [
			[[0xc2, 0x41], replacement + 'A'],
			[[0xe1, 0x41, 0x42], replacement + 'AB'],
			[[0xe1, 0x80, 0x41], replacement + 'A'],
			[[0xf1, 0x41, 0x42, 0x43], replacement + 'ABC'],
			[[0xf1, 0x80, 0x41, 0x42], replacement + 'AB'],
			[[0xf1, 0x80, 0x80, 0x41], replacement + 'A'],
		];
		for (const [bytes, expected] of strings) {
			const payload = Buffer.from([0xa0 + bytes.length, ...bytes]);
			assert.equal(unpack(payload), expected);
		}
	});
	test('truncated UTF-8 sequences do not consume following values', function () {
		assert.deepEqual(unpack(Buffer.from([0x92, 0xa1, 0xc2, 0x01])), ['\uFFFD', 1]);
		assert.deepEqual(unpack(Buffer.from([0x92, 0xa2, 0xe1, 0x80, 0x01])), ['\uFFFD', 1]);
		assert.deepEqual(unpack(Buffer.from([0x92, 0xa3, 0xf1, 0x80, 0x80, 0x01])), ['\uFFFD', 1]);
		assert.deepEqual(
			unpack(Buffer.from([0x93, 0xa1, 0xe0, 0xa4, 0x6e, 0x65, 0x78, 0x74, 0x07])),
			['\uFFFD', 'next', 7]
		);
	});
	test('use ArrayBuffer', function () {
		const data = {prop: 'a test'};
		var serialized = pack(data);
		let ab = new ArrayBuffer(serialized.length);
		let u8 = new Uint8Array(ab);
		u8.set(serialized);
		var deserialized = unpack(ab);
		assert.deepEqual(deserialized, data);
	});

	for (let sampleData of allSampleData) {
		let snippet = JSON.stringify(sampleData).slice(0, 20) + '...';
		test('pack/unpack sample data ' + snippet, function () {
			var data = sampleData;
			let structures = [];
			var serialized = pack(data);
			var deserialized = unpack(serialized);
			assert.deepEqual(deserialized, data);
			var serialized = pack(data);
			var deserialized = unpack(serialized);
			assert.deepEqual(deserialized, data);
		});
		test('pack/unpack sample data with Uint8Array encoding' + snippet, function () {
			var data = sampleData;
			let structures = [];
			var serialized = pack(data);
			serialized = new Uint8Array(serialized);
			var deserialized = unpack(serialized);
			assert.deepEqual(deserialized, data);
			var serialized = pack(data);
			var deserialized = unpack(serialized);
			assert.deepEqual(deserialized, data);
		});
		test('pack/unpack sample data with bundled strings ' + snippet, function () {
			var data = sampleData;
			let packr = new Packr({ /*structures,*/ useRecords: false, bundleStrings: true});
			var serialized = packr.pack(data);
			var deserialized = packr.unpack(serialized);
			assert.deepEqual(deserialized, data);
		});
	}

	test('pack/unpack sample data with useRecords function', function () {
		var data = [
			{id: 1, type: 1, labels: {a: 1, b: 2}},
			{id: 2, type: 1, labels: {b: 1, c: 2}},
			{id: 3, type: 1, labels: {d: 1, e: 2}}
		];

		var alternatives = [
			{useRecords: false}, // 88 bytes
			{useRecords: true}, // 58 bytes
			{mapsAsObjects: true, useRecords: (v)=>!!v.id}, // 55 bytes
			{mapsAsObjects: true, variableMapSize: true, useRecords: (v)=>!!v.id} // 49 bytes
		];

		for(let o of alternatives) {
			let packr = new Packr(o);
			var serialized = packr.pack(data);
			var deserialized = packr.unpack(serialized);
			assert.deepEqual(deserialized, data);
		}
	});

	test('mapAsEmptyObject combination', function () {
		const msgpackr = new Packr({ useRecords: false, encodeUndefinedAsNil: true, variableMapSize: true, mapAsEmptyObject: true, setAsEmptyObject: true  });

		const map = new Map();
		map.set('a', 1);
		map.set('b', 2);
		const set = new Set();
		set.add('a');
		set.add('b');
		const input = { map, set };

		const packed = msgpackr.pack(input);
		const unpacked = msgpackr.unpack(packed);
		assert.deepEqual(unpacked.map, {});
		assert.deepEqual(unpacked.set, {});
	});
	test('pack/unpack numeric coercible keys', function () {
		var data = { a: 1, 2: 'test', '-3.45': 'test2'};
		let packr = new Packr({variableMapSize: true, coercibleKeyAsNumber: true, useRecords: false});
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data);
	});
	test('pack/unpack empty data with bundled strings', function () {
		var data = {};
		let packr = new Packr({bundleStrings: true});
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data);
	});
	test('pack/unpack large amount of chinese characters', function() {
		const MSGPACK_OPTIONS = {bundleStrings: true};

		const item = {
			message: '你好你好你好你好你好你好你好你好你好', // some Chinese characters
		};

		testSize(100);
		testSize(1000);
		testSize(10000);
		function testSize(size) {
			const list = [];
			for (let i = 0; i < size; i++) {
				list.push({...item});
			}

			const packer = new Packr(MSGPACK_OPTIONS);
			const unpacker = new Unpackr(MSGPACK_OPTIONS);
			const encoded = packer.pack(list);
			const decoded = unpacker.unpack(encoded);
			assert.deepEqual(list, decoded);
		}
	});
	test('pack/unpack sequential data', function () {
		var data = {foo: 1, bar: 2};
		let packr = new Packr({sequential: true});
		let unpackr = new Unpackr({sequential: true});
		var serialized = packr.pack(data);
		var deserialized = unpackr.unpack(serialized);
		assert.deepEqual(deserialized, data);
		var serialized = packr.pack(data);
		var deserialized = unpackr.unpack(serialized);
		assert.deepEqual(deserialized, data);
	});
	test('pack/unpack with bundled strings and sequential', function () {
		const options = {
			bundleStrings: true,
			sequential: true,
		};

		const packer = new Packr(options);
		const unpacker = new Packr(options);

		const data = {data: 42}; // key length >= 4

		unpacker.unpackMultiple(Buffer.concat([
			packer.pack(data),
			packer.pack(data)
		]));
	});
	if (typeof Buffer != 'undefined')
	test('replace data', function(){
		var data1 = {
			data: [
				{ a: 1, name: 'one', type: 'odd', isOdd: true, a: '13 characters' },
				{ a: 2, name: 'two', type: 'even', a: '11 characte' },
				{ a: 3, name: 'three', type: 'odd', isOdd: true, a: '12 character' },
				{ a: 4, name: 'four', type: 'even', a: '9 charact'},
				{ a: 5, name: 'five', type: 'odd', isOdd: true, a: '14 characters!' },
				{ a: 6, name: 'six', type: 'even', isOdd: null }
			],
		};
		var data2 = {
			data: [
				{ foo: 7, name: 'one', type: 'odd', isOdd: true },
				{ foo: 8, name: 'two', type: 'even'},
				{ foo: 9, name: 'three', type: 'odd', isOdd: true },
				{ foo: 10, name: 'four', type: 'even'},
				{ foo: 11, name: 'five', type: 'odd', isOdd: true },
				{ foo: 12, name: 'six', type: 'even', isOdd: null }
			],
		};
		var serialized1 = pack(data1);
		var serialized2 = pack(data2);
		var b = Buffer.alloc(8000);
		serialized1.copy(b);
		var deserialized1 = unpack(b, serialized1.length);
		serialized2.copy(b);
		var deserialized2 = unpack(b, serialized2.length);
		assert.deepEqual(deserialized1, data1);
		assert.deepEqual(deserialized2, data2);
	});

	test('compact 123', function() {
		assert.equal(pack(123).length, 1);
	});

	test('BigInt', function() {
		let packr = new Packr({ useBigIntExtension: true });
		let data = {
			a: 3333333333333333333333333333n,
			b: 1234567890123456789012345678901234567890n,
			c: -3333333333333333333333333333n,
			d: -352523523642364364364264264264264264262642642n,
			e: 0xffffffffffffffffffffffffffn,
			f: -0xffffffffffffffffffffffffffn,
			g: (1234n << 123n) ^ (5678n << 56n) ^ 890n,
			h: (-1234n << 123n) ^ (5678n << 56n) ^ 890n,
			i: (1234n << 1234n) ^ (5678n << 567n) ^ 890n,
			j: (-1234n << 1234n) ^ (5678n << 567n) ^ 890n,
			k: 0xdeadn << 0xbeefn,
			l: -0xdeadn << 0xbeefn,
			m: 11n << 0x11111n ^ 111n,
			n: -11n << 0x11111n ^ 111n,
			o: 12345678901234567890n,
			p: -12345678901234567890n,
			exp: [],
			expexp: [],
		};

		for (let n = 1n; n.toString(16).length * 4 < 1500; n <<= 1n, n |= BigInt(Math.floor(Math.random() * 2))) {
			data.exp.push(n, -n);
		}

		for (let n = 7n; n.toString(16).length * 4 < 150000; n *= n) {
			data.expexp.push(n, -n);
		}

		let serialized = packr.pack(data);
		let deserialized = packr.unpack(serialized);
		assert.deepEqual(data, deserialized);
	});


	test('extended class pack/unpack', function(){
		function Extended() {

		}
		Extended.prototype.getDouble = function() {
			return this.value * 2;
		};
		var instance = new Extended();
		instance.value = 4;
		instance.string = 'decode this: ᾜ';
		var data = {
			prop1: 'has multi-byte: ᾜ',
			extendedInstance: instance,
			prop2: 'more string',
			num: 3,
		};
		let packr = new Packr();
		addExtension({
			Class: Extended,
			type: 11,
			unpack: function(buffer) {
				let e = new Extended();
				let data = packr.unpack(buffer);
				e.value = data[0];
				e.string = data[1];
				return e;
			},
			pack: function(instance) {
				return packr.pack([instance.value, instance.string]);
			}
		});
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(data, deserialized);
		assert.equal(deserialized.extendedInstance.getDouble(), 8);
	});

	test('extended Array class read/write', function(){
		var instance = new ExtendArray();
		instance.push(0);
		instance.push(1);
		instance.push(2);
		var data = {
			prop1: 'has multi-byte: ᾜ',
			extendedInstance: instance,
			prop2: 'more string',
			num: 3,
		};
		let packr = new Packr();
		addExtension({
			Class: ExtendArray,
			type: 12,
			read: function(data) {
				Object.setPrototypeOf(data, ExtendArray.prototype);
				return data;
			},
			write: function(instance) {
				return [...instance];
			}
		});
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.strictEqual(Object.getPrototypeOf(deserialized.extendedInstance), ExtendArray.prototype);
		assert.deepEqual(data, deserialized);
	});

	test('unregistered extended Array class read/write', function(){
		var instance = new ExtendArray2();
		instance.push(0);
		instance.push(1);
		instance.push(2);
		var data = {
			prop1: 'has multi-byte: ᾜ',
			extendedInstance: instance,
			prop2: 'more string',
			num: 3,
		};
		let packr = new Packr();
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.strictEqual(Object.getPrototypeOf(deserialized.extendedInstance), Array.prototype);
		assert.deepEqual(data, deserialized);
	});


	test('unregistered extended Object class read/write', function(){
		var instance = new ExtendObject();
		instance.test1 = "string";
		instance.test2 = 3421321;
		var data = {
			prop1: 'has multi-byte: ᾜ',
			extendedInstance: instance,
			prop2: 'more string',
			num: 3,
		};
		let packr = new Packr();
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.strictEqual(Object.getPrototypeOf(deserialized.extendedInstance), Object.prototype);
		assert.deepEqual(data, deserialized);
	});

	test('extended class pack/unpack custom size', function(){
		function TestClass() {

		}
		addExtension({
			Class: TestClass,
			type: 0x01,
			pack() {
				return typeof Buffer != 'undefined' ? Buffer.alloc(256) : new Uint8Array(256);
			},
			unpack(data) {
				return data.length;
			}
		});
		let result = unpack(pack(new TestClass()));
		assert.equal(result, 256);
	});

	test('extended class read/write', function(){
		function Extended() {

		}
		Extended.prototype.getDouble = function() {
			return this.value * 2;
		};
		var instance = new Extended();
		instance.value = 4;
		instance.string = 'decode this: ᾜ';
		var data = {
			prop1: 'has multi-byte: ᾜ',
			extendedInstance: instance,
			prop2: 'more string',
			num: 3,
		};
		let packr = new Packr();
		addExtension({
			Class: Extended,
			type: 12,
			read: function(data) {
				let e = new Extended();
				e.value = data[0];
				e.string = data[1];
				return e;
			},
			write: function(instance) {
				return [instance.value, instance.string];
			}
		});
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(data, deserialized);
		assert.equal(deserialized.extendedInstance.getDouble(), 8);
	});
	test('extended class return self', function(){
		function Extended() {

		}
		Extended.prototype.getDouble = function() {
			return this.value * 2;
		};
		var instance = new Extended();
		instance.value = 4;
		instance.string = 'decode this: ᾜ';
		var data = {
			prop1: 'has multi-byte: ᾜ',
			extendedInstance: instance,
			prop2: 'more string',
			num: 3,
		};
		let packr = new Packr();
		addExtension({
			Class: Extended,
			type: 13,
			read: function(data) {
				Object.setPrototypeOf(data, Extended.prototype);
				return data;
			},
			write: function(data) {
				return data;
			}
		});
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(data, deserialized);
		assert.strictEqual(Object.getPrototypeOf(deserialized.extendedInstance), Extended.prototype);
		assert.equal(deserialized.extendedInstance.getDouble(), 8);
	});
	test('extended Array class return self', function(){
		var instance = new ExtendArray3();
		instance.push(0);
		instance.push('has multi-byte: ᾜ');
		var data = {
			prop1: 'has multi-byte: ᾜ',
			extendedInstance: instance,
			prop2: 'more string',
			num: 3,
		};
		let packr = new Packr();
		addExtension({
			Class: ExtendArray3,
			type: 14,
			read: function(data) {
				Object.setPrototypeOf(data, ExtendArray3.prototype);
				return data;
			},
			write: function(data) {
				return data;
			}
		});
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(data, deserialized);
		assert.strictEqual(Object.getPrototypeOf(deserialized.extendedInstance), ExtendArray3.prototype);
		assert.equal(deserialized.extendedInstance[0], 0);
	});

	test('extended class pack/unpack proxied', function(){
		function Extended() {

		}
		Extended.prototype.__call__ = function(){
			return this.value * 4;
		};
		Extended.prototype.getDouble = function() {
			return this.value * 2;
		};

		var instance = function() { instance.__call__();/* callable stuff */ };
		Object.setPrototypeOf(instance,Extended.prototype);

		instance.value = 4;
		var data = instance;

		let packr = new Packr();
		addExtension({
			Class: Extended,
			type: 15,
			unpack: function(buffer) {
				var e = function() { e.__call__(); };
				Object.setPrototypeOf(e,Extended.prototype);
				e.value = packr.unpack(buffer);
				return e;
			},
			pack: function(instance) {
				return packr.pack(instance.value);
			}
		});
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.equal(deserialized.getDouble(), 8);
	});

	test('reentrant pack on same instance with nonzero start', function() {
		class NestedBlob {
			constructor(meta, prepacked) {
				this.meta = meta;
				if (prepacked)
					this.prepacked = prepacked;
			}
		}
		addExtension({
			Class: NestedBlob,
			type: 16,
			pack(blob) {
				return blob.prepacked || pack(blob.meta);
			},
			unpack(buffer) {
				return new NestedBlob(unpack(buffer));
			}
		});

		const innerPrepacked = Buffer.from(pack({ inner: true }));
		const metaPrepacked = Buffer.from(pack({
			name: 'file.txt',
			size: 40020,
			nested: new NestedBlob(null, innerPrepacked)
		}));
		const expectedBytes = Buffer.from(pack({
			id: 'rec-1',
			blob: new NestedBlob(null, metaPrepacked),
			after: 'tail'
		}));

		const warmup = pack({ control: 'warmup-frame', seq: 1 });
		assert.deepEqual(unpack(warmup), { control: 'warmup-frame', seq: 1 });

		const payload = {
			id: 'rec-1',
			blob: new NestedBlob({
				name: 'file.txt',
				size: 40020,
				nested: new NestedBlob({ inner: true })
			}),
			after: 'tail'
		};
		const serialized = pack(payload);
		assert.equal(serialized.length, expectedBytes.length);
		assert.deepEqual(Buffer.from(serialized), expectedBytes);
		const deserialized = unpack(serialized);
		assert.deepEqual(deserialized, payload);
	});

	test('reentrant pack with records, bundleStrings, and structuredClone', function() {
		let activePackr;
		class NestedRecordExt {
			constructor(value) {
				this.value = value;
			}
		}
		addExtension({
			Class: NestedRecordExt,
			type: 17,
			pack(inst) {
				return activePackr.pack(inst.value);
			},
			unpack(buffer) {
				return new NestedRecordExt(activePackr.unpack(buffer));
			}
		});

		activePackr = new Packr({ bundleStrings: true, structuredClone: true });
		activePackr.pack({ warmup: 'initial frame to advance buffer position' });

		const sharedOuter = { label: 'shared-outer-string' };
		const sharedInner = { label: 'shared-inner-string' };
		const richPayload = {
			first: { a: 'first-bundled-string', b: 1 },
			ref1: sharedOuter,
			ext: new NestedRecordExt({
				sameShape: { a: 'inner-bundled-string', b: 2 },
				innerOther: { x: 'another-inner-string', y: 3 },
				innerRef1: sharedInner,
				innerRef2: sharedInner
			}),
			second: { a: 'second-bundled-string', b: 4 },
			third: { c: 'third-bundled-string', d: 5 },
			ref2: sharedOuter
		};
		const richSerialized = activePackr.pack(richPayload);
		const richDeserialized = activePackr.unpack(richSerialized);
		assert.deepEqual(richDeserialized, richPayload);
		assert.equal(richDeserialized.ref1, richDeserialized.ref2);
		assert.equal(richDeserialized.ext.value.innerRef1, richDeserialized.ext.value.innerRef2);
	});

	let activePackr;
	let capturedNestedBuffers = [];
	class SharedNestedExt {
		constructor(value) {
			this.value = value;
		}
	}
	addExtension({
		Class: SharedNestedExt,
		type: 18,
		pack(inst) {
			const buf = Buffer.from(activePackr.pack(inst.value));
			capturedNestedBuffers.push(buf);
			return buf;
		},
		unpack(buffer) {
			return new SharedNestedExt(activePackr.unpack(buffer));
		}
	});

	test('reentrant pack clears leftover unpack structures before nested pack', function() {
		const leftoverPackr = new Packr({
			structures: []
		});
		leftoverPackr.unpack(new Packr().pack({ leftoverA: 1 }));
		activePackr = leftoverPackr;
		const leftoverEncoded = leftoverPackr.pack([new SharedNestedExt({ a: 1 })]);
		const leftoverReader = new Packr({
			structures: leftoverPackr.structures.slice(0, leftoverPackr.structures.sharedLength)
		});
		activePackr = leftoverReader;
		assert.deepEqual(leftoverReader.unpack(leftoverEncoded), [new SharedNestedExt({ a: 1 })]);
	});

	test('reentrant pack with shared structures, saveStructures decline, and promotion', function() {
		let persistedStructures = [['concurrentA', 'concurrentB']];
		let saveCount = 0;
		let declinedOnce = false;
		activePackr = new Packr({
			structures: [],
			saveStructures(structures, isCompatible) {
				if (!isCompatible(persistedStructures.slice(0))) {
					declinedOnce = true;
					return false;
				}
				saveCount++;
				persistedStructures = structures.slice(0);
			}
		});

		capturedNestedBuffers = [];
		const nestedPayload = {
			beforeNested: { sharedBothA: 1, sharedBothB: 2 },
			nested: new SharedNestedExt({
				sameAsOuter: { sharedBothA: 3, sharedBothB: 4 },
				innerShape: { innerA: 30, innerB: 40 },
				nestedOnly: { onlyInnerA: 50, onlyInnerB: 60 }
			}),
			outerShape: { outerA: 10, outerB: 20 },
			afterInner: { innerA: 70, innerB: 80 }
		};
		const encoded = activePackr.pack(nestedPayload);
		assert.equal(declinedOnce, true);
		assert.equal(saveCount, 1);
		assert.equal(persistedStructures.length, 7);
		assert.equal(capturedNestedBuffers.length, 2);

		const encodedSecond = activePackr.pack(nestedPayload);
		assert.equal(saveCount, 1);
		assert.equal(capturedNestedBuffers.length, 3);
		assert(capturedNestedBuffers[2].length < capturedNestedBuffers[1].length, 'second pack should reuse promoted nested-only structures as shared references');

		const readerPackr = new Packr({ structures: persistedStructures });
		activePackr = readerPackr;
		assert.deepEqual(readerPackr.unpack(encoded), nestedPayload);
		assert.deepEqual(readerPackr.unpack(encodedSecond), nestedPayload);
		assert.deepEqual(new Packr({ structures: [['concurrentA', 'concurrentB']] }).unpack(capturedNestedBuffers[0]), {
			sameAsOuter: { sharedBothA: 3, sharedBothB: 4 },
			innerShape: { innerA: 30, innerB: 40 },
			nestedOnly: { onlyInnerA: 50, onlyInnerB: 60 }
		}, 'escaped nested buffer from declined first attempt should decode standalone');

		let packedStructuresBlob;
		const selfSavingPackr = new Packr({
			structures: [],
			saveStructures(structures) {
				packedStructuresBlob = Buffer.from(selfSavingPackr.pack(structures));
			}
		});
		activePackr = selfSavingPackr;
		const selfSavedPayload = {
			outer: { a: 1, b: 2 },
			nested: new SharedNestedExt({ innerKey: 3 })
		};
		const selfSavedEncoded = Buffer.from(selfSavingPackr.pack(selfSavedPayload));
		const unpackedStructures = selfSavingPackr.unpack(packedStructuresBlob);
		const selfSavedReader = new Packr({ structures: unpackedStructures });
		activePackr = selfSavedReader;
		assert.deepEqual(selfSavedReader.unpack(selfSavedEncoded), selfSavedPayload, 'saveStructures packing on same Packr instance should round-trip');

		let sharedStore = [['baseA', 'baseB']];
		const makeStorePackr = () => new Packr({
			getStructures() {
				return sharedStore.map(keys => keys.slice(0));
			},
			saveStructures(structures, isCompatible) {
				if (!isCompatible(sharedStore.map(keys => keys.slice(0))))
					return false;
				sharedStore = structures.map(keys => keys.slice(0));
			},
			shouldShareStructure(keys) {
				return !keys.includes('ownOnlyKey');
			}
		});
		const writer1 = makeStorePackr();
		const writer2 = makeStorePackr();
		writer1.pack({ baseA: 1, baseB: 2 });
		writer2.pack([
			{ w2Slot1A: 10, w2Slot1B: 20 },
			{ w2Slot2A: 30, w2Slot2B: 40 }
		]);
		const writer2Buf = Buffer.from(writer2.pack({ w2Slot2A: 30, w2Slot2B: 40 }));
		let unpackedDuringPack = [];
		class UnpackBeforeNestedPack {
			constructor(value) {
				this.value = value;
			}
			toJSON() {
				unpackedDuringPack.push(writer1.unpack(writer2Buf));
				return new SharedNestedExt(this.value);
			}
		}
		activePackr = writer1;
		capturedNestedBuffers = [];
		const midPackMergePayload = [
			{ outerUnsavedA: 1, outerUnsavedB: 2 },
			{ ownOnlyKey: 3, extra: 4 },
			new UnpackBeforeNestedPack({
				sameAsUnsavedOuter: { outerUnsavedA: 5, outerUnsavedB: 6 },
				sameAsW2: { w2Slot1A: 7, w2Slot1B: 8 },
				nestedFresh: { freshNestedA: 9, freshNestedB: 10 }
			}),
			{ ownOnlyKey: 11, extra: 12 },
			{ outerUnsavedA: 13, outerUnsavedB: 14 }
		];
		const midPackMergeEncoded = Buffer.from(writer1.pack(midPackMergePayload));
		assert.equal(unpackedDuringPack.length, 2, 'outer pack should retry after mid-pack unpack structure merge and declined first save');
		assert.equal(capturedNestedBuffers.length, 2);
		const standaloneStoreReader = makeStorePackr();
		activePackr = standaloneStoreReader;
		assert.deepEqual(standaloneStoreReader.unpack(capturedNestedBuffers[0]), {
			sameAsUnsavedOuter: { outerUnsavedA: 5, outerUnsavedB: 6 },
			sameAsW2: { w2Slot1A: 7, w2Slot1B: 8 },
			nestedFresh: { freshNestedA: 9, freshNestedB: 10 }
		}, 'escaped nested buffer after mid-pack unpack merge must not emit unsaved outer shared ids');
		assert.deepEqual(standaloneStoreReader.unpack(midPackMergeEncoded), [
			{ outerUnsavedA: 1, outerUnsavedB: 2 },
			{ ownOnlyKey: 3, extra: 4 },
			new SharedNestedExt({
				sameAsUnsavedOuter: { outerUnsavedA: 5, outerUnsavedB: 6 },
				sameAsW2: { w2Slot1A: 7, w2Slot1B: 8 },
				nestedFresh: { freshNestedA: 9, freshNestedB: 10 }
			}),
			{ ownOnlyKey: 11, extra: 12 },
			{ outerUnsavedA: 13, outerUnsavedB: 14 }
		], 'outer pack should preserve own structures and re-pack cleanly after mid-pack unpack merge');

		const writer2Buf2 = Buffer.from(writer2.pack({ w2Slot3A: 50, w2Slot3B: 60 }));
		let cleanMergeUnpacked = 0;
		class UnpackCleanMergeBeforeNestedPack {
			toJSON() {
				cleanMergeUnpacked++;
				writer1.unpack(writer2Buf2);
				return new SharedNestedExt({ cleanNestedKey: 77 });
			}
		}
		activePackr = writer1;
		const cleanMergeEncoded = Buffer.from(writer1.pack([
			{ baseA: 1, baseB: 2 },
			new UnpackCleanMergeBeforeNestedPack(),
			{ afterCleanMergeA: 88, afterCleanMergeB: 99 }
		]));
		assert.equal(cleanMergeUnpacked, 1, 'clean mid-pack unpack merge without prior unsaved outer structures should commit on first save');
		activePackr = standaloneStoreReader;
		assert.deepEqual(standaloneStoreReader.unpack(cleanMergeEncoded), [
			{ baseA: 1, baseB: 2 },
			new SharedNestedExt({ cleanNestedKey: 77 }),
			{ afterCleanMergeA: 88, afterCleanMergeB: 99 }
		]);

		let zeroOwnStore = [];
		const zeroOwnPackr = new Packr({
			structures: zeroOwnStore,
			maxOwnStructures: 0,
			maxSharedStructures: 2,
			saveStructures(structures) {
				zeroOwnStore = structures.slice(0);
			}
		});
		activePackr = zeroOwnPackr;
		capturedNestedBuffers = [];
		const zeroOwnPayload = {
			outerKey: 1,
			nested: new SharedNestedExt({ newKey: 2 })
		};
		const zeroOwnEncoded1 = Buffer.from(zeroOwnPackr.pack(zeroOwnPayload));
		const zeroOwnEncoded2 = Buffer.from(zeroOwnPackr.pack(zeroOwnPayload));
		assert.equal(zeroOwnStore.length, 2, 'nested structure should be promoted when maxOwnStructures is 0');
		assert(capturedNestedBuffers[1].length < capturedNestedBuffers[0].length, 'second pack with maxOwnStructures 0 should use promoted shared structure');
		const zeroOwnOverflow = {
			overflowOuter: 3,
			nested: new SharedNestedExt({ overflowInner: 4 })
		};
		const zeroOwnEncoded3 = Buffer.from(zeroOwnPackr.pack(zeroOwnOverflow));
		const zeroOwnReader = new Packr({
			structures: zeroOwnStore,
			maxOwnStructures: 0,
			maxSharedStructures: 2,
			mapsAsObjects: true
		});
		activePackr = zeroOwnReader;
		assert.deepEqual(zeroOwnReader.unpack(zeroOwnEncoded1), zeroOwnPayload, 'maxOwnStructures 0 first pack should fall back to plain map for nested new shape');
		assert.deepEqual(zeroOwnReader.unpack(zeroOwnEncoded2), zeroOwnPayload, 'maxOwnStructures 0 second pack should round-trip with promoted structure');
		assert.deepEqual(zeroOwnReader.unpack(zeroOwnEncoded3), zeroOwnOverflow, 'maxOwnStructures 0 should fall back to plain map when maxSharedStructures is full');

		let twoByteStore = Array.from({ length: 32 }, (_, i) => ['pre' + i]);
		const twoBytePackr = new Packr({
			structures: twoByteStore.slice(0),
			maxSharedStructures: 64,
			saveStructures(structures) {
				twoByteStore = structures.slice(0);
			}
		});
		activePackr = twoBytePackr;
		capturedNestedBuffers = [];
		const twoBytePayload = {
			pre0: 1,
			nested: new SharedNestedExt({ twoBytePromotedA: 2, twoBytePromotedB: 3 })
		};
		const twoByteEncoded1 = Buffer.from(twoBytePackr.pack(twoBytePayload));
		const twoByteEncoded2 = Buffer.from(twoBytePackr.pack(twoBytePayload));
		assert.equal(twoByteStore.length, 34);
		assert.equal(twoByteStore[33].highByte, 0, 'promoted structure at index >= 32 should set two-byte highByte');
		assert(capturedNestedBuffers[1].length < capturedNestedBuffers[0].length, 'second pack should use two-byte promoted shared structure');
		const twoByteReader = new Packr({
			structures: twoByteStore,
			maxSharedStructures: 64
		});
		activePackr = twoByteReader;
		assert.deepEqual(twoByteReader.unpack(twoByteEncoded1), twoBytePayload);
		assert.deepEqual(twoByteReader.unpack(twoByteEncoded2), twoBytePayload);
	});

	test('clearSharedData resets lastNamedStructuresLength after pack', function() {
		let persistedStructures = [['initialA', 'initialB']];
		let saveCount = 0;
		activePackr = new Packr({
			structures: persistedStructures.slice(0),
			saveStructures(structures, isCompatible) {
				if (!isCompatible(persistedStructures.slice(0)))
					return false;
				saveCount++;
				persistedStructures = structures.slice(0);
			}
		});
		activePackr.pack({ beforeClear: 1 });
		assert.equal(saveCount, 1);
		assert.equal(activePackr.lastNamedStructuresLength, 2);
		activePackr.clearSharedData();
		assert.equal(activePackr.lastNamedStructuresLength, 0);
		persistedStructures = [];
		const afterClearEncoded = activePackr.pack({ clearedA: 1, clearedB: 2 });
		assert.equal(saveCount, 2);
		assert.deepEqual(new Packr({ structures: persistedStructures }).unpack(afterClearEncoded), {
			clearedA: 1,
			clearedB: 2
		});
	});

	test('reentrant pack rolls back shared structures on encode error or saveStructures throw', function() {
		class FailingToJSON {
			toJSON() {
				throw new Error('abort outer pack');
			}
		}
		let persistedStructures = [['outerA', 'outerB']];
		let saveCount = 0;
		activePackr = new Packr({
			structures: persistedStructures.slice(0),
			saveStructures(structures) {
				saveCount++;
				persistedStructures = structures.slice(0);
			}
		});
		const countBeforeError = persistedStructures.length;
		assert.throws(() => {
			activePackr.pack({
				nested: new SharedNestedExt({ transientKeyA: 1, transientKeyB: 2 }),
				bad: new FailingToJSON()
			});
		}, /abort outer pack/);
		assert.equal(saveCount, 0);
		assert.equal(activePackr.structures.length, countBeforeError);

		let throwOnSave = true;
		activePackr = new Packr({
			structures: persistedStructures.slice(0),
			saveStructures(structures) {
				if (throwOnSave)
					throw new Error('save failed');
				saveCount++;
				persistedStructures = structures.slice(0);
			}
		});
		assert.throws(() => {
			activePackr.pack({ transientAfterSaveThrow: 1, b: 2 });
		}, /save failed/);
		assert.equal(saveCount, 0);
		assert.equal(activePackr.structures.length, countBeforeError);
		throwOnSave = false;

		const followUp = {
			outerShape: { outerA: 1, outerB: 2 },
			transientAfterSaveThrow: 3,
			b: 4
		};
		const followUpEncoded = activePackr.pack(followUp);
		assert.equal(saveCount, 1);
		const freshReader = new Packr({ structures: persistedStructures });
		assert.deepEqual(freshReader.unpack(followUpEncoded), followUp);

		const preamblePackr = new Packr({ maxSharedStructures: 0, maxOwnStructures: 1 });
		class CaughtNestedToJSON {
			toJSON() {
				let throwOnReset = true;
				let currentNextOwnId = preamblePackr.structures.nextOwnId;
				Object.defineProperty(preamblePackr.structures, 'nextOwnId', {
					configurable: true,
					get() {
						return currentNextOwnId;
					},
					set(val) {
						if (throwOnReset) {
							throwOnReset = false;
							throw new Error('preamble failed');
						}
						currentNextOwnId = val;
					}
				});
				try {
					preamblePackr.pack({ inner: 1 });
				} catch (err) {
					return { fallback: err.message };
				} finally {
					delete preamblePackr.structures.nextOwnId;
					preamblePackr.structures.nextOwnId = currentNextOwnId;
				}
			}
		}
		const outerWithCaughtNested = {
			first: { ownA: 1, ownB: 2 },
			caught: new CaughtNestedToJSON(),
			second: { ownA: 3, ownB: 4 }
		};
		assert.deepEqual(preamblePackr.unpack(preamblePackr.pack(outerWithCaughtNested)), {
			first: { ownA: 1, ownB: 2 },
			caught: { fallback: 'preamble failed' },
			second: { ownA: 3, ownB: 4 }
		}, 'caught saveState preamble error after clearing own structures should restore outer own structures');
	});

	test('reentrant pack restores nextId and nextOwnId and skips shouldShareStructure past limit', function() {
		const nextIdPackr = new Packr();
		activePackr = nextIdPackr;
		const nextIdPayload = {
			a: { x: 1 },
			b: { y: 1 },
			n: new SharedNestedExt({ z: 1 }),
			c: { w: 1 },
			d: { x: 2 }
		};
		assert.deepEqual(nextIdPackr.unpack(nextIdPackr.pack(nextIdPayload)), nextIdPayload);

		let shareCheckCalls = 0;
		const ownIdPackr = new Packr({
			structures: [],
			maxSharedStructures: 4,
			shouldShareStructure(keys) {
				shareCheckCalls++;
				return !keys.includes('ownOnly');
			}
		});
		activePackr = ownIdPackr;
		const ownIdPayload = {
			firstOwn: { ownOnly: 1, firstKey: 2 },
			nested: new SharedNestedExt({
				innerShared: { sharedKey: 5 }
			}),
			secondOwn: { ownOnly: 6, secondKey: 7 },
			reuseFirstOwn: { ownOnly: 8, firstKey: 9 }
		};
		const ownIdEncoded = ownIdPackr.pack(ownIdPayload);
		assert.strictEqual(ownIdPackr.structures.sharedLength, 3);
		const ownIdReader = new Packr({
			structures: ownIdPackr.structures.slice(0, ownIdPackr.structures.sharedLength),
			maxSharedStructures: 4
		});
		activePackr = ownIdReader;
		assert.deepEqual(ownIdReader.unpack(ownIdEncoded), ownIdPayload);
		ownIdPackr.pack({ s4: { k4: 1 } });
		assert.strictEqual(ownIdPackr.structures.sharedLength, 4);
		const callsAtLimit = shareCheckCalls;
		ownIdPackr.pack({ overLimitA: { k5: 2 }, overLimitB: { k6: 3 } });
		assert.strictEqual(shareCheckCalls, callsAtLimit);
	});

	test('reentrant pack with sequential mode', function() {
		const seqWriter = new Packr({ sequential: true });
		activePackr = seqWriter;
		const seqPayload = {
			first: { seqA: 1, seqB: 2 },
			nested: new SharedNestedExt({ innerSeqA: 3, innerSeqB: 4 }),
			second: { seqA: 5, seqB: 6 },
			third: { innerSeqA: 7, innerSeqB: 8 }
		};
		const seqPayload2 = {
			fourth: { seqA: 9, seqB: 10 },
			fifth: { seqC: 11, seqD: 12 }
		};
		const seqEncoded = seqWriter.pack(seqPayload);
		const seqEncoded2 = seqWriter.pack(seqPayload2);
		const seqReader = new Packr({ sequential: true });
		activePackr = seqReader;
		assert.deepEqual(seqReader.unpack(seqEncoded), seqPayload);
		assert.deepEqual(seqReader.unpack(seqEncoded2), seqPayload2);
	});

	test('cross-instance reentrant pack in toJSON and write with bundleStrings', function() {
		const outerPackr = new Packr({ bundleStrings: true });
		const innerPackr = new Packr({ bundleStrings: true });
		let capturedFromWrite;
		let capturedFromToJSON;

		class CrossWriteItem {
			constructor(data) {
				this.data = data;
			}
		}
		addExtension({
			Class: CrossWriteItem,
			type: 19,
			write(item) {
				capturedFromWrite = Buffer.from(innerPackr.pack({
					innerWrite: 'bundled-inside-write-callback',
					extra: item.data
				}));
				return item.data;
			},
			read(data) {
				return new CrossWriteItem(data);
			}
		});

		class CrossToJSONItem {
			toJSON() {
				capturedFromToJSON = Buffer.from(innerPackr.pack({
					innerToJSON: 'bundled-inside-tojson-callback',
					count: 42
				}));
				return 'returned-from-tojson-string';
			}
		}

		const outerPayload = {
			prefix: 'outer-bundled-string-prefix',
			item: new CrossWriteItem('cross-write-payload-string'),
			viaToJSON: new CrossToJSONItem(),
			suffix: 'outer-bundled-string-suffix'
		};

		const outerEncoded = outerPackr.pack(outerPayload);
		assert.deepEqual(outerPackr.unpack(outerEncoded), {
			prefix: 'outer-bundled-string-prefix',
			item: new CrossWriteItem('cross-write-payload-string'),
			viaToJSON: 'returned-from-tojson-string',
			suffix: 'outer-bundled-string-suffix'
		});
		assert.deepEqual(innerPackr.unpack(capturedFromWrite), {
			innerWrite: 'bundled-inside-write-callback',
			extra: 'cross-write-payload-string'
		});
		assert.deepEqual(innerPackr.unpack(capturedFromToJSON), {
			innerToJSON: 'bundled-inside-tojson-callback',
			count: 42
		});
	});

	test.skip('convert Date to string', function(){
		var data = {
			aDate: new Date(),
		};
		let packr = new Packr();
		addExtension({
			Class: Date,
			write(date) {
				return date.toString();
			}
		});
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.equal(deserialized.aDate, data.aDate.toString());
	});
	test('standard pack fails on circular reference with shared structures', function () {
		var data = {};
		data.self = data;
		let structures = [];
		let savedStructures;
		let packr = new Packr({
			structures,
			saveStructures(structures) {
				savedStructures = structures;
			}
		});
		assert.throws(function () {
			packr.pack(data);
		});
	});

	test('proto handling', function() {
		var objectWithProto = JSON.parse('{"__proto__":{"foo":3}}');
		var decoded = unpack(pack(objectWithProto));
		assert(!decoded.foo);
		var objectsWithProto = [objectWithProto, objectWithProto, objectWithProto, objectWithProto, objectWithProto, objectWithProto];
		let packr = new Packr();
		var decoded = packr.unpack(packr.pack(objectsWithProto));
		for (let object of decoded) {
			assert(!decoded.foo);
		}
	});

	test.skip('text decoder', function() {
			let td = new TextDecoder('ISO-8859-15');
			let b = Buffer.alloc(3);
			let total = 0;
			for (var i = 0; i < 256; i++) {
				b[0] = i;
				b[1] = 0;
				b[2] = 0;
				let s = td.decode(b);
				if (!require('msgpackr-extract').isOneByte(s)) {
					console.log(i.toString(16), s.length);
					total++;
				}
			}
	});

	test('moreTypes: Error with causes', function() {
		const object = {
			error: new Error('test'),
			errorWithCause: new Error('test-1', { cause: new Error('test-2') }),
			type: new TypeError(),
			range: new RangeError('test', { cause: [1, 2] }),
		};
		const packr = new Packr({
			moreTypes: true,
		});

		const serialized = packr.pack(object);
		const deserialized = packr.unpack(serialized);
		assert.equal(deserialized.error.message, object.error.message);
		assert.equal(deserialized.error.cause, object.error.cause);
		assert.equal(deserialized.errorWithCause.message, object.errorWithCause.message);
		assert.equal(deserialized.errorWithCause.cause.message, object.errorWithCause.cause.message);
		assert.equal(deserialized.errorWithCause.cause.cause, object.errorWithCause.cause.cause);
		assert.equal(deserialized.type.message, object.type.message);
		assert.equal(deserialized.range.message, object.range.message);
		assert.deepEqual(deserialized.range.cause, object.range.cause);
		assert(deserialized.error instanceof Error);
		assert(deserialized.type instanceof TypeError);
		assert(deserialized.range instanceof RangeError);
	});

	test('structured cloning: self reference', function() {
		let object = {
			test: 'string',
			children: [
				{ name: 'child' }
			],
			value: new ArrayBuffer(10)
		};
		let u8 = new Uint8Array(object.value);
		u8[0] = 1;
		u8[1] = 2;
		object.self = object;
		object.children[1] = object;
		object.children[2] = object.children[0];
		object.childrenAgain = object.children;
		let packr = new Packr({
			moreTypes: true,
			structuredClone: true,
		});
		var serialized = packr.pack(object);
		var deserialized = packr.unpack(serialized);
		assert.equal(deserialized.self, deserialized);
		assert.equal(deserialized.children[0].name, 'child');
		assert.equal(deserialized.children[1], deserialized);
		assert.equal(deserialized.children[0], deserialized.children[2]);
		assert.equal(deserialized.children, deserialized.childrenAgain);
		assert.equal(deserialized.value.constructor.name, 'ArrayBuffer');
		u8 = new Uint8Array(deserialized.value);
		assert.equal(u8[0], 1);
		assert.equal(u8[1], 2);
	});

	test('structured cloning: self reference with more types', function() {
		let set = new Set();
		set.add(['hello', 1, 2, { map: new Map([[set, set], ['a', 'b']]) }]);

		let packr = new Packr({
			moreTypes: true,
			structuredClone: true,
		});
		let serialized = packr.pack(set);
		let deserialized = packr.unpack(serialized);
		assert.equal(deserialized.constructor.name, 'Set');
		let map = Array.from(deserialized)[0][3].map;
		assert.equal(map.get(deserialized), deserialized);

		let sizeTestMap = new Map();
		for (let i = 0; i < 50; i++) {
			sizeTestMap.set(i || sizeTestMap, sizeTestMap);
			let deserialized = packr.unpack(packr.pack(sizeTestMap));
			assert.equal(deserialized.size, i + 1);
			assert(deserialized.has(deserialized));
			assert(deserialized.has(i || deserialized));
		}

		let sizeTestSet = new Set();
		for (let i = 0; i < 50; i++) {
			sizeTestSet.add(i || sizeTestSet);
			let deserialized = packr.unpack(packr.pack(sizeTestSet));
			assert.equal(deserialized.size, i + 1);
			assert(deserialized.has(deserialized));
			assert(deserialized.has(i || deserialized));
		}
	});

	test('structured cloning: types', function() {
		let b = typeof Buffer != 'undefined' ? Buffer.alloc(20) : new Uint8Array(20);
		let fa = new Float32Array(b.buffer, 8, 2);
		fa[0] = 2.25;
		fa[1] = 6;
		let object = {
			error: new Error('test'),
			set: new Set(['a', 'b']),
			regexp: /test/gi,
			float32Array: fa,
			uint16Array: new Uint16Array([3, 4]),
			arrayBuffer: new Uint8Array([0xde, 0xad]).buffer,
			dataView: new DataView(new Uint8Array([0xbe, 0xef]).buffer),
		};
		let packr = new Packr({
			moreTypes: true,
			structuredClone: true,
		});
		var serialized = packr.pack(object);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(Array.from(deserialized.set), Array.from(object.set));
		assert.equal(deserialized.error.message, object.error.message);
		assert.equal(deserialized.regexp.test('TEST'), true);
		assert.equal(deserialized.float32Array.constructor.name, 'Float32Array');
		assert.equal(deserialized.float32Array[0], 2.25);
		assert.equal(deserialized.float32Array[1], 6);
		assert.equal(deserialized.uint16Array.constructor.name, 'Uint16Array');
		assert.equal(deserialized.uint16Array[0], 3);
		assert.equal(deserialized.uint16Array[1], 4);
		assert.equal(deserialized.arrayBuffer.constructor.name, 'ArrayBuffer');
		assert.equal(new DataView(deserialized.arrayBuffer).getUint16(), 0xdead);
		assert.equal(deserialized.dataView.constructor.name, 'DataView');
		assert.equal(deserialized.dataView.getUint16(), 0xbeef);
	});
	test('big bundledStrings', function() {
		const MSGPACK_OPTIONS = {bundleStrings: true};
		const packer = new Packr(MSGPACK_OPTIONS);
		const unpacker = new Unpackr(MSGPACK_OPTIONS);

		const payload = {
			output: [
				{
					url: 'https://www.example.com/',
				},
			],
		};

		for (let i = 0; i < 10000; i++) {
			payload.output.push(payload.output[0]);
		}
		let deserialized = unpacker.unpack(packer.pack(payload));
		assert.equal(deserialized.output[0].url, payload.output[0].url);
	});
	test('structured clone with bundled strings', function() {
		const packer = new Packr({
			structuredClone: true, // both options must be enabled
			bundleStrings: true,
		});

		const v = {};

		let shared = {
			name1: v,
			name2: v,
		};

		let deserialized = packer.unpack(packer.pack(shared));
		assert.equal(deserialized.name1, deserialized.name2);

		shared = {};
		shared.aaaa = shared; // key length >= 4

		deserialized = packer.unpack(packer.pack(shared));
		assert.equal(deserialized.aaaa, deserialized);
	});

	test('object without prototype', function(){
		var data = Object.create(null);
		data.test = 3;
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
	});

	test('object with __proto__', function(){
		const data = { foo: 'bar', __proto__: { isAdmin: true } };
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, { foo: 'bar' });
	});

	test('separate instances', function() {
		const packr = new Packr({
			structures: [['m', 'e'], ['action', 'share']]
		});
		const packr2 = new Packr({
			structures: [['m', 'e'], ['action', 'share']]
		});
		let packed = packr.pack([{m: 1, e: 2}, {action: 3, share: 4}]);
		// also tried directly decoding this without the first Packr instance packed = new Uint8Array([0x92, 0x40, 0x01, 0x02, 0x41, 0x03, 0x04]);
		console.log(packr2.unpack(packed));
	});

	test('many shared structures', function() {
		let data = [];
		for (let i = 0; i < 200; i++) {
			data.push({['a' + i]: i});
		}
		let structures = [];
		let savedStructures;
		let packr = new Packr({
			structures,
			saveStructures(structures) {
				savedStructures = structures;
			}
		});
		var serializedWith32 = packr.pack(data);
		assert.equal(savedStructures.length, 32);
		var deserialized = packr.unpack(serializedWith32);
		assert.deepEqual(deserialized, data);
		structures = structures.slice(0, 32);
		packr = new Packr({
			structures,
			maxSharedStructures: 100,
			saveStructures(structures) {
				savedStructures = structures;
			}
		});
		deserialized = packr.unpack(serializedWith32);
		assert.deepEqual(deserialized, data);
		structures = structures.slice(0, 32);
		packr = new Packr({
			structures,
			maxSharedStructures: 100,
			saveStructures(structures) {
				savedStructures = structures;
			}
		});
		let serialized = packr.pack(data);
		assert.equal(savedStructures.length, 100);
		deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data);

		deserialized = packr.unpack(serializedWith32);
		assert.deepEqual(deserialized, data);
		assert.equal(savedStructures.length, 100);

		deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data);
		assert.equal(packr.structures.sharedLength, 100);
	});
	test('more shared structures', function() {
		const structures = [];
		for (let i = 0; i < 40; i++) {
			structures.push(['a' + i]);
		}
		const structures2 = [...structures];
		const packr = new Packr({
			getStructures() {
				return structures;
			},
			saveStructures(structures) {
			},
			maxSharedStructures: 100
		});
		const packr2 = new Packr({
			getStructures() {
				return structures2;
			},
			saveStructures(structures) {
			},
			maxSharedStructures: 100
		});
		const inputData = {a35: 35};
		const buffer = packr.pack(inputData);
		const outputData = packr2.decode(buffer);
		assert.deepEqual(inputData, outputData);
	});

	test('declined structure save re-packs against durable structures (no dangling record)', function() {
		// Regression: when saveStructures declines a save (a concurrent writer updated the shared
		// structures, or the store txn did not durably commit), the in-memory structures/transition
		// trie reference a record id that was never persisted. The re-pack must reload the durable
		// structures and re-mint/re-save — otherwise it re-emits the same record pointing at an
		// unsaved structure, and reads throw "Record id is not defined".
		const meta = new Packr();
		let store = null;
		let declinedOnce = false;
		const packr = new Packr({
			useRecords: true,
			getStructures() { return store ? meta.unpack(store) : undefined; },
			saveStructures(structures) {
				if (!declinedOnce) { declinedOnce = true; return false; } // decline the first save
				store = meta.pack(structures); return true;
			},
		});
		const a = packr.pack({ x: 9, y: 8 });
		const b = packr.pack({ x: 7, y: 6 });
		const reader = new Packr({ getStructures() { return store ? meta.unpack(store) : undefined; } });
		assert.deepEqual(reader.unpack(a), { x: 9, y: 8 });
		assert.deepEqual(reader.unpack(b), { x: 7, y: 6 });
	});

	test('a truncated structures store is a fatal error, not an incomplete read', () => {
		// getStructures() may unpack a stored blob (see the test above). That nested unpack has its own source,
		// so a truncation there cannot be completed by more bytes from the outer stream, and must not be
		// reported as incomplete or UnpackrStream would keep buffering until maxIncompleteBufferSize.
		const meta = new Packr();
		const full = meta.pack([['a']]);
		const store = full.subarray(0, full.length - 1);
		const reader = new Unpackr({ structures: [], getStructures: () => meta.unpack(store) });
		try {
			reader.unpack(Buffer.from([0x40])); // record id 0, i.e. the structure held in the store
			assert.fail('should not unpack');
		} catch (error) {
			assert.isNotOk(error.incomplete, 'a truncated structures store is not incomplete');
		}
	});

	test('big buffer', function() {
		var size = 100000000;
		var data = new Uint8Array(size).fill(1);
		var packed = pack(data);
		var unpacked = unpack(packed);
		assert.equal(unpacked.length, size);
	});

	test('random strings', function(){
		var data = [];
		for (var i = 0; i < 2000; i++) {
			var str = 'test';
			while (Math.random() < 0.7 && str.length < 0x100000) {
				str = str + String.fromCharCode(90/(Math.random() + 0.01)) + str;
			}
			data.push(str);
		}
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
	});

	test('map/date', function(){
		var map = new Map();
		map.set(4, 'four');
		map.set('three', 3);


		var data = {
			map: map,
			date: new Date(1532219539733),
			farFutureDate: new Date(3532219539133),
			fartherFutureDate: new Date('2106-08-05T18:48:20.323Z'),
			ancient: new Date(-3532219539133),
			invalidDate: new Date('invalid')
		};
		let packr = new Packr();
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.equal(deserialized.map.get(4), 'four');
		assert.equal(deserialized.map.get('three'), 3);
		assert.equal(deserialized.date.getTime(), 1532219539733);
		assert.equal(deserialized.farFutureDate.getTime(), 3532219539133);
		assert.equal(deserialized.fartherFutureDate.toISOString(), '2106-08-05T18:48:20.323Z');
		assert.equal(deserialized.ancient.getTime(), -3532219539133);
		assert.equal(deserialized.invalidDate.toString(), 'Invalid Date');
	});
	test('timestamp 64 for dates after 2106', function(){
		let packr = new Packr();
		let serialized = packr.pack(new Date(0x100000000 * 1000));
		assert.deepEqual(Array.from(serialized), [0xd7, 0xff, 0, 0, 0, 1, 0, 0, 0, 0]);
		let date = new Date('2514-05-30T01:53:03.999Z');
		serialized = packr.pack(date);
		assert.equal(serialized.length, 10);
		assert.equal(packr.unpack(serialized).getTime(), date.getTime());
		serialized = packr.pack(new Date(0x400000000 * 1000));
		assert.equal(serialized.length, 15);
	});
	test('map/date with options', function(){
		var map = new Map();
		map.set(4, 'four');
		map.set('three', 3);


		var data = {
			map: map,
			date: new Date(1532219539011),
			invalidDate: new Date('invalid')
		};
		let packr = new Packr({
			mapsAsObjects: true,
			useTimestamp32: true,
			onInvalidDate: () => 'Custom invalid date'
		});
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.equal(deserialized.map[4], 'four');
		assert.equal(deserialized.map.three, 3);
		assert.equal(deserialized.date.getTime(), 1532219539000);
		assert.equal(deserialized.invalidDate, 'Custom invalid date');
	});
	test('key caching', function() {
		var data = {
			foo: 2,
			bar: 'test',
			four: 4,
			seven: 7,
			foz: 3,
		};
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
		// do multiple times to test caching
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
	});
	test('strings', function() {
		var data = [''];
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
		// do multiple times
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
		data = 'decode this: ᾜ';
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
		data = 'decode this that is longer but without any non-latin characters';
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
	});
	test('decimal float32', function() {
		var data = {
			a: 2.526,
			b: 0.0035235,
			c: 0.00000000000352501,
			d: 3252.77,
		};
		let packr = new Packr({
			useFloat32: DECIMAL_FIT
		});
		var serialized = packr.pack(data);
		assert.equal(serialized.length, 32);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, data);
	});
	test('int64/uint64 should be bigints by default', function() {
		var data = {
			a: 325283295382932843n
		};

		let packr = new Packr();
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized.a, 325283295382932843n);
	});
	test('bigint to float', function() {
		var data = {
			a: 325283295382932843n
		};
		let packr = new Packr({
			int64AsType: 'number'
		});
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized.a, 325283295382932843);
	});
	test('int64AsNumber compatibility', function() {
		// https://github.com/kriszyp/msgpackr/pull/85
		var data = {
			a: 325283295382932843n
		};
		let packr = new Packr({
			int64AsNumber: true
		});
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized.a, 325283295382932843);
	});
	test('bigint to auto (float or bigint)', function() {
		var data = {
			a: -9007199254740993n,
			b: -9007199254740992n,
			c: 0n,
			d: 9007199254740992n,
			e: 9007199254740993n,
		};
		let packr = new Packr({
			int64AsType: 'auto'
		});
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized.a, -9007199254740993n);
		assert.deepEqual(deserialized.b, -9007199254740992);
		assert.deepEqual(deserialized.c, 0);
		assert.deepEqual(deserialized.d, 9007199254740992);
		assert.deepEqual(deserialized.e, 9007199254740993n);
	});
	test('bigint to string', function() {
		var data = {
			a: 325283295382932843n,
		};
		let packr = new Packr({
			int64AsType: 'string'
		});
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized.a, '325283295382932843');
	});
	test('fixint should be one byte', function(){
		let encoded = pack(123);
		assert.equal(encoded.length, 1);
	});
	test('toJSON on a Set subclass is honoured, like it already is for Map subclasses', function(){
		class CustomSet extends Set { toJSON() { return { kind: 'set', values: Array.from(this) }; } }
		class CustomMap extends Map { toJSON() { return { kind: 'map' }; } }
		class CustomError extends Error { toJSON() { return { kind: 'error' }; } }

		let packr = new Packr({ moreTypes: true });
		assert.deepEqual(packr.unpack(packr.pack(new CustomSet([1, 2]))), { kind: 'set', values: [1, 2] });
		assert.deepEqual(packr.unpack(packr.pack(new CustomMap())), { kind: 'map' });
		assert.deepEqual(packr.unpack(packr.pack(new CustomError('x'))), { kind: 'error' });

		// a subclass without toJSON, and a plain Set, still use the Set extension
		class PlainSet extends Set {}
		assert.isTrue(packr.unpack(packr.pack(new PlainSet([1, 2]))) instanceof Set);
		assert.isTrue(packr.unpack(packr.pack(new Set([1, 2]))) instanceof Set);

		// Dates keep the timestamp extension: Date.prototype.toJSON is part of how they are
		// serialized, not a user hook
		let date = new Date(1234567890123);
		assert.strictEqual(+packr.unpack(packr.pack(date)), 1234567890123);
		assert.isTrue(packr.unpack(packr.pack(date)) instanceof Date);

		// useToJSON: false keeps the old behaviour
		let off = new Packr({ moreTypes: true, useToJSON: false });
		assert.isTrue(off.unpack(off.pack(new CustomSet([1]))) instanceof Set);
	});
	test('a registered extension wins over toJSON on a subclass of its class', function(){
		// e.g. a Blob extension and a file-backed Blob subclass whose toJSON is an API shape
		class Stored { constructor(data) { this.data = data; } }
		class FileBackedStored extends Stored { toJSON() { return { description: 'placeholder' }; } }
		addExtension({
			Class: Stored,
			type: 20,
			pack: (stored) => Buffer.from(stored.data),
			unpack: (buffer) => new Stored(buffer.toString()),
		});
		let packr = new Packr();
		let decoded = packr.unpack(packr.pack({ blob: new FileBackedStored('contents') }));
		assert.instanceOf(decoded.blob, Stored);
		assert.equal(decoded.blob.data, 'contents');

		// a registered extension for a built-in class also wins over a subclass's toJSON
		class TaggedSet extends Set { toJSON() { return { kind: 'set' }; } }
		addExtension({
			Class: TaggedSet,
			type: 21,
			pack: (set) => packr.pack(Array.from(set)),
			unpack: (buffer) => new TaggedSet(packr.unpack(buffer)),
		});
		class SubTaggedSet extends TaggedSet { toJSON() { return { kind: 'sub' }; } }
		assert.instanceOf(packr.unpack(packr.pack(new SubTaggedSet([1]))), TaggedSet);
	});
	test('numbers', function(){
		var data = {
			bigEncodable: 48978578104322,
			dateEpoch: 1530886513200,
			realBig: 3432235352353255323,
			decimal: 32.55234,
			negative: -34.11,
			exponential: 0.234e123,
			tiny: 3.233e-120,
			zero: 0,
			//negativeZero: -0,
			Infinity: Infinity
		};
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
	});
	test('bigint', function(){
		var data = {
			bigintSmall: 352n,
			bigintSmallNegative: -333335252n,
			bigintBig: 2n**64n - 1n, // biggest possible
			bigintBigNegative: -(2n**63n), // largest negative
			mixedWithNormal: 44,
		};
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
		var tooBigInt = {
			tooBig: 2n**66n
		};
		assert.throws(function(){ serialized = pack(tooBigInt); });
		let packr = new Packr({
			largeBigIntToFloat: true
		});
		serialized = packr.pack(tooBigInt);
		deserialized = unpack(serialized);
		assert.isTrue(deserialized.tooBig > 2n**65n);

		packr = new Packr({
			largeBigIntToString: true
		});
		serialized = packr.pack(tooBigInt);
		deserialized = unpack(serialized);
		assert.equal(deserialized.tooBig, (2n**66n).toString());
	});

	test('roundFloat32', function() {
		assert.equal(roundFloat32(0.00333000003), 0.00333);
		assert.equal(roundFloat32(43.29999999993), 43.3);
	});

	test('buffers', function(){
		var data = {
			buffer1: new Uint8Array([2,3,4]),
			buffer2: new Uint8Array(pack(sampleData))
		};
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
	});

	test('notepack test', function() {
		const data = {
		  foo: 1,
		  bar: [1, 2, 3, 4, 'abc', 'def'],
		  foobar: {
		    foo: true,
		    bar: -2147483649,
		    foobar: {
		      foo: new Uint8Array([1, 2, 3, 4, 5]),
		      bar: 1.5,
		      foobar: [true, false, 'abcdefghijkmonpqrstuvwxyz']
		    }
		  }
		};
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		var deserialized = unpack(serialized);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
	});

	test('arrays in map keys', function() {
		const msgpackr = new Packr({ mapsAsObjects: true, allowArraysInMapKeys: true });

		const map = new Map();
		map.set([1, 2, 3], 1);
		map.set([1, 2, ['foo', 3.14]], 2);

		const packed = msgpackr.pack(map);
		const unpacked = msgpackr.unpack(packed);
		assert.deepEqual(unpacked, { '1,2,3': 1, '1,2,foo,3.14': 2 });
	});

	test('non-string map key into object suggests mapsAsObjects: false (#127)', function() {
		const msgpackr = new Packr({ mapsAsObjects: true });
		const map = new Map();
		map.set({ nested: 'key' }, 1);
		const packed = msgpackr.pack(map);
		assert.throws(() => msgpackr.unpack(packed), /mapsAsObjects: false/);
		// and the suggested option does preserve the key
		const asMaps = new Packr({ mapsAsObjects: false });
		const unpacked = asMaps.unpack(packed);
		assert.equal(unpacked instanceof Map, true);
		assert.deepEqual(Array.from(unpacked.keys())[0], { nested: 'key' });
	});

	test('utf16 causing expansion', function() {
		this.timeout(10000);
		let data = {fixstr: 'ᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝ', str8:'ᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝ'};
		var serialized = pack(data);
		var deserialized = unpack(serialized);
		assert.deepEqual(deserialized, data);
	});
	test('unpackMultiple', () => {
		let values = unpackMultiple(new Uint8Array([1, 2, 3, 4]));
		assert.deepEqual(values, [1, 2, 3, 4]);
		values = [];
		unpackMultiple(new Uint8Array([1, 2, 3, 4]), value => values.push(value));
		assert.deepEqual(values, [1, 2, 3, 4]);
	});

	test('unpackMultiple with positions', () => {
		let values = unpackMultiple(new Uint8Array([1, 2, 3, 4]));
		assert.deepEqual(values, [1, 2, 3, 4]);
		values = [];
		unpackMultiple(new Uint8Array([1, 2, 3, 4]), (value,start,end) => values.push([value,start,end]));
		assert.deepEqual(values, [[1,0,1], [2,1,2], [3,2,3], [4,3,4]]);
	});

	test('pack toJSON returning this', () => {
		class Serializable {
			someData = [1, 2, 3, 4];
			toJSON() {
				return this;
			}
		}
		const serialized = pack(new Serializable);
		const deserialized = unpack(serialized);
		assert.deepStrictEqual(deserialized, { someData: [1, 2, 3, 4] });
	});
	test('useToJSON: false encodes own properties instead of the toJSON form', () => {
		class Record {
			constructor() {
				this.id = 1;
				this.stored = 'own property';
			}
			// A response shape, not the durable shape: the API adds a derived field.
			toJSON() {
				return { id: this.id, stored: this.stored, derived: 'response only' };
			}
		}
		assert.deepStrictEqual(unpack(pack(new Record)), { id: 1, stored: 'own property', derived: 'response only' });

		const honoring = new Packr({ useToJSON: true });
		assert.deepStrictEqual(honoring.unpack(honoring.pack(new Record)), {
			id: 1,
			stored: 'own property',
			derived: 'response only',
		});

		const ignoring = new Packr({ useToJSON: false });
		assert.deepStrictEqual(ignoring.unpack(ignoring.pack(new Record)), { id: 1, stored: 'own property' });
	});

	test('useToJSON: false is honored for a class whose toJSON returns this', () => {
		class Serializable {
			constructor() {
				this.someData = [1, 2, 3, 4];
			}
			toJSON() {
				return this;
			}
		}
		const ignoring = new Packr({ useToJSON: false });
		assert.deepStrictEqual(ignoring.unpack(ignoring.pack(new Serializable)), { someData: [1, 2, 3, 4] });
	});

	test('useToJSON: false leaves an inherited toJSON alone', () => {
		class Base {
			toJSON() {
				return { fromPrototype: true };
			}
		}
		const record = new Base();
		record.stored = 'own';
		const ignoring = new Packr({ useToJSON: false });
		assert.deepStrictEqual(ignoring.unpack(ignoring.pack(record)), { stored: 'own' });
		assert.deepStrictEqual(unpack(pack(record)), { fromPrototype: true });
	});

	test('skip values', function () {
		var data = {
			data: [
				{ a: 1, name: 'one', type: 'odd', isOdd: true },
				{ a: 2, name: 'two', type: 'even', isOdd: undefined },
				{ a: 3, name: 'three', type: 'odd', isOdd: true },
				{ a: 4, name: 'four', type: 'even', isOdd: null},
				{ a: 5, name: 'five', type: 'odd', isOdd: true },
				{ a: 6, name: 'six', type: 'even', isOdd: null }
			],
			description: 'some names',
			types: ['odd', 'even'],
			convertEnumToNum: [
				{ prop: 'test' },
				{ prop: 'test' },
				{ prop: 'test' },
				{ prop: 1 },
				{ prop: 2 },
				{ prop: [undefined, null] },
				{ prop: null }
			]
		};
		var expected = {
			data: [
				{ a: 1, name: 'one', type: 'odd', isOdd: true },
				{ a: 2, name: 'two', type: 'even' },
				{ a: 3, name: 'three', type: 'odd', isOdd: true },
				{ a: 4, name: 'four', type: 'even', },
				{ a: 5, name: 'five', type: 'odd', isOdd: true },
				{ a: 6, name: 'six', type: 'even' }
			],
			description: 'some names',
			types: ['odd', 'even'],
			convertEnumToNum: [
				{ prop: 'test' },
				{ prop: 'test' },
				{ prop: 'test' },
				{ prop: 1 },
				{ prop: 2 },
				{ prop: [undefined, null] },
				{}
			]
		};
		let packr = new Packr({ useRecords: false, skipValues: [undefined, null] });
		var serialized = packr.pack(data);
		var deserialized = packr.unpack(serialized);
		assert.deepEqual(deserialized, expected);
	});

	test('longStringInJS 16-31 byte fixstr and 32+ byte str8 across Buffer and Uint8Array', async function () {
		const noExtractUrl = new URL('../unpack.js?no-extract', import.meta.url);
		const noExtract = await import(noExtractUrl);
		assert.strictEqual(noExtract.isNativeAccelerationEnabled, false);

		const toPlainUint8Array = (buf) => {
			const u8 = new Uint8Array(buf.length);
			u8.set(buf);
			assert.strictEqual(u8.latin1Slice, undefined);
			return u8;
		};
		const toOffsetBuffer = (buf) => {
			const padded = Buffer.alloc(buf.length + 16, 0xff);
			buf.copy(padded, 8);
			const sub = padded.subarray(8, 8 + buf.length);
			assert.strictEqual(typeof sub.latin1Slice, 'function');
			assert.strictEqual(sub.byteOffset > 0, true);
			return sub;
		};
		const spyLatin1Slice = (buf, fn) => {
			const calls = [];
			const orig = buf.latin1Slice;
			buf.latin1Slice = function (start, end) {
				calls.push(orig.call(this, start, end));
				return calls[calls.length - 1];
			};
			try {
				fn(calls);
			} finally {
				buf.latin1Slice = orig;
			}
		};

		let keySeq = 0;
		for (const UnpackrImpl of [Unpackr, noExtract.Unpackr]) {
			for (const len of [16, 24, 31]) {
				const str = 'x'.repeat(len - 2) + (len % 10) + '!';
				const unpackrInstance = new UnpackrImpl();
				const packedStr = Buffer.from(pack(str));
				spyLatin1Slice(packedStr, (calls) => {
					assert.strictEqual(unpackrInstance.unpack(packedStr), str);
					assert.deepStrictEqual(calls, [str]);
				});

				const packrRec = new Packr({ useRecords: true });
				const unpackrRec = new UnpackrImpl({ useRecords: true });
				const packedRec = Buffer.from(packrRec.pack({ id: len, value: str }));
				spyLatin1Slice(packedRec, (calls) => {
					assert.deepStrictEqual(unpackrRec.unpack(packedRec), { id: len, value: str });
					assert.deepStrictEqual(calls, [str]);
				});

				const uncachedKey = `unique_key_${++keySeq}_` + 'k'.repeat(len - 13);
				assert.strictEqual(uncachedKey.length, len);
				const packrMap = new Packr({ useRecords: false });
				const unpackrMap = new UnpackrImpl({ useRecords: false });
				const packedMap = Buffer.from(packrMap.pack({ [uncachedKey]: str }));
				spyLatin1Slice(packedMap, (calls) => {
					assert.deepStrictEqual(unpackrMap.unpack(packedMap), { [uncachedKey]: str });
					assert.deepStrictEqual(calls, [uncachedKey, str]);
				});
			}

			for (const len of [16, 17, 24, 30, 31, 32, 33, 48, 64, 65, 100]) {
				const ascii = 'a'.repeat(len - 2) + 'z!';
				assert.strictEqual(ascii.length, len);

				const packrRec = new Packr({ useRecords: true });
				const unpackrRec = new UnpackrImpl({ useRecords: true });
				const recPayload = { id: len, value: ascii };
				const packedRec = Buffer.from(packrRec.pack(recPayload));
				if (len <= 31) assert.isBelow(packedRec.length, 140);

				assert.deepStrictEqual(unpackrRec.unpack(packedRec), recPayload);
				assert.deepStrictEqual(unpackrRec.unpack(toOffsetBuffer(packedRec)), recPayload);
				assert.deepStrictEqual(unpackrRec.unpack(toPlainUint8Array(packedRec)), recPayload);

				const keyStr = 'k'.repeat(Math.min(len, 31) - 1) + (len % 10);
				const packrMap = new Packr({ useRecords: false });
				const unpackrMap = new UnpackrImpl({ useRecords: false });
				const mapPayload = { [keyStr]: ascii, n: 1 };
				const packedMap = Buffer.from(packrMap.pack(mapPayload));
				if (len <= 31) assert.isBelow(packedMap.length, 140);

				assert.deepStrictEqual(unpackrMap.unpack(packedMap), mapPayload);
				assert.deepStrictEqual(unpackrMap.unpack(toOffsetBuffer(packedMap)), mapPayload);
				assert.deepStrictEqual(unpackrMap.unpack(toPlainUint8Array(packedMap)), mapPayload);
			}

			const nonAsciiCases = [
				'é' + 'a'.repeat(15),
				'a'.repeat(8) + 'é' + 'b'.repeat(8),
				'a'.repeat(7) + 'ᾐ' + 'b'.repeat(7),
				'a'.repeat(7) + '🚀' + 'b'.repeat(7),
				'a'.repeat(15) + 'é',
				'a'.repeat(29) + 'é',
			];
			for (const str of nonAsciiCases) {
				const byteLen = Buffer.byteLength(str);
				assert.isAtLeast(byteLen, 16);
				assert.isAtMost(byteLen, 31);

				const packrRec = new Packr({ useRecords: true });
				const unpackrRec = new UnpackrImpl({ useRecords: true });
				const recPayload = { id: 1, text: str, after: 'sixteen-byte-str' };
				const packedRec = Buffer.from(packrRec.pack(recPayload));
				assert.isBelow(packedRec.length, 140);

				assert.deepStrictEqual(unpackrRec.unpack(packedRec), recPayload);
				assert.deepStrictEqual(unpackrRec.unpack(toOffsetBuffer(packedRec)), recPayload);
				assert.deepStrictEqual(unpackrRec.unpack(toPlainUint8Array(packedRec)), recPayload);

				const packrMap = new Packr({ useRecords: false });
				const unpackrMap = new UnpackrImpl({ useRecords: false });
				const mapPayload = { [str]: str, follow: 'twenty-four-char-string!' };
				const packedMap = Buffer.from(packrMap.pack(mapPayload));
				assert.isBelow(packedMap.length, 140);

				assert.deepStrictEqual(unpackrMap.unpack(packedMap), mapPayload);
				assert.deepStrictEqual(unpackrMap.unpack(toOffsetBuffer(packedMap)), mapPayload);
				assert.deepStrictEqual(unpackrMap.unpack(toPlainUint8Array(packedMap)), mapPayload);
			}
		}
	});
});
suite('msgpackr performance tests', function(){
	test('performance JSON.parse', function() {
		var data = sampleData;
		this.timeout(10000);
		let structures = [];
		var serialized = JSON.stringify(data);
		console.log('JSON size', serialized.length);
		for (var i = 0; i < ITERATIONS; i++) {
			var deserialized = JSON.parse(serialized);
		}
	});
	test('performance JSON.stringify', function() {
		var data = sampleData;
		this.timeout(10000);
		for (var i = 0; i < ITERATIONS; i++) {
			var serialized = JSON.stringify(data);
		}
	});
	test('performance unpack', function() {
		var data = sampleData;
		this.timeout(10000);
		let structures = [];
		var serialized = pack(data);
		console.log('MessagePack size', serialized.length);
		let packr = new Packr({ structures, bundleStrings: false });
		var serialized = packr.pack(data);
		console.log('msgpackr w/ record ext size', serialized.length);
		for (var i = 0; i < ITERATIONS; i++) {
			var deserialized = packr.unpack(serialized);
		}
	});
	test('performance pack', function() {
		var data = sampleData;
		this.timeout(10000);
		let structures = [];
		let packr = new Packr({ structures, bundleStrings: false });
		let buffer = typeof Buffer != 'undefined' ? Buffer.alloc(0x10000) : new Uint8Array(0x10000);

		for (var i = 0; i < ITERATIONS; i++) {
			//serialized = pack(data, { shared: sharedStructure })
			packr.useBuffer(buffer);
			var serialized = packr.pack(data);
			//var serializedGzip = deflateSync(serialized)
		}
		//console.log('serialized', serialized.length, global.propertyComparisons)
	});
	test('performance unpack 16-31 byte fixstrs', function() {
		this.timeout(10000);
		const runs = ITERATIONS * 10;
		for (const len of [16, 24, 31]) {
			const structures = [];
			const packr = new Packr({ structures });
			const str = 'x'.repeat(len - 2) + (len % 10) + '!';
			const buf = Buffer.from(packr.pack({ id: 1, title: str }));
			const u8 = new Uint8Array(buf.length);
			u8.set(buf);
			for (let i = 0; i < runs; i++) {
				packr.unpack(buf);
				packr.unpack(u8);
			}
		}
	});
});

suite('msgpackr – two-byte record definitions (over-cap own records with a shared store)', function () {
	// Regression for a data-corruption bug: with a shared-structures store (getStructures/
	// saveStructures) and maxOwnStructures > 32, msgpackr uses two-byte record ids
	// (useTwoByteRecords). Over-cap "own" record shapes fall back to the classic record encoder,
	// which emits a SELF-CONTAINED record definition (0xd5 0x72 <firstByte> <highByte> <keys>
	// <values>). On read, recordDefinition() consumed the high byte itself, then invoked
	// structure.read() — which, for a highByte === 0 structure, was a second-byte reader that
	// consumed the FIRST VALUE BYTE as a phantom high byte, mis-resolving to a never-defined id
	// ("Record id is not defined for N"). The one-byte path (maxOwnStructures <= 32, fixext 1
	// 0xd4 0x72) was unaffected because no high byte / second-byte reader is involved.
	// Fix: recordDefinition reads the body via the un-wrapped reader (structure.read0).
	const sharedStore = () => {
		let saved = [];
		return { getStructures: () => saved, saveStructures: (s) => { saved = s; return true; }, peek: () => saved };
	};
	// Width-heterogeneous record generator: many distinct shapes, exceeding any modest cap, so
	// the over-cap classic-record fallback path is exercised heavily.
	const makeRecords = (count) => {
		const out = [];
		for (let i = 0; i < count; i++) {
			const rec = { id: i };
			const n = 1 + (i % 6);
			for (let a = 0; a < n; a++) rec['attr_' + ((i * 7 + a) % 400)] = i % 2 ? 's' + i : i;
			out.push(rec);
		}
		return out;
	};

	test('cap=256 + shared store round-trips every over-cap shape (two-byte mode)', function () {
		const store = sharedStore();
		const o = { randomAccessStructure: true, useRecords: true, useBigIntExtension: true, maxOwnStructures: 256, ...store };
		const w = new Packr(o), r = new Packr(o);
		const records = makeRecords(3000);
		let sawTwoByteDef = false;
		for (const rec of records) {
			const buf = w.pack(rec);
			if (buf[0] === 0xd5 && buf[1] === 0x72) sawTwoByteDef = true;
			assert.deepEqual(r.unpack(buf), rec);
		}
		assert.ok(sawTwoByteDef, 'expected at least one two-byte (0xd5 0x72) record definition to be exercised');
	});

	test('over-cap own records do not grow the shared dictionary without bound', function () {
		const store = sharedStore();
		const o = { randomAccessStructure: true, useRecords: true, useBigIntExtension: true, maxOwnStructures: 256, ...store };
		const w = new Packr(o);
		for (const rec of makeRecords(3000)) w.pack(rec);
		const saved = store.peek();
		const named = saved instanceof Map ? (saved.get('named') || []) : (saved || []);
		// Over-cap shapes are inlined as self-contained definitions, not minted as ever-growing
		// shared ids, so the shared store stays bounded by the few genuinely shared shapes.
		assert.ok(named.length < 100, 'named structures should stay bounded, got ' + named.length);
	});

	test('two-byte record REFERENCES (shared, maxShared=64) round-trip with stable shapes', function () {
		// maxSharedStructures > 32 forces two-byte mode; stable repeated shapes get a definition
		// once then are emitted as two-byte references (0x60-0x7f + high byte) — the path that
		// relies on structure.read remaining a second-byte reader after the fix.
		const store = sharedStore();
		const o = { useRecords: true, maxSharedStructures: 64, maxOwnStructures: 64, ...store };
		const w = new Packr(o), r = new Packr(o);
		const shapes = [];
		for (let s = 0; s < 100; s++) { const rec = {}; for (let f = 0; f <= s % 8; f++) rec['k' + s + '_' + f] = s * 10 + f; shapes.push(rec); }
		let sawRef = false;
		for (let round = 0; round < 4; round++) for (const shp of shapes) {
			const buf = w.pack(shp);
			if (buf[0] >= 0x60 && buf[0] < 0x80) sawRef = true;
			assert.deepEqual(r.unpack(buf), shp);
		}
		assert.ok(sawRef, 'expected at least one two-byte record reference (0x60-0x7f) to be exercised');
	});

	test('one-byte path (maxOwn=32) keeps working with a shared store', function () {
		const store = sharedStore();
		const o = { randomAccessStructure: true, useRecords: true, useBigIntExtension: true, maxOwnStructures: 32, ...store };
		const w = new Packr(o), r = new Packr(o);
		for (const rec of makeRecords(3000)) {
			assert.deepEqual(r.unpack(w.pack(rec)), rec);
		}
	});
});
	test('structured cloning: AggregateError', function() {
		let packr = new Packr({ moreTypes: true, structuredClone: true });
		let original = new AggregateError([new Error('first'), new TypeError('second')], 'aggregate boom');
		let round = packr.unpack(packr.pack(original));
		assert.equal(round.name, 'AggregateError');
		assert.equal(round.message, 'aggregate boom');
		assert.deepEqual(
			round.errors.map((e) => [e.name, e.message]),
			[
				['Error', 'first'],
				['TypeError', 'second'],
			]
		);
		// A payload written before the errors were carried (three entries) still decodes to the
		// right message and name, with no errors rather than an error list spelled from the message.
		let legacy = Buffer.from('d4650093ae4167677265676174654572726f72ae61676772656761746520626f6f6dd40000', 'hex');
		let legacyRound = packr.unpack(legacy);
		assert.equal(legacyRound.name, 'AggregateError');
		assert.equal(legacyRound.message, 'aggregate boom');
		assert.deepEqual(legacyRound.errors, []);
	});
