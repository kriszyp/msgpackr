let Parser = require('./parse').Parser
class Serializer extends Parser {
	constructor(options) {
		super(options)
		this.offset = 0
		let target = Buffer.allocUnsafeSlow(8192) // as you might expect, allocUnsafeSlow is the fastest and safest way to allocate memory
		let typeBuffer
		let position = 0
		let start
		let safeEnd
		let sharedStructures
		let hasSharedUpdate
		let structures
		let types
		let lastSharedStructuresLength = 0

		this.serialize = function(value) {
			position = this.offset
			start = position
			safeEnd = target.length - 10
			sharedStructures = this.structures
			if (sharedStructures) {
				if (sharedStructures.length !== lastSharedStructuresLength) {
					for (let i = 0, l = sharedStructures.length; i < l; i++) {
						/*if (sharedStructures[i])
							types.set(sharedStructures[i].join('\x00'), i + 0x40)*/
					}
					lastSharedStructuresLength = sharedStructures.length
				}
			}
			if (hasSharedUpdate)
				hasSharedUpdate = true
			structures = sharedStructures || []
			serialize(value)
			if (hasSharedUpdate && sharedStructures.onUpdate) {
				if (sharedStructures.onUpdate(lastSharedStructuresLength) === false) {
					// try again if the update failed
					return this.serialize(value)
				}
			}
			return target.slice(start, position)
		}
		const serialize = (value) => {
			if (position > safeEnd) {
				target = makeRoom(start, position)
				start = 0
			}
			var type = typeof value
			var length
			if (type === 'string') {
				let strLength = value.length
				let headerSize
				// first we estimate the header size, so we can write to the correct location
				if (strLength < 0x20) {
					headerSize = 1
				} else if (strLength < 0x100) {
					headerSize = 2
				} else if (strLength < 0x10000) {
					headerSize = 3
				} else {
					headerSize = 5
				}
				let maxBytes = strLength * 3
				if (position + maxBytes > safeEnd) {
					target = makeRoom(start, position + maxBytes)
					start = 0
				}
				if (strLength < 0x40) {
					let strPosition = position + headerSize
					// this is all copied from avsc project
						let i, c1, c2;
						for (i = 0; i < strLength; i++) {
							c1 = value.charCodeAt(i);
							if (c1 < 0x80) {
								target[strPosition++] = c1;
							} else if (c1 < 0x800) {
								target[strPosition++] = c1 >> 6 | 0xc0;
								target[strPosition++] = c1 & 0x3f | 0x80;
							} else if (
								(c1 & 0xfc00) === 0xd800 &&
								((c2 = value.charCodeAt(i + 1)) & 0xfc00) === 0xdc00
							) {
								c1 = 0x10000 + ((c1 & 0x03ff) << 10) + (c2 & 0x03ff);
								i++;
								target[strPosition++] = c1 >> 18 | 0xf0;
								target[strPosition++] = c1 >> 12 & 0x3f | 0x80;
								target[strPosition++] = c1 >> 6 & 0x3f | 0x80;
								target[strPosition++] = c1 & 0x3f | 0x80;
							} else {
								target[strPosition++] = c1 >> 12 | 0xe0;
								target[strPosition++] = c1 >> 6 & 0x3f | 0x80;
								target[strPosition++] = c1 & 0x3f | 0x80;
							}
						}
						length = strPosition - position - headerSize
				} else {
					length = target.utf8Write(value, position + headerSize, maxBytes)
				}

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
					if (headerSize < 5) {
						console.warn('Adjusting string size')
						target.copy(target, position + 5, position + 3, position + 3 + length)
					}
					target[position++] = 0xdb
					target[position++] = length >> 24
					target[position++] = (length >> 16) & 0xff
					target[position++] = (length >> 8) & 0xff
					target[position++] = length & 0xff
				}
				position += length
			} else if (type === 'number') {
				if (value >> 0 == value) {// integer, 32-bit or less
					if (value >= 0) {
						// positive uint
						if (value < 0x40) {
							target[position++] = value
						} else if (value < 0x100) {
							target[position++] = 0xcc
							target[position++] = value
						} else if (value < 0x10000) {
							target[position++] = 0xcd
							target[position++] = value >> 8
							target[position++] = value & 0xff
						} else {
							target[position++] = 0xce
							target[position++] = value >> 24
							target[position++] = (value >> 16) & 0xff
							target[position++] = (value >> 8) & 0xff
							target[position++] = value & 0xff
						}
					} else {
						// negative int
						if (value > -0x20) {
							target[position++] = 0x100 + value
						} else if (value > -0x100) {
							target[position++] = 0xd0
							target.writeInt8(value, position++)
						} else if (value > -0x10000) {
							target[position++] = 0xd1
							target.writeInt16BE(value, position)
							position += 2
						} else {
							target[position++] = 0xd2
							target.writeInt32BE(value, position)
							position += 4
						}
					}
				} else {
					// very difficult to tell if float is sufficient, just use double for now
					target[position++] = 0xcb
					target.writeDoubleBE(value, position)
					/*if (!target[position[4] && !target[position[5] && !target[position[6] && !target[position[7] && !(target[0] & 0x78) < ) {
						// something like this can be represented as a float
					}*/
					position += 8
				}
			} else if (type === 'object') {
				if (!value)
					target[position++] = 0xc0
				else {
					if (value.constructor === Object) {
						writeObject(value, true)
					} else if (value.constructor === Array) {
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
						} else if (length < 0x10000) {
							target[position++] = 0xde
							target[position++] = length >> 8
							target[position++] = length & 0xff
						} else {
							target[position++] = 0xdf
							target[position++] = length >> 24
							target[position++] = (length >> 16) & 0xff
							target[position++] = (length >> 8) & 0xff
							target[position++] = length & 0xff
						}
						for (let [ key, entryValue ] of value) {
							serialize(key)
							serialize(entryValue)
						}
					} else if (value.constructor === Date) {
						throw new Error('Date not implemented yet')
					} else {	
						writeObject(value, false)
					}
				}
			} else if (type === 'boolean') {
				target[position++] = value ? 0xc3 : 0xc2
			} else if (type === 'bigint') {
				target[position++] = 0xd3
				if (value < 9223372036854776000 && value > -9223372036854776000)
					target.writeBigInt64BE(value, position)
				else
					target.writeDoubleBE(value, position)
				position += 8
			} else if (type === 'undefined') {
				target[position++] = 0xc1
			} else {
				throw new Error('Unknown type')
			}
		}

		const writeObject = this.objectsAsMaps ? (object, safePrototype) => {
			target[position++] = 0xde // always use map 16, so we can preallocate and set the length afterwards
			let objectOffset = position - start
			position += 2
			let size = 0
			for (let key in object) {
				if (safePrototype || object.hasOwnProperty(key)) {
					serialize(key)
					serialize(object[key])
					size++
				}
			}
			target[objectOffset++ + start] = size >> 8
			target[objectOffset + start] = size & 0xff
		} :
	/*	sharedStructures ? 
		(object, safePrototype) => {
			let nextTransition, transition = structures.transitions || (structures.transitions = Object.create(null))
			let objectOffset = position++ - start
			let wroteKeys
			for (let key in object) {
				if (safePrototype || object.hasOwnProperty(key)) {
					nextTransition = transition[key]
					if (!nextTransition) {
						nextTransition = transition[key] = Object.create(null)
						nextTransition.__keys__ = (transition.__keys__ || []).concat([key])
						/*let keys = Object.keys(object)
						if 
						let size = 0
						let startBranch = transition.__keys__ ? transition.__keys__.length : 0
						for (let i = 0, l = keys.length; i++) {
							let key = keys[i]
							size += key.length << 2
							if (i >= startBranch) {
								nextTransition = nextTransition[key] = Object.create(null)
								nextTransition.__keys__ = keys.slice(0, i + 1)
							}
						}
						makeRoom(start, position + size)
						nextTransition = transition[key]
						target.copy(target, )
						objectOffset
					}
					transition = nextTransition
					serialize(object[key])
				}
			}
			let id = transition.id
			if (!id) {
				id = transition.id = structures.push(transition.__keys__) + 63
				if (sharedStructures.onUpdate)
					sharedStructures.onUpdate(id, transition.__keys__)
			}
			target[objectOffset + start] = id
		}*/
		(object) => {
			let keys = Object.keys(object)
			let nextTransition, transition = structures.transitions || (structures.transitions = Object.create(null))
			for (let i =0, l = keys.length; i < l; i++) {
				let key = keys[i]
				nextTransition = transition[key]
				if (!nextTransition) {
					nextTransition = transition[key] = Object.create(null)
					nextTransition.__keys__ = (transition.__keys__ || []).concat([key])
				}
				transition = nextTransition
			}
			let recordId = transition.id
			if (recordId) {
				target[position++] = recordId
			} else {
				recordId = transition.id = structures.push(transition.__keys__) + 63
				if (sharedStructures) {// TODO: Don't necessarily add it if we are running out of room
					target[position++] = recordId
					hasSharedUpdate = true
				} else {
					target[position++] = 0xd4 // fixext 1
					target[position++] = 0x72 // "r" record defintion extension type
					target[position++] = recordId
					serialize(keys)
				}
			}
			// now write the values
			for (let i =0, l = keys.length; i < l; i++)
				serialize(object[keys[i]])
		}
		const makeRoom = (start, end) => {
			let newSize = ((Math.max((end - start) << 2, target.length) + 0xff) >> 8) << 8
			let newBuffer = Buffer.allocUnsafeSlow(newSize)
			target.copy(newBuffer, 0, start, end)
			start = 0
			return target = newBuffer
		}
	}
	resetMemory() {
		this.offset = 0
	}
}
exports.Serializer = Serializer
