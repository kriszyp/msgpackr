export { Packr, Encoder, addExtension, pack, encode, NEVER, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT } from './pack.js'
export { Unpackr, Decoder, C1, unpack, unpackMultiple, decode, FLOAT32_OPTIONS, clearSource, roundFloat32, isNativeAccelerationEnabled } from './unpack.js'
export { PackrStream, UnpackrStream, PackrStream as EncoderStream, UnpackrStream as DecoderStream } from './stream.js'
export { decodeIter, encodeIter } from './iterators.js'
export const useRecords = false
export const mapsAsObjects = true
import { setExtractor } from './unpack.js'
import { createRequire } from 'module'

const extractor = tryRequire('msgpackr-extract')
if (extractor)
	setExtractor(extractor.extractStrings)

function tryRequire(moduleId) {
	try {
		let require = createRequire(import.meta.url)
		return require(moduleId)
	} catch (error) {
		// native module is optional
	}
}