//var inspector = require('inspector')
//inspector.open(9330, null, true)

function tryRequire(module) {
	try {
		return require(module)
	} catch(error) {
		return {}
	}
}
if (typeof chai === 'undefined') { chai = require('chai') }
assert = chai.assert
if (typeof msgpackr === 'undefined') { msgpackr = require('..') }
var Packr = msgpackr.Packr
var PackrStream = msgpackr.PackrStream
var UnpackrStream = msgpackr.UnpackrStream
var unpack = msgpackr.unpack
var pack = msgpackr.pack


var zlib = tryRequire('zlib')
var deflateSync = zlib.deflateSync
var inflateSync = zlib.inflateSync
var deflateSync = zlib.brotliCompressSync
var inflateSync = zlib.brotliDecompressSync
var constants = zlib.constants
try {
//	var { decode, encode } = require('msgpack-lite')
} catch (error) {}

if (typeof XMLHttpRequest === 'undefined') {
	var fs = require('fs')
	var sampleData = JSON.parse(fs.readFileSync(__dirname + '/example.json'))
} else {
	var xhr = new XMLHttpRequest()
	xhr.open('GET', 'samples/outcomes.json', false)
	xhr.send()
	var sampleData = JSON.parse(xhr.responseText)
}
var ITERATIONS = 1000000

suite('msgpackr basic tests', function(){
	test('pack/unpack data', function(){
		var data = {
			data: [
				{ a: 1, name: 'one', type: 'odd', isOdd: true },
				{ a: 2, name: 'two', type: 'even'},
				{ a: 3, name: 'three', type: 'odd', isOdd: true },
				{ a: 4, name: 'four', type: 'even'},
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
				{ prop: [undefined] },
				{ prop: null }
			]
		}
		let structures = []
		let packr = new Packr({ structures })
		var serialized = packr.pack(data)
		var deserialized = packr.unpack(serialized)
		assert.deepEqual(deserialized, data)
	})

	test('mixed array', function(){
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
				3, -5, -50, -400,1.3, -5.3, true
			]
		]
		let structures = []
		let packr = new Packr({ structures })
		var serialized = packr.pack(data)
		var deserialized = packr.unpack(serialized)
		assert.deepEqual(deserialized, data)
	})

	test('pack/unpack sample data', function(){
		var data = sampleData
		let structures = []
		let packr = new Packr({ structures, useRecords: true })
		var serialized = packr.pack(data)
		var deserialized = packr.unpack(serialized)
		assert.deepEqual(deserialized, data)
	})

	test.skip('extended class', function(){
		function Extended() {

		}
		Extended.prototype.getDouble = function() {
			return this.value * 2
		}
		var instance = new Extended()
		instance.value = 4
		var data = {
			extendedInstance: instance
		}
		// TODO: create two of these
		var options = new Options()
		options.addExtension(Extended, 'Extended')
		var serialized = pack(data, options)
		var deserialized = unpack(serialized, options)
		assert.equal(deserialized.extendedInstance.getDouble(), 8)
	})


	test('map/date', function(){
		var map = new Map()
		map.set(4, 'four')
		map.set('three', 3)


		var data = {
			map: map,
			date: new Date(1532219539000)
		}
		let packr = new Packr()
		var serialized = packr.pack(data)
		var deserialized = packr.unpack(serialized)
		assert.equal(deserialized.map.get(4), 'four')
		assert.equal(deserialized.map.get('three'), 3)
		assert.equal(deserialized.date.getTime(), 1532219539000)
	})

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
		}
		var serialized = pack(data)
		var deserialized = unpack(serialized)
		assert.deepEqual(deserialized, data)
	})

	test('buffers', function(){
		var data = {
			buffer1: Buffer.from([2,3,4]),
			buffer2: Buffer.from(pack(sampleData))
		}
		var serialized = pack(data)
		var deserialized = unpack(serialized)
		assert.deepEqual(deserialized, data)
	})

	test('notepack test', function() {
		const data = {
		  foo: 1,
		  bar: [1, 2, 3, 4, 'abc', 'def'],
		  foobar: {
		    foo: true,
		    bar: -2147483649,
		    foobar: {
		      foo: Buffer.from([1, 2, 3, 4, 5]),
		      bar: 1.5,
		      foobar: [true, false, 'abcdefghijkmonpqrstuvwxyz']
		    }
		  }
		};
		var serialized = pack(data)
		var deserialized = unpack(serialized)
		var deserialized = unpack(serialized)
		var deserialized = unpack(serialized)
		assert.deepEqual(deserialized, data)
	})

	test('utf16 causing expansion', function() {
		this.timeout(10000)
		let data = {fixstr: 'ᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝ', str8:'ᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝ'}
		var serialized = pack(data)
		deserialized = unpack(serialized)
		assert.deepEqual(deserialized, data)
	})
	test('serialize/parse stream', () => {
		const serializeStream = new PackrStream({
		})
		const parseStream = new UnpackrStream()
		serializeStream.pipe(parseStream)
		const received = []
		parseStream.on('data', data => {
			received.push(data)
		})
		const messages = [{
			name: 'first'
		}, {
			name: 'second'
		}, {
			name: 'third'
		}, {
			name: 'third',
			extra: [1, 3, { foo: 'hi'}, 'bye']
		}]
		for (const message of messages)
			serializeStream.write(message)
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				assert.deepEqual(received, messages)
				resolve()
			}, 10)
		})
	})

})
suite.skip('msgpackr performance tests', function(){
	test('performance', function() {
		var data = sampleData
		this.timeout(10000)
		let structures = []
		let packr = new Packr({ structures, useRecords: true })
		var serialized = packr.pack(data)
		console.log('msgpackr size', serialized.length)
		for (var i = 0; i < ITERATIONS; i++) {
			var deserialized = packr.unpack(serialized)
		}
	})
	test('performance pack', function() {
		var data = sampleData
		this.timeout(10000)
		let structures = []
		let packr = new Packr({ structures, useRecords: true })

		for (var i = 0; i < ITERATIONS; i++) {
			//serialized = pack(data, { shared: sharedStructure })
			var serialized = packr.pack(data)
			packr.resetMemory()
			//var serializedGzip = deflateSync(serialized)
		}
		//console.log('serialized', serialized.length, global.propertyComparisons)
	})
})