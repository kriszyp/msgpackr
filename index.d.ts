export { Decoder, decode, addExtension, FLOAT32_OPTIONS, clearSource } from './decode.js'
export { Encoder, encode } from './encode.js'

export as namespace CBOR;
export class DecoderStream {
}
export class EncoderStream {
	write(value: any): void
	end(value?: any): void
}
