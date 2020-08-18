exports.Packr = require('./pack').Packr
exports.Unpackr = require('./unpack').Unpackr
exports.PackrStream = require('./stream').PackrStream
exports.UnpackrStream = require('./stream').UnpackrStream
let packr = new exports.Packr({ objectsAsMaps: true })
exports.unpack = packr.unpack
exports.pack = packr.pack

