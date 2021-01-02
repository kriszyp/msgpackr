exports.Encoder = require('./encode').Encoder
exports.addExtension = require('./encode').addExtension
let decodeModule = require('./decode')
let extractor = tryRequire('cbor-extract')
if (extractor)
	decodeModule.setExtractor(extractor.extractStrings)
exports.Decoder = decodeModule.Decoder
exports.EncoderStream = require('./stream').EncoderStream
exports.DecoderStream = require('./stream').DecoderStream
let encoder = new exports.Encoder({ useRecords: false })
exports.decode = encoder.decode
exports.encode = encoder.encode
exports.Tag = decodeModule.Tag
exports.useRecords = false
exports.mapsAsObjects = true
Object.assign(exports, {
	ALWAYS:1,
	DECIMAL_ROUND: 3,
	DECIMAL_FIT: 4
})

function tryRequire(moduleId) {
	try {
		return require(moduleId)
	} catch (error) {
		if (typeof window == 'undefined')
			console.warn('Native extraction module not loaded, cbor-x will still run, but with decreased performance. ' + error.message)
		else
			console.warn('For browser usage, directly use encode/decode modules. ' + error.message.split('\n')[0])
	}
}
