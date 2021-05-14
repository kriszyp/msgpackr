export { Encoder, addExtension, encode } from './encode.js'
export { Tag, Decoder, decodeMultiple, decode, FLOAT32_OPTIONS } from './decode.js'
export { EncoderStream, DecoderStream } from './stream.js'
import { setExtractor } from './decode.js'
import { createRequire } from 'module'

const extractor = tryRequire('msgpackr-extract')
if (extractor)
	setExtractor(extractor.extractStrings)
/*
Object.assign(exports, unpackModule.FLOAT32_OPTIONS)
*/
function tryRequire(moduleId) {
	try {
		let require = createRequire(import.meta.url)
		return require(moduleId)
	} catch (error) {
		if (typeof window == 'undefined')
			console.warn('Native extraction module not loaded, msgpackr will still run, but with decreased performance. ' + error.message.split('\n')[0])
		else
			console.warn('For browser usage, directly use msgpackr/unpack or msgpackr/pack modules. ' + error.message.split('\n')[0])
	}
}