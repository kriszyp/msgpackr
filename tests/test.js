var inspector = require('inspector')
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
//if (typeof msgpack-struct === 'undefined') { msgpack-struct = require('..') }
var Packr = require('..').Packr
var unpack = require('..').unpack
var pack = require('..').pack


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
	var sampleData = JSON.parse(fs.readFileSync(__dirname + '/samples/lookuptable.json'))
} else {
	var xhr = new XMLHttpRequest()
	xhr.open('GET', 'samples/outcomes.json', false)
	xhr.send()
	var sampleData = JSON.parse(xhr.responseText)
}
var ITERATIONS = 1000000

suite('msgpack-struct basic tests', function(){
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
		var packd = packr.pack(data)
		var unpackd = packr.unpack(packd)
		assert.deepEqual(unpackd, data)
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
		var packd = packr.pack(data)
		var unpackd = packr.unpack(packd)
		assert.deepEqual(unpackd, data)
	})

	test('pack/unpack sample data', function(){
		var data = sampleData
		let structures = []
		let packr = new Packr({ structures, objectsAsMaps: false })
		debugger
		var packd = packr.pack(data)
		var unpackd = packr.unpack(packd)
		assert.deepEqual(unpackd, data)
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
		var packd = pack(data, options)
		var unpackd = unpack(packd, options)
		assert.equal(unpackd.extendedInstance.getDouble(), 8)
	})


	test('map/date', function(){
		var map = new Map()
		map.set(4, 'four')
		map.set('three', 3)


		var data = {
			map: map,
			//date: new Date(1532219539819)
		}
		let packr = new Packr()
		var packd = packr.pack(data)
		var unpackd = packr.unpack(packd)
		assert.equal(unpackd.map.get(4), 'four')
		assert.equal(unpackd.map.get('three'), 3)
		//assert.equal(unpackd.date.getTime(), 1532219539819)
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
		var packd = pack(data)
		var unpackd = unpack(packd)
		assert.deepEqual(unpackd, data)
	})

	test('utf16 causing expansion', function() {
		this.timeout(10000)
		let data = {fixstr: 'ᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝ', str8:'ᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛᾜᾝ'}
		var packd = pack(data)
		unpackd = unpack(packd)
		assert.deepEqual(unpackd, data)
	})

})
suite.skip('msgpackr performance tests', function(){
	test('performance', function() {
		var data = sampleData
		this.timeout(10000)
		let structures = []
		let packr = new Packr({ structures, objectsAsMaps: false })
		var packd = packr.pack(data)
		console.log('msgpack-struct size', packd.length)
		for (var i = 0; i < ITERATIONS; i++) {
			var unpackd = packr.unpack(packd)
		}
	})
	test('performance pack', function() {
		var data = sampleData
		this.timeout(10000)
		let structures = []
		let packr = new Packr({ structures, objectsAsMaps: false })

		for (var i = 0; i < ITERATIONS; i++) {
			//packd = pack(data, { shared: sharedStructure })
			var packd = packr.pack(data)
			packr.resetMemory()
			//var packdGzip = deflateSync(packd)
		}
		//console.log('packd', packd.length, global.propertyComparisons)
	})
})