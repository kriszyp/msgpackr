let { setSource, readNext } = require('./build/Release/msgpack.node')
let src
let position = 0
class Parser {
	constructor(options) {
		Object.assign(this, options)
	}
	parse(source) {
		position = 0
		src = source
		if (this.structures) {
			currentStructures = this.structures
			setSource(source)
			let value = readNext()

			//let value = read()
			currentStructures = null
			return value
		} else if (!currentStructures) {
			currentStructures = []
		}
		setSource(source)
		return readNext()
		//return read()
	}
}
let parseTable = new Array(256)
let currentStructures
exports.Parser = Parser

function makeHierarchy(values) {
	let position = values.length - 1
	var size
	do {
		let targetIndex = position - values[position]
		size = values[targetIndex]
		values[targetIndex] = values.slice(position - size, position)
		position -= size + 1
	}while(position > 1)
	return values[0]
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
			let map = new Map()
			for (let i = 0; i < token; i++) {
				map.set(read(), read())
			}
			return map
		} else {
			token -= 0x90
			let array = new Array(token)
			for (let i = 0; i < token; i++) {
				array[i] = read()
			}
			return array
		}
	} else if (token < 0xc4) {
		if (token < 0xc0)
			return src.utf8Slice(position, position += token - 0xa0)
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

parseTable[0xcb] = () => {
	let value = src.readDoubleBE(position)
	position += 8
	return value
}

parseTable[0xcc] = () => {
	return src[position++]
}
parseTable[0xcd] = () => {
	return (src[position++] << 8) + src[position++]
}
parseTable[0xce] = () => {
	return (src[position++] << 24) + (src[position++] << 16) + (src[position++] << 8) + src[position++]
}

parseTable[0xd9] = () => {
	let length = src[position++]
	return src.utf8Slice(position, position += length)
}
parseTable[0xda] = () => {
	let length = (src[position++] << 8) + src[position++]
	return src.utf8Slice(position, position += length)
}
parseTable[0xdc] = () => {
	let length = (src[position++] << 8) + src[position++]
	let array = new Array(length)
	for (let i = 0; i < length; i++) {
		array[i] = read()
	}
	return array
}
