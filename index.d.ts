declare module 'msgpackr' {
	interface Options {
		useFloat32: number
	}
	export class Unpackr {
		constructor(options?: Options)
		unpack(messagePack: Buffer): any
		decode(messagePack: Buffer): any
	}
	export class Decoder extends Unpackr {}
	export class Packr extends Unpackr {
		pack(value: any): Buffer
		encode(value: any): Buffer
		resetMemory(): void
	}
	export class Encoder extends Packr {}
	interface Extension {
		Class: Function
		type: number
		pack(value: any): Buffer
		unpack(messagePack: Buffer): any
	}
	export function unpack(messagePack: Buffer): any
	export function pack(value: any): Buffer
	export function decode(messagePack: Buffer): any
	export function encode(value: any): Buffer
	export function addExtension(extension: Extension)
	export const ALWAYS = 1
	export const DECIMAL_ROUND = 3
	export const DECIMAL_FIT = 4
	export class UnpackrStream {
	}
	export class PackrStream {
		write(value)
		end(value?)
	}
}