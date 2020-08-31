exports.encoder = require('./encode').encoder
let decodeModule = require('./decode')
let extractor = tryRequire('msgpackr-extract')
if (extractor)
	decodeModule.setExtractor(extractor.extractStrings)
exports.decoder = decodeModule.decoder
exports.EncoderStream = require('./stream').EncoderStream
exports.DecoderStream = require('./stream').DecoderStream
let encoder = new exports.encoder({ objectsAsMaps: true })
exports.decode = encoder.decode
exports.encode = encoder.encode

function tryRequire(moduleId) {
	try {
		return require(moduleId)
	} catch (error) {
		if (typeof window == 'undefined')
			console.warn('Native extraction module not loaded, cbor-x will still run, but with decreased performance. ' + error.message.split('\n')[0])
		else
			console.warn('For browser usage, directly use msgencoder/decode or msgencoder/encode modules. ' + error.message.split('\n')[0])
	}
}