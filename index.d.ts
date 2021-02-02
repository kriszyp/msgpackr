export { Unpackr, Decoder, unpack, decode, addExtension, FLOAT32_OPTIONS } from './unpack'
export { Packr, Encoder, pack, encode } from './pack'

export as namespace msgpackr;
export class UnpackrStream {
}
export class PackrStream {
	write(value): void
	end(value?): void
}
