const data = require('./example4.json');
const cborX = require('..');
const chai = require('chai');

function tryRequire(module) {
	try {
		return require(module)
	} catch(error) {
	}
}
//if (typeof chai === 'undefined') { chai = require('chai') }
const assert = chai.assert
var cbor_module = tryRequire('cbor');
var decode = cborX.decode
var encode = cborX.encode

const addCompatibilitySuite = (data) => () => {
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
