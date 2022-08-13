import { Unpackr } from './unpack.js'
export { addExtension, FLOAT32_OPTIONS } from './unpack.js'
export class Packr extends Unpackr {
	pack(value: any): Buffer
	encode(value: any): Buffer
}
export class Encoder extends Packr {}
export function pack(value: any): Buffer
export function encode(value: any): Buffer
