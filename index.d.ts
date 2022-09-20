export {
	Unpackr,
	Decoder,
	unpack,
	unpackMultiple,
	decode,
	addExtension,
	FLOAT32_OPTIONS,
	clearSource,
	roundFloat32,
	isNativeAccelerationEnabled,
} from './unpack.js'
import { Options } from './unpack.js'
export { Packr, Encoder, pack, encode } from './pack.js'
import { Transform, Readable } from 'stream'

export as namespace msgpackr;
export class UnpackrStream extends Transform {
	constructor(options?: Options | { highWaterMark: number, emitClose: boolean, allowHalfOpen: boolean })
}
export class PackrStream extends Transform {
	constructor(options?: Options | { highWaterMark: number, emitClose: boolean, allowHalfOpen: boolean })
}
