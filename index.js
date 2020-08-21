exports.Packr = require('./pack').Packr
let unpackModule = require('./unpack')
let extractor = tryRequire('./build/Release/msgpackr.node')
if (extractor)
	unpackModule.setExtractor(extractor.extractStrings)
exports.Unpackr = unpackModule.Unpackr
exports.PackrStream = require('./stream').PackrStream
exports.UnpackrStream = require('./stream').UnpackrStream
let packr = new exports.Packr({ objectsAsMaps: true })
exports.unpack = packr.unpack
exports.pack = packr.pack

function tryRequire(moduleId) {
	try {
		return require(moduleId)
	} catch (error) {
		console.warn('Native extraction module not loaded, msgpackr will still run, but with decreased performance. ' + error.message.split('\n')[0])
	}
}