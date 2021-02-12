import packModule from './pack.js'
import unpackModule from './unpack.js'
import { createRequire } from 'module'

export const Packr = packModule.Packr
export const addExtension = packModule.addExtension
export const Encoder = packModule.Packr
export const Unpackr = unpackModule.Unpackr
export const Decoder = unpackModule.Unpackr
export const C1 = unpackModule.C1
let packr = new packModule.Packr({ useRecords: false })
export const unpack = packr.unpack
export const unpackMultiple = packr.unpackMultiple
export const pack = packr.pack
export const decode = packr.unpack
export const encode = packr.pack
export const useRecords = false
export const mapsAsObjects = true
export const FLOAT32_OPTIONS = unpackModule.FLOAT32_OPTIONS
export const ALWAYS = 1
export const DECIMAL_ROUND = 3
export const DECIMAL_FIT = 4
