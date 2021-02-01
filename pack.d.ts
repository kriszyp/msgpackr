import { Unpackr } from './unpack'
export { addExtension, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT } from './unpack'
export class Packr extends Unpackr {
	pack(value: any): Buffer
	encode(value: any): Buffer
}
export class Encoder extends Packr {}
export function pack(value: any): Buffer
export function encode(value: any): Buffer
