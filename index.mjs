import packModule from './pack.js'
import unpackModule from './unpack.js'

export const Packr = packModule.Packr
export const addExtension = packModule.addExtension
export const Encoder = packModule.Packr
let extractor = tryRequire('msgpackr-extract')
if (extractor)
	unpackModule.setExtractor(extractor.extractStrings)
export const Unpackr = unpackModule.Unpackr
export const Decoder = unpackModule.Unpackr
import stream from './stream.js'
export const PackrStream = stream.PackrStream
export const UnpackrStream = stream.UnpackrStream
export const EncoderStream = stream.PackrStream
export const DecoderStream = stream.UnpackrStream
let packr = new packModule.Packr({ useRecords: false })
export const unpack = packr.unpack
export const pack = packr.pack
export const decode = packr.unpack
export const encode = packr.pack
export const ALWAYS = 1
export const DECIMAL_ROUND = 3
export const DECIMAL_FIT = 4


function tryRequire(moduleId) {
	try {
		let require =  module.createRequire()
		return require(moduleId)
	} catch (error) {
		if (typeof window == 'undefined')
			console.warn('Native extraction module not loaded, msgpackr will still run, but with decreased performance. ' + error.message.split('\n')[0])
		else
			console.warn('For browser usage, directly use msgpackr/unpack or msgpackr/pack modules. ' + error.message.split('\n')[0])
	}
}