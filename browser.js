exports.Packr = require('./pack').Packr
exports.Encoder = exports.Packr
exports.Unpackr = require('./unpack').Unpackr
exports.Decoder = exports.Unpackr
exports.addExtension = require('./pack').addExtension
let packr = new exports.Packr({ useRecords: false })
exports.unpack = packr.unpack
exports.pack = packr.pack
exports.decode = packr.unpack
exports.encode = packr.pack
exports.FLOAT32_OPTIONS = require('./unpack').FLOAT32_OPTIONS
Object.assign(exports, {
	ALWAYS:1,
	DECIMAL_ROUND: 3,
	DECIMAL_FIT: 4
})
