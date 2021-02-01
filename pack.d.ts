import { Unpackr } from './unpack'
export { addExtension } from './unpack'
export class Packr extends Unpackr {
	pack(value: any): Buffer
	encode(value: any): Buffer
}
export class Encoder extends Packr {}
export function pack(value: any): Buffer
export function encode(value: any): Buffer
export const ALWAYS = 1
export const DECIMAL_ROUND = 3
export const DECIMAL_FIT = 4
