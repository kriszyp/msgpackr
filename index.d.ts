export { Unpackr, Decoder, unpack, decode, addExtension, FLOAT32_OPTIONS, clearSource } from './unpack'
export { Packr, Encoder, pack, encode } from './pack'
import { Transform } from 'stream'

export as namespace msgpackr;
export class UnpackrStream extends Transform {
}
export class PackrStream extends Transform {
}
