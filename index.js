const packModule = require('./pack')
exports.Packr = packModule.Packr
exports.addExtension = require('./pack').addExtension
exports.Encoder = exports.Packr
const unpackModule = require('./unpack')
const extractor = tryRequire('msgpackr-extract')
if (extractor)
	unpackModule.setExtractor(extractor.extractStrings)
exports.Unpackr = unpackModule.Unpackr
exports.Decoder = exports.Unpackr
exports.C1 = unpackModule.C1
exports.PackrStream = require('./stream').PackrStream
exports.UnpackrStream = require('./stream').UnpackrStream
exports.EncoderStream = exports.PackrStream
exports.DecoderStream = exports.UnpackrStream
const packr = new exports.Packr({ useRecords: false })
exports.unpack = unpackModule.unpack
exports.unpackMultiple = unpackModule.unpackMultiple
exports.pack = packModule.pack
exports.decode = unpackModule.unpack
exports.encode = packModule.pack
exports.useRecords = false
exports.mapsAsObjects = true
exports.FLOAT32_OPTIONS = unpackModule.FLOAT32_OPTIONS
Object.assign(exports, unpackModule.FLOAT32_OPTIONS)

function tryRequire(moduleId) {
	try {
		return require(moduleId)
	} catch (error) {
		if (typeof window == 'undefined')
			console.warn('Native extraction module not loaded, msgpackr will still run, but with decreased performance. ' + error.message)
		else
			console.warn('For browser usage, directly use msgpackr/unpack or msgpackr/pack modules. ' + error.message.split('\n')[0])
	}
}