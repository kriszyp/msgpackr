interface Options {
	useFloat32?: 0 | typeof ALWAYS | typeof DECIMAL_ROUND | typeof DECIMAL_FIT
	useRecords?: boolean
	structures?: {}[]
	structuredClone?: boolean
	mapsAsObjects?: boolean
	variableMapSize?: boolean
	copyBuffers?: boolean
	useTimestamp32?: boolean
	largeBigIntToFloat?: boolean
	getStructures?(): {}[]
	saveStructures?(structures: {}[]): boolean | void
}
interface Extension {
	Class: Function
	type: number
	pack(value: any): Buffer | Uint8Array
	unpack(messagePack: Buffer | Uint8Array): any
}
export class Unpackr {
	constructor(options?: Options)
	unpack(messagePack: Buffer | Uint8Array): any
	decode(messagePack: Buffer | Uint8Array): any
}
export class Decoder extends Unpackr {}
export function unpack(messagePack: Buffer | Uint8Array): any
export function decode(messagePack: Buffer | Uint8Array): any
export function addExtension(extension: Extension): void
export const C1: {}
export const ALWAYS = 1
export const DECIMAL_ROUND = 3
export const DECIMAL_FIT = 4
