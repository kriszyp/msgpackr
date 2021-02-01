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
	pack(value: any): Buffer
	unpack(messagePack: Buffer): any
}
export class Unpackr {
	constructor(options?: Options)
	unpack(messagePack: Buffer): any
	decode(messagePack: Buffer): any
}
export class Decoder extends Unpackr {}
export function unpack(messagePack: Buffer): any
export function decode(messagePack: Buffer): any
export function addExtension(extension: Extension)
export const C1: {}