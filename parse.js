let { setSource, readStrings } = require('./build/Release/msgpack.node')
let src
let position = 0
let alreadySet
const EMPTY_ARRAY = []
let strings = EMPTY_ARRAY
let stringPosition = 0
let currentConfig = {}
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
	} else if (token < 0xc4) {
		if (token < 0xc0) {
			let string = strings[stringPosition++]
			if (string === undefined) {
				strings = readStrings(position - 1, src.length)
				stringPosition = 0
				string = strings[stringPosition++]
			}
			position += token - 0xa0
			return string
		}
		else if (token < 0xc2)
			return token === 0xc0 ? null : undefined
		else
			return token === 0xc3 // boolean
	} else if (token > 0) {
		if (!parseTable[token])
			return 'error token ' + token
		return parseTable[token](token)
	} else
		throw new Error('Unexpected end of MessagePack')
}

function createStructureReader(structure) {
	return (new Function('r', 'return function(){return {' + structure.map(key => key + ':r()').join(',') + '}}'))(read)
}

for (let i = 0; i < 0x20; i++) {
	parseTable[i + 0xe0] = () => -i
}

parseTable[0xca] = () => {
	let value = src.readFloatBE(position)
	position += 4
	return value
}

parseTable[0xcb] = () => {
	let value = src.readDoubleBE(position)
	position += 8
	return value
}

// uint handlers
parseTable[0xcc] = () => {
	return src[position++]
}
parseTable[0xcd] = () => {
	return (src[position++] << 8) + src[position++]
}
parseTable[0xce] = () => {
	return (src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++]
}
parseTable[0xcf] = () => {
	let value = currentConfig.useBigInts ? src.readBigUInt64BE(position) : src.readUIntBE(position + 2, 6)
	position += 8
	return value
}

// int handlers
parseTable[0xd0] = () => {
	return src.readInt8(position++)
}
parseTable[0xd1] = () => {
	let value = src.readInt16BE(position)
	position += 2
	return value
}
parseTable[0xd2] = () => {
	let value = src.readInt16BE(position)
	position += 4
	return value
}
parseTable[0xd3] = () => {
	let value = currentConfig.useBigInts ? src.readBigInt64BE(position) : src.readIntBE(position + 2, 6)
	position += 8
	return value
}

// str 8
const readString8 = readString(2)
parseTable[0xd9] = () => {
	return readString8(src[position++])
}
// str 16
const readString16 = readString(3)
parseTable[0xda] = () => {
	return readString16((src[position++] << 8) + src[position++])
}
// str 32
const readString32 = readString(5)
parseTable[0xdb] = () => {
	readString32((src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++])
}
for (let i = -1; i >= -0x20; i--) {
	parseTable[0x100 + i] = () => i
}
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

// array 16
parseTable[0xdc] = () => {
	return readArray((src[position++] << 8) + src[position++])
}
// array 32
parseTable[0xdd] = () => {
	return readArray((src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++])
}
function readArray(length) {
	let array = new Array(length)
	for (let i = 0; i < length; i++) {
		array[i] = read()
	}
	return array
}

// map 16
parseTable[0xde] = () => {
	return readMap((src[position++] << 8) + src[position++])
}
// map 32
parseTable[0xdf] = () => {
	return readMap((src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++])
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
