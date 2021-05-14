import * as data from './example4.json';
import * as msgpackr from '..'
import * as chai from 'chai'

/*function tryRequire(module) {
	try {
		return require(module)
	} catch(error) {
	}
}
//if (typeof chai === 'undefined') { chai = require('chai') }
assert = chai.assert
if (typeof cborX === 'undefined') { cborX = require('..') }
var cbor_module = tryRequire('cbor');
var decode = cborX.decode
var encode = cborX.encode
//if (typeof msgpackr === 'undefined') { msgpackr = require('..') }
var msgpack_msgpack = tryRequire('@msgpack/msgpack');
var msgpack_lite = tryRequire('msgpack-lite');*/
var unpack = msgpackr.unpack
var pack = msgpackr.pack

addCompatibilitySuite = (data) => () => {
	if (cbor_module) {
		test('from cbor', function(){
			var serialized = cbor_module.encode(data)
			var deserialized = decode(serialized)
			assert.deepEqual(deserialized, data)
		})

		test('to cbor', function(){
			var serialized = encode(data)
			var deserialized = cbor_module.decodeFirstSync(serialized)
			assert.deepEqual(deserialized, data)
		})
	}
}

suite('cbor-x compatibility tests (example)', addCompatibilitySuite(require('./example.json')))
suite('cbor-x compatibility tests (example4)', addCompatibilitySuite(require('./example4.json')))
suite('cbor-x compatibility tests (example5)', addCompatibilitySuite(require('./example5.json')))
