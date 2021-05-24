export { Unpackr, Decoder, unpack, decode, addExtension, FLOAT32_OPTIONS, clearSource } from './unpack'
export { Packr, Encoder, pack, encode } from './pack'

export as namespace msgpackr;
export class UnpackrStream {
}
export class PackrStream {
	write(value: any): void
	end(value?: any): void
}
