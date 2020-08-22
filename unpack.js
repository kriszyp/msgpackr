"use strict"
let decoder
try {
	decoder = new TextDecoder()
} catch(error) {}
let extractStrings
let src
let srcEnd
let position = 0
let alreadySet
const EMPTY_ARRAY = []
let strings = EMPTY_ARRAY
let stringPosition = 0
let currentUnpackr = {}
let srcString
let srcStringStart = 0
let srcStringEnd = 0
let currentExtensions = []
let dataView
let defaultOptions = { objectsAsMaps: true }
// the registration of the record definition extension (as "r")
const recordDefinition = currentExtensions[0x72] = (id) => {
	let structure = currentStructures[id & 0x3f] = read()
	structure.read = createStructureReader(structure)
	return structure.read()
}
currentExtensions[0] = (data) => {} // notepack defines extension 0 to mean undefined, so use that as the default here
currentExtensions[0xd6] = (data) => {
	// 32-bit date extension
	return new Date(((data[0] << 24) + (data[1] << 16) + (data[2] << 8) + data[3]) * 1000)

} // notepack defines extension 0 to mean undefined, so use that as the default here
// registration of bulk record definition?
// currentExtensions[0x52] = () =>
class Unpackr {
	constructor(options) {
		Object.assign(this, options)
	}
	unpack(source, end) {
		srcEnd = end > -1 ? end : source.length
		position = 0
		stringPosition = 0
		srcStringEnd = 0
		srcString = null
		strings = EMPTY_ARRAY
//		if (src !== source) {
		src = source
		dataView = source.dataView
		//dataView = new DataView(source.buffer, source.byteOffset, source.byteLength)
///			setSource(source)
//		}
		let value
		if (this) {
			currentUnpackr = this
			if (this.structures) {
				currentStructures = this.structures
				value = read()
				if (position >= srcEnd) {
					// finished reading this source, cleanup references
					currentStructures = null
					src = null
				}
				return value
			} else if (!currentStructures || currentStructures.length > 0) {
				currentStructures = []
			}
		} else
			currentUnpackr = defaultOptions
//		setSource(source)
//		return readNext()
		value = read()
		src = null
		return value
	}
}
let currentStructures
exports.Unpackr = Unpackr
exports.read = read
exports.getPosition = () => {
	return position
}

function read() {
	let token = src[position++]
	if (token < 0xa0) {
		if (token < 0x80) {
			if (token < 0x40)
				return token
			else {
				let structure = currentStructures[token & 0x3f]
				if (structure) {
					if (!structure.read)
						structure.read = createStructureReader(structure)
					return structure.read()
				} else if (currentUnpackr.getStructures) {
					// we have to preserve our state anytime we provide a means for external code to re-execute unpack
					let updatedStructures = saveState(() => currentUnpackr.getStructures()) || []
					currentStructures.splice.apply(currentStructures, [0, updatedStructures.length].concat(updatedStructures))
					structure = currentStructures[token & 0x3f]
					if (structure) {
						if (!structure.read)
							structure.read = createStructureReader(structure)
						return structure.read()
					} else
						return token
				} else
					return token
			}
		} else if (token < 0x90) {
			// map
			token -= 0x80
			if (currentUnpackr.objectsAsMaps) {
				let object = {}
				for (let i = 0; i < token; i++) {
					object[read()] = read()
				}
				return object
			} else {
				let map = new Map()
				for (let i = 0; i < token; i++) {
					map.set(read(), read())
				}
				return map
			}
		} else {
			token -= 0x90
			let array = new Array(token)
			for (let i = 0; i < token; i++) {
				array[i] = read()
			}
			return array
		}
	} else if (token < 0xc0) {
		// fixstr
		let length = token - 0xa0
		if (srcStringEnd >= position) {
			return srcString.slice(position - srcStringStart, (position += length) - srcStringStart)
		}
		if (srcStringEnd == 0 && length < 8 && srcEnd < 128) {
			// for small blocks, avoiding the overhead of the extract call is helpful
			let string = simpleString(length)
			if (string != null)
				return string
		}
		return readFixedString(length)
	} else {
		let value
		switch (token) {
			case 0xc0: return null
			case 0xc1: return; // "never-used", just return undefined for now
			case 0xc2: return false
			case 0xc3: return true
			case 0xc4:
				// bin 8
				return readBin(src[position++])
			case 0xc5:
				// bin 16
				return readBin((src[position++] << 8) + src[position++])
			case 0xc6:
				// bin 32
				return readBin((src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++])
			case 0xc7:
				// ext 8
				return readExt(src[position++])
			case 0xc8:
				// ext 16
				return readExt((src[position++] << 8) + src[position++])
			case 0xc9:
				// ext 32
				return readExt((src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++])
			case 0xca:
				if (!dataView)
					dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength))
				value = dataView.getFloat32(position)
				position += 4
				return value
			case 0xcb:
				if (!dataView)
					dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength))
				value = dataView.getFloat64(position)
				position += 8
				return value
			// uint handlers
			case 0xcc:
				return src[position++]
			case 0xcd:
				return (src[position++] << 8) + src[position++]
			case 0xce:
				return (src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++]
			case 0xcf:
				value = currentUnpackr.useBigInts ? dataView.getBigUInt64(position) : src.readUIntBE(position + 2, 6)
				position += 8
				return value

			// int handlers
			case 0xd0:
				if (!dataView)
					dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength))
				return dataView.getInt8(position++)
			case 0xd1:
				if (!dataView)
					dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength))
				value = dataView.getInt16(position)
				position += 2
				return value
			case 0xd2:
				if (!dataView)
					dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength))
				value = dataView.getInt32(position)
				position += 4
				return value
			case 0xd3:
				if (!dataView)
					dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength))
				value = currentUnpackr.useBigInts ? dataView.getBigInt64(position) : src.readIntBE(position + 2, 6)
				position += 8
				return value

			case 0xd4:
				// fixext 1
				value = src[position++]
				if (value == 0x72) {
					return recordDefinition(src[position++])
				} else {
					if (currentExtensions[value])
						return currentExtensions[value](src[position++])
					else
						throw new Error('Unknown extension ' + value)
				}
			case 0xd5:
				// fixext 2
				value = src[position++]
				return readExt(2)
			case 0xd6:
				// fixext 4
				value = src[position++]
				return readExt(4)
			case 0xd7:
				// fixext 8
				value = src[position++]
				return readExt(8)
			case 0xd8:
				// fixext 16
				value = src[position++]
				return readExt(16)
			case 0xd9:
			// str 8
				value = src[position++]
				if (srcStringEnd >= position) {
					return srcString.slice(position - srcStringStart, (position += value) - srcStringStart)
				}
				return readString8(value)
			case 0xda:
			// str 16
				return readString16((src[position++] << 8) + src[position++])
			case 0xdb:
			// str 32
				return readString32((src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++])
			case 0xdc:
			// array 16
				return readArray((src[position++] << 8) + src[position++])
			case 0xdd:
			// array 32
				return readArray((src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++])
			case 0xde:
			// map 16
				return readMap((src[position++] << 8) + src[position++])
			case 0xdf:
			// map 32
				return readMap((src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++])
			default: // negative int
				if (token >= 0xe0)
					return token - 0x100
				if (token === undefined) {
					let error = new Error('Unexpected end of MessagePack data')
					error.incomplete = true
					throw error
				}
				throw new Error('Unknown MessagePack token ' + token)

		}
	}
}
const validName = /^[a-zA-Z_$][a-zA-Z\d_$]*$/
function createStructureReader(structure) {
	function readObject() {
		// This initial function is quick to instantiate, but runs slower. After several iterations pay the cost to build the faster function
		if (readObject.count++ > 2) {
			this.read = (new Function('r', 'return function(){return {' + structure.map(key => validName.test(key) ? key + ':r()' : ('[' + JSON.stringify(key) + ']:r()')).join(',') + '}}'))(read)
			return this.read()
		}
		let object = {}
		for (let i = 0, l = structure.length; i < l; i++) {
			let key = structure[i]
			object[key] = read()
		}
		return object
	}
	readObject.count = 0
	return readObject
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
				strings = extractStrings(position - headerLength, srcEnd, src)
				stringPosition = 0
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
	if (length > 64 && decoder)
		return decoder.decode(src.subarray(position, position += length))
	const end = position + length
	const units = []
	let result = ''
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
/*function readShortString(length) {
	let start = position
	let end = start + length
	while (position < end) {
		const byte = src[position++];
		if ((byte & 0x80) > 0) {
			position = end
			console.log('utf8 slice')
			return src.utf8Slice(start, end)
		}
	}
	if (srcStringEnd < end) {
		srcStringStart = start
		srcStringEnd = start + 8192
		srcString = src.toString('latin1', start, srcStringEnd)
	}
	return srcString.slice(start - srcStringStart, end - srcStringStart)
}*/
function readArray(length) {
	let array = new Array(length)
	for (let i = 0; i < length; i++) {
		array[i] = read()
	}
	return array
}

function readMap(length) {
	if (currentUnpackr.objectsAsMaps) {
		let object = {}
		for (let i = 0; i < length; i++) {
			object[read()] = read()
		}
		return object
	} else {
		let map = new Map()
		for (let i = 0; i < length; i++) {
			map.set(read(), read())
		}
		return map
	}
}

let fromCharCode = String.fromCharCode
/*function simpleString(length) {
	let start = position
	for (let i = 0; i < length; i++) {
		const byte = src[position++];
		if ((byte & 0x80) > 0) {
			position -= i + 1
    			return
    		}
    	}
    	return asString.slice(start, position)
}*/
function simpleString(length) {
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
				if ((e & 0x80) > 1) {
					position -= 5
					return
				}
				return fromCharCode(a, b, c, d, e)
			}
		} else {
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
				position -= 3
				return
			}
			return fromCharCode(a, b, c, d, e, f, g)
		}

	}
}

function readBin(length) {
	return src.slice(position, position += length)
}
function readExt(length) {
	let type = src[position++]
	if (currentExtensions[type]) {
		return currentExtensions[type](src.slice(position, position += length))
	}
	else
		throw new Error('Unknown extension type ' + type)
}

function saveState(callback) {
	let savedSrcEnd = srcEnd
	let savedPosition = position
	let savedStringPosition = stringPosition
	let savedSrcStringStart = srcStringStart
	let savedSrcStringEnd = srcStringEnd
	let savedSrcString = srcString
	let savedStrings = strings
	// TODO: We may need to revisit this if we do more external calls to user code (since it could be slow)
	let savedSrc = Buffer.from(src.slice(0, srcEnd)) // we copy the data in case it changes while external data is processed
	let savedStructures = currentStructures
	let savedPackr = currentUnpackr
	let value = callback()
	srcEnd = savedSrcEnd
	position = savedPosition
	stringPosition = savedStringPosition
	srcStringStart = savedSrcStringStart
	srcStringEnd = savedSrcStringEnd
	srcString = savedSrcString
	strings = savedStrings
	src = savedSrc
	currentStructures = savedStructures
	currentUnpackr = savedPackr
	dataView = null
	return value
}