export { Unpackr, Decoder, unpack, decode, addExtension } from './unpack'
export { Packr, Encoder, pack, encode, ALWAYS, DECIMAL_FIT, DECIMAL_ROUND } from './pack'

export as namespace msgpackr;
export class UnpackrStream {
}
export class PackrStream {
	write(value): void
	end(value?): void
}
