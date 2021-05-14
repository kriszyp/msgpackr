export { Decoder, decode, addExtension, FLOAT32_OPTIONS } from './decode.js'
export { Encoder, encode } from './encode.js'

export as namespace msgpackr;
export class DecoderStream {
}
export class EncoderStream {
	write(value: any): void
	end(value?: any): void
}
