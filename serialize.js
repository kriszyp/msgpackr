let Parser = require('./parse').Parser
class Serializer extends Parser {
	constructor(options) {
		super(options)
		this.target = Buffer.allocUnsafeSlow(8192) // as you might expect, allocUnsafeSlow is the fastest and safest way to allocate memory
		this.offset = 0
	}
	serialize(value) {
		var position = this.offset
		var start = position
		var target = this.target
		var safeEnd = target.length - 10
		var serializer = this
		var sharedStructures = this.structures
		var structures = sharedStructures || []
		serialize(value)
		return target.slice(start, position)
		function serialize(value) {
			if (position > safeEnd) {
				target = serializer.makeRoom(start, position)
				start = 0
			}
			var type = typeof value
			var length
			if (type === 'string') {
				let strLength = value.length
				let headerSize
				if (strLength < 0x20) {
					headerSize = 1
				} else if (strLength < 0x100) {
					headerSize = 2
				} else if (strLength < 0x10000) {
					headerSize = 3
				} else if (strLength < 0x100000000) {
					headerSize = 5
				}
				if (position + strLength * 3 > safeEnd) {
					target = serializer.makeRoom(start, position + strLength * 3)
					start = 0
				}
				length = target.utf8Write(value, position + headerSize, strLength << 2)
				if (length < 0x20) {
					target[position++] = 0xa0 | length
				} else if (length < 0x100) {
					if (headerSize < 2) {
						console.warn('Adjusting string size')
						target.copy(target, position + 2, position + 1, position + 1 + length)
					}
					target[position++] = 0xd9
					target[position++] = length
				} else if (length < 0x10000) {
					if (headerSize < 3) {
						console.warn('Adjusting string size')
						target.copy(target, position + 3, position + 2, position + 2 + length)
					}
					target[position++] = 0xda
					target[position++] = length >> 8
					target[position++] = length & 0xff
				} else {
					NotImplementedYet
				}
				position += length
			} else if (type === 'number') {
				if (value >> 0 == value) {// integer
					if (value >= 0) {
						if (value < 0x40) {
							target[position++] = value
						} else if (value < 0x100) {
							target[position++] = 0xcc
							target[position++] = value
						} else if (value < 0x10000) {
							target[position++] = 0xcd
							target[position++] = value >> 8
							target[position++] = value & 0xff
						} else if (value < 0x100000000) {
							target[position++] = 0xce
							target[position++] = value >> 24
							target[position++] = (value >> 16) & 0xff
							target[position++] = (value >> 8) & 0xff
							target[position++] = value & 0xff
						}
					} else {
						// negative
					}
				} else {
					// very difficult to tell if float is sufficient, just use double for now
					target[position++] = 0xcb
					target.writeDoubleBE(value, position)
					position += 8
				}

			} else if (type === 'object') {
				if (!value)
					target[position++] = 0xc0
				else {
					if (value.constructor === Array) {
						length = value.length
						if (length < 0x10) {
							target[position++] = 0x90 | length
						} else if (length < 0x10000) {
							target[position++] = 0xdc
							target[position++] = length >> 8
							target[position++] = length & 0xff
						} // TODO array 32
						for (let i = 0; i < length; i++) {
							serialize(value[i])
						}
					} else if (value.constructor === Map) {
						length = value.size
						if (length < 0x10) {
							target[position++] = 0x80 | length
						} else if (length < 0x100) {
							target[position++] = 0xde
							target[position++] = length >> 8
							target[position++] = length & 0xff
						}
						for (let [ key, value ] of value) {
							serialize(key)
							serialize(value)
						}

					} else if (value.constructor === Date) {

					} else {	
						let nextTransition, transition = structures.transitions || (structures.transitions = Object.create(null))
						let objectOffset = position++ - start
						for (let key in value) {
							nextTransition = transition[key]
							if (!nextTransition) {
								nextTransition = transition[key] = Object.create(null)
								nextTransition.__keys__ = (transition.__keys__ || []).concat(key)
							}
							transition = nextTransition
							serialize(value[key])
						}
						let id = transition.id
						if (!id) {
							id = transition.id = structures.push(transition.__keys__) + 63
							if (!sharedStructures) {
								// TODO: Write it out here
							}
						}
						target[objectOffset + start] = id
					}
				}
			} else if (type === 'boolean') {
				target[position++] = value ? 0xc3 : 0xc2
			} else if (type === 'undefined') {
				target[position++] = 0xc1
			} else {
				throw new Error('Unknown type')
			}
		}
	}
	makeRoom(start, end) {
		let newSize = ((Math.max((end - start) << 2, this.buffer.length) + 0xff) >> 8) << 8
		let newBuffer = Buffer.allocUnsafeSlow(newSize)
		this.buffer.copy(newBuffer, 0, start, end)
		return this.buffer = newBuffer
	}
	resetMemory() {
		this.offset = 0
	}
}
exports.Serializer = Serializer
