exports.Packr = require('./pack').Packr
exports.Unpackr = require('./unpack').Unpackr
let packr = new exports.Packr({ objectsAsMaps: true })
exports.unpack = packr.unpack
exports.pack = packr.pack

