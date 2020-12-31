import encodeModule from './encode.js'
import decodeModule from './decode.js'
import { createRequire } from 'module'

export const Encoder = encodeModule.Encoder
export const addExtension = encodeModule.addExtension
let extractor = tryRequire('cbor-extract')
if (extractor)
	decodeModule.setExtractor(extractor.extractStrings)
export const Decoder = decodeModule.Decoder
export const Tag = decodeModule.Tag
import stream from './stream.js'
export const EncoderStream = stream.EncoderStream
export const DecoderStream = stream.DecoderStream
let encoder = new encodeModule.Encoder({ useRecords: false })
export const decode = encoder.decode
export const encode = encoder.encode
export const ALWAYS = 1
export const DECIMAL_ROUND = 3
export const DECIMAL_FIT = 4


function tryRequire(moduleId) {
	try {
		let require = createRequire(import.meta.url)
		return require(moduleId)
	} catch (error) {
		if (typeof window == 'undefined')
			console.warn('Native extraction module not loaded, cbor-x will still run, but with decreased performance. ' + error.message.split('\n')[0])
		else
			console.warn('For browser usage, directly use encode/decode modules. ' + error.message.split('\n')[0])
	}
}