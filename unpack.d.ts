export enum FLOAT32_OPTIONS {
	NEVER = 0,
	ALWAYS = 1,
	DECIMAL_ROUND = 3,
	DECIMAL_FIT = 4
}

export interface Options {
	useFloat32?: FLOAT32_OPTIONS
	useRecords?: boolean
	structures?: {}[]
	moreTypes?: boolean
	structuredClone?: boolean
	mapsAsObjects?: boolean
	variableMapSize?: boolean
	copyBuffers?: boolean
	bundleStrings?: boolean
	useTimestamp32?: boolean
	largeBigIntToFloat?: boolean
	encodeUndefinedAsNil?: boolean
	maxSharedStructures?: number
	maxOwnStructures?: number
	int64AsNumber?: boolean
	shouldShareStructure?: (keys: string[]) => boolean
	getStructures?(): {}[]
	saveStructures?(structures: {}[]): boolean | void
	onInvalidDate?: () => any
}
interface Extension {
	Class: Function
	type: number
	pack?(value: any): Buffer | Uint8Array
	unpack?(messagePack: Buffer | Uint8Array): any	
	read?(datum: any): any
	write?(instance: any): any
}
export class Unpackr {
	constructor(options?: Options)
	unpack(messagePack: Buffer | Uint8Array): any
	decode(messagePack: Buffer | Uint8Array): any
	unpackMultiple(messagePack: Buffer | Uint8Array, forEach?: (value: any) => any): [] | void
}
export class Decoder extends Unpackr {}
export function unpack(messagePack: Buffer | Uint8Array): any
export function unpackMultiple(messagePack: Buffer | Uint8Array, forEach?: (value: any) => any): [] | void
export function decode(messagePack: Buffer | Uint8Array): any
export function addExtension(extension: Extension): void
export function clearSource(): void
export function roundFloat32(float32Number: number): number
export const C1: {}
export let isNativeAccelerationEnabled: boolean