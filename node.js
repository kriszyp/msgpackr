export { Packr, Encoder, addExtension, pack, encode, NEVER, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT } from './pack.js'
export { Unpackr, Decoder, C1, unpack, unpackMultiple, decode, FLOAT32_OPTIONS } from './unpack.js'
export { PackrStream, UnpackrStream, PackrStream as EncoderStream, UnpackrStream as DecoderStream } from './stream.js'
import { setExtractor } from './unpack.js'
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