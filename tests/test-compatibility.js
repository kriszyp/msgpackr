var data = require('./example4.json');

function tryRequire(module) {
	try {
		return require(module)
	} catch(error) {
	}
}
if (typeof chai === 'undefined') { chai = require('chai') }
assert = chai.assert
if (typeof cborX === 'undefined') { cborX = require('..') }
var cbor_module = tryRequire('cbor');
var decode = cborX.decode
var encode = cborX.encode

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
