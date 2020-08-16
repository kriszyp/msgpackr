exports.Serializer = require('./serialize').Serializer
exports.Parser = require('./parse').Parser
let serializer = new exports.Serializer({ objectsAsMaps: true })
exports.parse = serializer.parse
exports.serialize = serializer.serialize

