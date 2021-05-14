"use strict"
let decoder
try {
	decoder = new TextDecoder()
} catch(error) {}
let src
let srcEnd
let position = 0
let alreadySet
const EMPTY_ARRAY = []
const RECORD_TAG_ID = 0x69
const STOP_CODE = {}
let strings = EMPTY_ARRAY
let stringPosition = 0
let currentDecoder = {}
let srcString
let srcStringStart = 0
let srcStringEnd = 0
let referenceMap
let currentExtensions = []
let dataView
let defaultOptions = {
	useRecords: false,
	mapsAsObjects: true
}

class Decoder {
	constructor(options) {
		if (options) {
			if (options.useRecords === false && options.mapsAsObjects === undefined)
				options.mapsAsObjects = true
			if (options.getStructures && !options.structures)
				(options.structures = []).uninitialized = true // this is what we use to denote an uninitialized structures
		}
		Object.assign(this, options)
	}
	decode(source, end, continueReading) {
		if (src) {
			// re-entrant execution, save the state and restore it after we do this decode
			return saveState(() => {
				src = null
				return this ? this.decode(source, end, continueReading) : Decoder.prototype.decode.call(defaultOptions, source, end, continueReading)
			})
		}
		srcEnd = end > -1 ? end : source.length
		position = 0
		stringPosition = 0
		srcStringEnd = 0
		srcString = null
		strings = EMPTY_ARRAY
		src = source
		// this provides cached access to the data view for a buffer if it is getting reused, which is a recommend
		// technique for getting data from a database where it can be copied into an existing buffer instead of creating
		// new ones
		dataView = source.dataView || (source.dataView = new DataView(source.buffer, source.byteOffset, source.byteLength))
		if (this) {
			currentDecoder = this
			if (this.structures) {
				currentStructures = this.structures
				try {
					return read()
				} finally {
					if (position >= srcEnd || !continueReading) {
						// finished reading this source, cleanup references
						currentStructures = null
						src = null
						if (referenceMap)
							referenceMap = null
					}
				}
			} else if (!currentStructures || currentStructures.length > 0) {
				currentStructures = []
			}
		} else {
			currentDecoder = defaultOptions
			if (!currentStructures || currentStructures.length > 0)
				currentStructures = []
		}
		try {
			return read()
		} finally {
			src = null
			if (referenceMap)
				referenceMap = null
		}
	}
}
let currentStructures
exports.Decoder = Decoder
exports.read = read
exports.getPosition = () => {
	return position
}

function read() {
	let token = src[position++]
	let majorType = token >> 5
	token = token & 0x1f
	if (token > 0x17) {
		switch (token) {
			case 0x18:
				token = src[position++]
				break
			case 0x19:
				if (majorType == 7) {
					return getFloat16()
				}
				token = dataView.getUint16(position)
				position += 2
				break
			case 0x1a:
				if (majorType == 7) {
					let value = dataView.getFloat32(position)
					if (currentDecoder.useFloat32 > 2) {
						// this does rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
						let multiplier = mult10[((src[position] & 0x7f) << 1) | (src[position + 1] >> 7)]
						position += 4
						return ((multiplier * value + (value > 0 ? 0.5 : -0.5)) >> 0) / multiplier
					}
					position += 4
					return value
				}
				token = dataView.getUint32(position)
				position += 4
				break
			case 0x1b:
				if (majorType == 7) {
					let value = dataView.getFloat64(position)
					position += 8
					return value
				}
				if (currentDecoder.uint64AsNumber)
					return src[position++] * 0x100000000000000 + src[position++] * 0x1000000000000 + src[position++] * 0x10000000000 + src[position++] * 0x100000000 +
						src[position++] * 0x1000000 + (src[position++] << 16) + (src[position++] << 8) + src[position++]
				token = dataView.getBigUint64(position)
				position += 8
				break
			case 0x1f: 
				// indefinite length
				switch(majorType) {
					case 2: // byte string
					case 3: // text string
					case 4: // array
						let array = []
						let value, i = 0
						while ((value = read()) != STOP_CODE) {
							array[i++] = value
						}
						return majorType == 4 ? array : majorType == 3 ? array.join('') : Buffer.concat(array)
					case 5: // map
						let key
						if (currentDecoder.mapsAsObjects) {
							let object = {}
							while ((key = readKey()) != STOP_CODE)
								object[key] = read()
							return object
						} else {
							let map = new Map()
							while ((key = read()) != STOP_CODE)
								map.set(key, read())
							return map
						}
					case 7:
						return STOP_CODE
					default:
						throw new Error('Invalid major type for indefinite length ' + majorType)
				}
			default:
				throw new Error('Unknown token ' + token)
		}
	}
	switch (majorType) {
		case 0: // positive int
			return token
		case 1: // negative int
			return ~token
		case 2: // buffer
			return readBin(token)
		case 3: // string
			if (srcStringEnd >= position) {
				return srcString.slice(position - srcStringStart, (position += token) - srcStringStart)
			}
			if (srcStringEnd == 0 && srcEnd < 140 && token < 32) {
				// for small blocks, avoiding the overhead of the extract call is helpful
				let string = token < 16 ? shortStringInJS(token) : longStringInJS(token)
				if (string != null)
					return string
			}
			return readFixedString(token)
		case 4: // array
			let array = new Array(token)
			for (let i = 0; i < token; i++) {
				array[i] = read()
			}
			return array
		case 5: // map
			if (currentDecoder.mapsAsObjects) {
				let object = {}
				for (let i = 0; i < token; i++) {
					object[readKey()] = read()
				}
				return object
			} else {
				let map = new Map()
				for (let i = 0; i < token; i++) {
					map.set(read(), read())
				}
				return map
			}
		case 6: // extension
			if ((token >> 8) == RECORD_TAG_ID) { // record structures
				let structure = currentStructures[token & 0xff]
				if (structure) {
					if (!structure.read)
						structure.read = createStructureReader(structure)
					return structure.read()
				} else if (currentDecoder.getStructures) {
					let updatedStructures = saveState(() => {
						// save the state in case getStructures modifies our buffer
						src = null
						return currentDecoder.getStructures()
					})
					if (currentStructures === true)
						currentDecoder.structures = currentStructures = updatedStructures
					else
						currentStructures.splice.apply(currentStructures, [0, updatedStructures.length].concat(updatedStructures))
					structure = currentStructures[token & 0xff]
					if (structure) {
						if (!structure.read)
							structure.read = createStructureReader(structure)
						return structure.read()
					} else
						return token
				} else
					return token
			} else {
				let extension = currentExtensions[token]
				if (extension) {
					if (extension.handlesRead)
						return extension(read)
					else
						return extension(read())
				}
				else
					return new Tag(read())
			}
		case 7: // fixed value
			switch (token) {
				case 0x14: return false
				case 0x15: return true
				case 0x16: return null
				case 0x17: return; // undefined
				case 0x1f: 
				default:
					throw new Error('Unknown token ' + token)
			}
		default: // negative int
			if (isNaN(token)) {
				let error = new Error('Unexpected end of CBOR data')
				error.incomplete = true
				throw error
			}
			throw new Error('Unknown CBOR token ' + token)
	}
}
const validName = /^[a-zA-Z_$][a-zA-Z\d_$]*$/
function createStructureReader(structure) {
	let l = structure.length
	function readObject() {
		// This initial function is quick to instantiate, but runs slower. After several iterations pay the cost to build the faster function
		if (readObject.count++ > 2) {
			this.read = (new Function('a', 'r', 'return function(){a();return {' + structure.map(key => validName.test(key) ? key + ':r()' : ('[' + JSON.stringify(key) + ']:r()')).join(',') + '}}'))(readArrayHeader, read)
			return this.read()
		}
		readArrayHeader(l)
		let object = {}
		for (let i = 0; i < l; i++) {
			let key = structure[i]
			object[key] = read()
		}
		return object
	}
	readObject.count = 0
	return readObject
}

function readArrayHeader(expectedLength) {
	// consume the array header, TODO: check expected length
	let token = src[position++]
	//let majorType = token >> 5
	token = token & 0x1f
	if (token > 0x17) {
		switch (token) {
			case 0x18: position++
				break
			case 0x19: position += 2
				break
			case 0x1a: position += 4
		}
	}
}

let readFixedString = readStringJS
let readString8 = readStringJS
let readString16 = readStringJS
let readString32 = readStringJS

exports.setExtractor = (extractStrings) => {
	readFixedString = readString(1)
	readString8 = readString(2)
	readString16 = readString(3)
	readString32 = readString(5)
	function readString(headerLength) {
		return function readString(length) {
			let string = strings[stringPosition++]
			if (string == null) {
				strings = extractStrings(position, srcEnd, length, src)
				stringPosition = 0
				srcStringEnd = 1 // even if a utf-8 string was decoded, must indicate we are in the midst of extracted strings and can't skip strings
				string = strings[stringPosition++]
			}
			let srcStringLength = string.length
			if (srcStringLength <= length) {
				position += length
				return string
			}
			srcString = string
			srcStringStart = position
			srcStringEnd = position + srcStringLength
			position += length
			return string.slice(0, length) // we know we just want the beginning
		}
	}
}
function readStringJS(length) {
	let result
	if (length < 16) {
		if (result = shortStringInJS(length))
			return result
	}
	if (length > 64 && decoder)
		return decoder.decode(src.subarray(position, position += length))
	const end = position + length
	const units = []
	result = ''
	while (position < end) {
		const byte1 = src[position++]
		if ((byte1 & 0x80) === 0) {
			// 1 byte
			units.push(byte1)
		} else if ((byte1 & 0xe0) === 0xc0) {
			// 2 bytes
			const byte2 = src[position++] & 0x3f
			units.push(((byte1 & 0x1f) << 6) | byte2)
		} else if ((byte1 & 0xf0) === 0xe0) {
			// 3 bytes
			const byte2 = src[position++] & 0x3f
			const byte3 = src[position++] & 0x3f
			units.push(((byte1 & 0x1f) << 12) | (byte2 << 6) | byte3)
		} else if ((byte1 & 0xf8) === 0xf0) {
			// 4 bytes
			const byte2 = src[position++] & 0x3f
			const byte3 = src[position++] & 0x3f
			const byte4 = src[position++] & 0x3f
			let unit = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4
			if (unit > 0xffff) {
				unit -= 0x10000
				units.push(((unit >>> 10) & 0x3ff) | 0xd800)
				unit = 0xdc00 | (unit & 0x3ff)
			}
			units.push(unit)
		} else {
			units.push(byte1)
		}

		if (units.length >= 0x1000) {
			result += fromCharCode.apply(String, units)
			units.length = 0
		}
	}

	if (units.length > 0) {
		result += fromCharCode.apply(String, units)
	}

	return result
}
let fromCharCode = String.fromCharCode
function longStringInJS(length) {
	let start = position
	let bytes = new Array(length)
	for (let i = 0; i < length; i++) {
		const byte = src[position++];
		if ((byte & 0x80) > 0) {
			position = start
    			return
    		}
    		bytes[i] = byte
    	}
    	return fromCharCode.apply(String, bytes)
}
function shortStringInJS(length) {
	if (length < 4) {
		if (length < 2) {
			if (length === 0)
				return ''
			else {
				let a = src[position++]
				if ((a & 0x80) > 1) {
					position -= 1
					return
				}
				return fromCharCode(a)
			}
		} else {
			let a = src[position++]
			let b = src[position++]
			if ((a & 0x80) > 0 || (b & 0x80) > 0) {
				position -= 2
				return
			}
			if (length < 3)
				return fromCharCode(a, b)
			let c = src[position++]
			if ((c & 0x80) > 0) {
				position -= 3
				return
			}
			return fromCharCode(a, b, c)
		}
	} else {
		let a = src[position++]
		let b = src[position++]
		let c = src[position++]
		let d = src[position++]
		if ((a & 0x80) > 0 || (b & 0x80) > 0 || (c & 0x80) > 0 || (d & 0x80) > 0) {
			position -= 4
			return
		}
		if (length < 6) {
			if (length === 4)
				return fromCharCode(a, b, c, d)
			else {
				let e = src[position++]
				if ((e & 0x80) > 0) {
					position -= 5
					return
				}
				return fromCharCode(a, b, c, d, e)
			}
		} else if (length < 8) {
			let e = src[position++]
			let f = src[position++]
			if ((e & 0x80) > 0 || (f & 0x80) > 0) {
				position -= 6
				return
			}
			if (length < 7)
				return fromCharCode(a, b, c, d, e, f)
			let g = src[position++]
			if ((g & 0x80) > 0) {
				position -= 7
				return
			}
			return fromCharCode(a, b, c, d, e, f, g)
		} else {
			let e = src[position++]
			let f = src[position++]
			let g = src[position++]
			let h = src[position++]
			if ((e & 0x80) > 0 || (f & 0x80) > 0 || (g & 0x80) > 0 || (h & 0x80) > 0) {
				position -= 8
				return
			}
			if (length < 10) {
				if (length === 8)
					return fromCharCode(a, b, c, d, e, f, g, h)
				else {
					let i = src[position++]
					if ((i & 0x80) > 0) {
						position -= 9
						return
					}
					return fromCharCode(a, b, c, d, e, f, g, h, i)
				}
			} else if (length < 12) {
				let i = src[position++]
				let j = src[position++]
				if ((i & 0x80) > 0 || (j & 0x80) > 0) {
					position -= 10
					return
				}
				if (length < 11)
					return fromCharCode(a, b, c, d, e, f, g, h, i, j)
				let k = src[position++]
				if ((k & 0x80) > 0) {
					position -= 11
					return
				}
				return fromCharCode(a, b, c, d, e, f, g, h, i, j, k)
			} else {
				let i = src[position++]
				let j = src[position++]
				let k = src[position++]
				let l = src[position++]
				if ((i & 0x80) > 0 || (j & 0x80) > 0 || (k & 0x80) > 0 || (l & 0x80) > 0) {
					position -= 12
					return
				}
				if (length < 14) {
					if (length === 12)
						return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l)
					else {
						let m = src[position++]
						if ((m & 0x80) > 0) {
							position -= 13
							return
						}
						return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m)
					}
				} else {
					let m = src[position++]
					let n = src[position++]
					if ((m & 0x80) > 0 || (n & 0x80) > 0) {
						position -= 14
						return
					}
					if (length < 15)
						return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n)
					let o = src[position++]
					if ((o & 0x80) > 0) {
						position -= 15
						return
					}
					return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o)
				}
			}
		}
	}
}

function readBin(length) {
	return currentDecoder.copyBuffers ?
		// specifically use the copying slice (not the node one)
		Uint8Array.prototype.slice.call(src, position, position += length) :
		src.subarray(position, position += length)
}
function readExt(length) {
	let type = src[position++]
	if (currentExtensions[type]) {
		return currentExtensions[type](src.subarray(position, position += length))
	}
	else
		throw new Error('Unknown extension type ' + type)
}

function getFloat16() {
	let byte0 = src[position++]
	let byte1 = src[position++]
	let half = (byte0 << 8) + byte1
	let exp = (half >> 10) & 0x1f
	let mant = half & 0x3ff
	let val
	if (exp == 0) val = Math.exp(mant, -24)
	else if (exp != 31) val = Math.exp(mant + 1024, exp - 25)
	else val = mant == 0 ? Infinity : NaN
	return half & 0x8000 ? -val : val
}

let keyCache = new Array(4096)
function readKey() {
	let length = src[position++]
	if (length >= 0x60 && length < 0x78) {
		// fixstr, potentially use key cache
		length = length - 0x60
		if (srcStringEnd >= position) // if it has been extracted, must use it (and faster anyway)
			return srcString.slice(position - srcStringStart, (position += length) - srcStringStart)
		else if (!(srcStringEnd == 0 && srcEnd < 180))
			return readFixedString(length)
	} else { // not cacheable, go back and do a standard read
		position--
		return read()
	}
	let key = ((length << 5) ^ (length > 1 ? dataView.getUint16(position) : length > 0 ? src[position] : 0)) & 0xfff
	let entry = keyCache[key]
	let checkPosition = position
	let end = position + length - 3
	let chunk
	let i = 0
	if (entry && entry.bytes == length) {
		while (checkPosition < end) {
			chunk = dataView.getUint32(checkPosition)
			if (chunk != entry[i++]) {
				checkPosition = 0x70000000
				break
			}
			checkPosition += 4
		}
		end += 3
		while (checkPosition < end) {
			chunk = src[checkPosition++]
			if (chunk != entry[i++]) {
				checkPosition = 0x70000000
				break
			}
		}
		if (checkPosition === end) {
			position = checkPosition
			return entry.string
		}
		end -= 3
		checkPosition = position
	}
	entry = []
	keyCache[key] = entry
	entry.bytes = length
	while (checkPosition < end) {
		chunk = dataView.getUint32(checkPosition)
		entry.push(chunk)
		checkPosition += 4
	}
	end += 3
	while (checkPosition < end) {
		chunk = src[checkPosition++]
		entry.push(chunk)
	}
	// for small blocks, avoiding the overhead of the extract call is helpful
	let string = length < 16 ? shortStringInJS(length) : longStringInJS(length)
	if (string != null)
		return entry.string = string
	return entry.string = readFixedString(length)
}

class Tag {
	constructor(value) {
		this.value = value
	}
}

let glbl = typeof window == 'object' ? window : global

currentExtensions[0] = (dateString) => {
	// string date extension
	return new Date(dateString)
}

currentExtensions[1] = (epochSec) => {
	// numeric date extension
	return new Date(epochSec * 1000)
}

currentExtensions[2] = (buffer) => {
	// bigint extension
	return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getBigUint64(0)
}

currentExtensions[3] = (buffer) => {
	// negative bigint extension
	return BigInt(-1) - (new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getBigUint64(0))
}

// the registration of the record definition extension (tag 105)
const recordDefinition = () => {
	let definition = read()
	let structure = definition[0]
	let id = definition[1]
	currentStructures[id & 0xff] = structure
	structure.read = createStructureReader(structure)
	let object = {}
	for (let i = 2,l = definition.length; i < l; i++) {
		let key = structure[i - 2]
		object[key] = definition[i]
	}
	return object
}

recordDefinition.handlesRead = true
currentExtensions[RECORD_TAG_ID] = recordDefinition

currentExtensions[27] = (data) => { // http://cbor.schmorp.de/generic-object
	return (glbl[data[0]] || Error)(data[1], data[2])
}

currentExtensions[40009] = (id) => {
	// id extension (for structured clones)
	if (!referenceMap)
		referenceMap = new Map()
	let token = src[position]
	let target
	// TODO: handle Maps, Sets, and other types that can cycle; this is complicated, because you potentially need to read
	// ahead past references to record structure definitions
	if ((token >> 5) == 4)
		target = []
	else
		target = {}

	let refEntry = { target } // a placeholder object
	referenceMap.set(id, refEntry)
	let targetProperties = read() // read the next value as the target object to id
	if (refEntry.used) // there is a cycle, so we have to assign properties to original target
		return Object.assign(target, targetProperties)
	refEntry.target = targetProperties // the placeholder wasn't used, replace with the deserialized one
	return targetProperties // no cycle, can just use the returned read object
}

currentExtensions[40010] = (id) => {
	// pointer extension (for structured clones)
	let refEntry = referenceMap.get(id)
	refEntry.used = true
	return refEntry.target
}

currentExtensions[258] = (array) => new Set(array) // https://github.com/input-output-hk/cbor-sets-spec/blob/master/CBOR_SETS.md

const typedArrays = ['Uint8', 'Uint8Clamped', 'Uint16', 'Uint32', 'BigUint64','Int8', 'Int16', 'Int32', 'BigInt64', 'Float32', 'Float64'].map(type => type + 'Array')
const typedArrayTags = [64, 68, 69, 70, 71, 72, 77, 78, 79, 81, 82]
for (let i = 0; i < typedArrays.length; i++) {
	registerTypedArray(typedArrays[i], typedArrayTags[i])
}
function registerTypedArray(typedArrayName, tag) {
	currentExtensions[tag] = (buffer) => {
		if (!typedArrayName)
			throw new Error('Could not find typed array for code ' + typeCode)
		// we have to always slice/copy here to get a new ArrayBuffer that is word/byte aligned
		return new glbl[typedArrayName](Uint8Array.prototype.slice.call(buffer, 0).buffer)
	}
}

function saveState(callback) {
	let savedSrcEnd = srcEnd
	let savedPosition = position
	let savedStringPosition = stringPosition
	let savedSrcStringStart = srcStringStart
	let savedSrcStringEnd = srcStringEnd
	let savedSrcString = srcString
	let savedStrings = strings
	let savedReferenceMap = referenceMap
	// TODO: We may need to revisit this if we do more external calls to user code (since it could be slow)
	let savedSrc = new Uint8Array(src.slice(0, srcEnd)) // we copy the data in case it changes while external data is processed
	let savedStructures = currentStructures
	let savedDecoder = currentDecoder
	let value = callback()
	srcEnd = savedSrcEnd
	position = savedPosition
	stringPosition = savedStringPosition
	srcStringStart = savedSrcStringStart
	srcStringEnd = savedSrcStringEnd
	srcString = savedSrcString
	strings = savedStrings
	referenceMap = savedReferenceMap
	src = savedSrc
	currentStructures = savedStructures
	currentDecoder = savedDecoder
	dataView = new DataView(src.buffer, src.byteOffset, src.byteLength)
	return value
}
exports.clearSource = function() {
	src = null
}

exports.addExtension = function(extension) {
	currentExtensions[extension.tag] = extension.decode
}

let mult10 = new Array(147) // this is a table matching binary exponents to the multiplier to determine significant digit rounding
for (let i = 0; i < 256; i++) {
	mult10[i] = +('1e' + Math.floor(45.15 - i * 0.30103))
}
exports.mult10 = mult10
exports.typedArrays = typedArrays
exports.useRecords = false
exports.mapsAsObjects = true
exports.Tag = Tag