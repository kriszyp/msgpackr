exports.Packr = require('./pack').Packr
exports.addExtension = require('./pack').addExtension
exports.Encoder = exports.Packr
let unpackModule = require('./unpack')
let extractor = tryRequire('msgpackr-extract')
if (extractor)
	unpackModule.setExtractor(extractor.extractStrings)
exports.Unpackr = unpackModule.Unpackr
exports.Decoder = exports.Unpackr
exports.PackrStream = require('./stream').PackrStream
exports.UnpackrStream = require('./stream').UnpackrStream
exports.EncoderStream = exports.PackrStream
exports.DecoderStream = exports.UnpackrStream
let packr = new exports.Packr({ useRecords: false })
exports.unpack = packr.unpack
exports.pack = packr.pack
exports.decode = packr.unpack
exports.encode = packr.pack

function tryRequire(moduleId) {
	try {
		return require(moduleId)
	} catch (error) {
		if (typeof window == 'undefined')
			console.warn('Native extraction module not loaded, msgpackr will still run, but with decreased performance. ' + error.message.split('\n')[0])
		else
			console.warn('For browser usage, directly use msgpackr/unpack or msgpackr/pack modules. ' + error.message.split('\n')[0])
	}
}