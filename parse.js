let { setSource, readStrings } = require('./build/Release/msgpack.node')
let src
let position = 0
let alreadySet
const EMPTY_ARRAY = []
let strings = EMPTY_ARRAY
let stringPosition = 0
let currentConfig = {}
let asString
class Parser {
	constructor(options) {
		Object.assign(this, options)
	}
	parse(source) {
		position = 0
		stringPosition = 0
		if (src !== source) {
			src = source
			setSource(source)
			asString = source.toString('latin1')
		}
		if (this.structures) {
			currentStructures = this.structures

			//let value = readNext()

			let value = read()
			strings = EMPTY_ARRAY
			currentStructures = null
			return value
		} else if (!currentStructures) {
			currentStructures = []
		}
//		setSource(source)
//		return readNext()
		return read()
	}
}
let parseTable = new Array(256)
let currentStructures
exports.Parser = Parser

function read() {
	let token = src[position++]
	if (token < 0xa0) {
		if (token < 0x80) {
			if (token < 0x40)
				return token
			else {
				let structure = currentStructures[token & 0x3f]
				if (structure) {
					if (!structure.read) {
						structure.read = createStructureReader(structure)
					}
					return structure.read()
				} else
					return token
			}
		} else if (token < 0x90) {
			// map
			token -= 0x80
			if (currentConfig.mapsAsObjects) {
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
		if (length < 8)
			return simpleString(length)
		let string = strings[stringPosition++]
		if (string === undefined) {
			strings = readStrings(position - 1, src.length)
			stringPosition = 0
			string = strings[stringPosition++]
		}
		position += token - 0xa0
		return string
	} else {
		let value
		switch (token) {
			case 0xc0: return null
			case 0xc1: return
			case 0xc2: return false
			case 0xc3: return true
			case 0xca:
				value = src.readFloatBE(position)
				position += 4
				return value
			case 0xcb:
				value = src.readDoubleBE(position)
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
				value = currentConfig.useBigInts ? src.readBigUInt64BE(position) : src.readUIntBE(position + 2, 6)
				position += 8
				return value

			// int handlers
			case 0xd0:
				return src.readInt8(position++)
			case 0xd1:
				value = src.readInt16BE(position)
				position += 2
				return value
			case 0xd2:
				value = src.readInt16BE(position)
				position += 4
				return value
			case 0xd3:
				value = currentConfig.useBigInts ? src.readBigInt64BE(position) : src.readIntBE(position + 2, 6)
				position += 8
				return value

			case 0xd9:
			// str 8
				return readString8(src[position++])
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
				return token - 0x100

		}
	}
}

function createStructureReader(structure) {
	return (new Function('r', 'return function(){return {' + structure.map(key => key + ':r()').join(',') + '}}'))(read)
}

const readFixedString = readString(1)
const readString8 = readString(2)
const readString16 = readString(3)
const readString32 = readString(5)
function readString(headerLength) {
	return function readString(length) {
		let string = strings[stringPosition++]
		if (string == null) {
			strings = readStrings(position - headerLength, src.length)
			stringPosition = 0
			string = strings[stringPosition++]
		}
		position += length
		return string
	}
}
function readArray(length) {
	let array = new Array(length)
	for (let i = 0; i < length; i++) {
		array[i] = read()
	}
	return array
}

function readMap(length) {
	if (currentConfig.mapsAsObjects) {
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
function simpleString(length) {
	let start = position
	for (let i = 0; i < length; i++) {
		const byte = src[position++];
		if ((byte & 0x80) > 0) {
			position -= i + 1
    			return
    		}
    	}
    	return asString.slice(start, position)
}/*
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

/*
function simpleString(length) {
  const out = new Array(length);
  for (let i = 0; i < length; i++) {
    const byte = src[position++];
    if ((byte & 0x80) === 0) {
      // 1 byte
      out[i] = byte;
    } else {
    	position -= i + 1
    	return
    }
  }
  return String.fromCharCode.apply(String, out)
}*/