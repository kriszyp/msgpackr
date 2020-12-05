declare module 'cbor-x' {
	interface Options {
		useFloat32?: 0 | typeof ALWAYS | typeof DECIMAL_ROUND | typeof DECIMAL_FIT
		useRecords?: boolean
		structures?: {}[]
		structuredClone?: boolean
		mapsAsObjects?: boolean
		variableMapSize?: boolean
		copyBuffers?: boolean
		useTimestamp32?: boolean
		getStructures?(): {}[]
		saveStructures?(structures: {}[]): boolean | void
	}
	export class Decoder {
		constructor(options?: Options)
		decode(messagePack: Buffer): any
	}
	export class Encoder extends Decoder {
		encode(value: any): Buffer
		resetMemory(): void
	}

	interface Extension {
		Class: Function
		type: number
		encode(value: any): Buffer
		decode(messagePack: Buffer): any
	}
	export function decode(messagePack: Buffer): any
	export function encode(value: any): Buffer
	export function addExtension(extension: Extension)
	export const ALWAYS = 1
	export const DECIMAL_ROUND = 3
	export const DECIMAL_FIT = 4
	export class DecoderStream {
	}
	export class EncoderStream {
		write(value)
		end(value?)
	}
}