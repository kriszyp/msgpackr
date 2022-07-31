// first four bits
// 0000 - unsigned int
// 0010 - float32
// 0011 - float32
// 0100 - float32
// 0101 - float32
// 0110 - latin string reference
// 0111 - plain reference
// 1000 - structure reference
// 1001 - random access structure reference
// 1010 - float32
// 1011 - float32
// 1100 - float32
// 1101 - float32
// 1110 - constants and 3-byte strings
// 1111 - negative int

// first three bits
// 000 - unsigned int
// 001 - float32
// 010 - float32
// 011 - latin string reference
// 100 - reference
// 101 - float32
// 110 - float32
// 111 - constants and 3-byte strings

import { setWriteStructSlots, RECORD_SYMBOL } from './pack.js'
import { setReadStruct, unpack, mult10 } from './unpack.js';
const hasNonLatin = /[\u0080-\uFFFF]/;
const float32Headers = [false, true, true, false, false, true, true, false]
setWriteStructSlots(writeStruct);
function writeStruct(object, target, position, structures, makeRoom, pack) {
	let transition = structures.transitions || false
	let newTransitions = 0
	let keyCount = 0;
	let start = position;
	position += 4;
	let queuedReferences = [];
	let uint32 = target.uint32 || (target.uint32 = new Uint32Array(target.buffer));
	let targetView = target.dataView;
	let encoded;
	let stringData = '';
	let safeEnd = target.length - 10;
	for (let key in object) {
		let nextTransition = transition[key]
		if (!nextTransition) {
			return 0; // bail
			//nextTransition = transition[key] = Object.create(null)
			//newTransitions++
		}
		if (position > safeEnd) {
			let newPosition = position - start;
			target = makeRoom(position)
			position = newPosition;
			start = 0
			safeEnd = target.length - 10
		}
		transition = nextTransition
		let value = object[key];
		switch (typeof value) {
			case 'number':
				if (value >>> 0 === value && value < 0x20000000) {
					encoded = value;
					break;
				} else if (value < 0x100000000 && value >= -0x80000000) {
					targetView.setFloat32(position, value, true)
					if (float32Headers[target[position + 3] >>> 5]) {
						let xShifted
						// this checks for rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
						if (((xShifted = value * mult10[((target[position + 3] & 0x7f) << 1) | (target[position + 2] >> 7)]) >> 0) === xShifted) {
							position += 4;
							continue;
						}
					}
				}
				// fall back to msgpack encoding
				queuedReferences.push(value, position - start);
				position += 4;
				continue;
			case 'string':
				if (hasNonLatin.test(value)) {
					queuedReferences.push(value, position - start);
					position += 4;
					continue;
				}
				if (value.length < 4) { // we can inline really small strings
					encoded = 0xf8000000 + (value.length << 24) + (value.charCodeAt(0) << 16) + (value.charCodeAt(1) << 8) + (value.charCodeAt(2) || 0)
					// TODO: determining remaining and make max value be a ratio of that (probably 1/256th)
				} else if (value.length < 256 && stringData.length < 61440) {
					// bundle these strings
					encoded = 0x60000000 | (value.length << 16) | stringData.length;
					stringData += value;
				} else { // else queue it
					queuedReferences.push(value, position - start);
					position += 4;
					continue;
				}
				break;
			case 'object':
				if (value) {
					queuedReferences.push(value, position - start);
					position += 4;
					continue;
				} else { // null
					encoded = 0xe0000000;
				}
				break;
			case 'boolean':
				encoded = value ? 0xe3000000 : 0xe2000000;
				break;
			case 'undefined':
				encoded = 0xe1000000;
				break;
		}
		targetView.setUint32(position, encoded, true);
		position += 4;
	}
	let recordId = transition[RECORD_SYMBOL]
	if (!(recordId < 1024)) {
		// for now just punt and go back to writeObject
		return 0;
		// newRecord(transition, transition.__keys__ || Object.keys(object), newTransitions, true)
	}
	let stringLength = stringData.length;
	if (stringData) {
		if (position + stringLength > safeEnd) {
			target = makeRoom(position + stringLength);
		}
		position += target.latin1Write(stringData, position, 0xffffffff);
	}
	target[start] = recordId >> 8;
	target[start + 1] = recordId & 0xff;
	target[start + 2] = stringLength >> 8;
	target[start + 3] = stringLength & 0xff;
	let queued32BitReferences;
	for (let i = 0, l = queuedReferences.length; i < l;) {
		let value = queuedReferences[i++];
		let slotOffset = queuedReferences[i++] + start;
		let offset = position - slotOffset;
		if (offset < 0x1f000000) {
			targetView.setUint32(slotOffset, 0x80000000 | (offset), true);
		} else {
			if (!queued32BitReferences)
				queued32BitReferences = [];
			queued32BitReferences.push({slotOffset, offset: position - start});
		}
		let newPosition = pack(value, position);
		if (typeof newPosition === 'object') {
			// re-allocated
			position = newPosition.position;
			targetView = newPosition.targetView;
			start = 0;
		} else
			position = newPosition;
	}
	if (queued32BitReferences) {
		// TODO: makeRoom
		for (let i = 0, l = queued32BitReferences.length; i < l; i++) {
			let ref = queued32BitReferences[i];
			targetView.setUint32(ref.slotOffset, 0xa0000000 - ((l - i) << 2), true);
			targetView.setUint32(position, ref.offset, true);
			position += 4;
		}
	}

	return position;
}
var sourceSymbol = Symbol('source')
function readStruct(src, position, srcEnd, structure, unpackr) {
	var stringLength = (src[position++] << 8) | src[position++];
	var construct = structure.construct;
	var srcString;
	if (!construct) {
		construct = structure.construct = function() {
		}
		var prototype = construct.prototype;
		Object.defineProperty(prototype, 'toJSON', {
			get() {
				// return an enumerable object with own properties to JSON stringify
				let resolved = {};
				for (let i = 0, l = structure.length; i < l; i++) {
					let key = structure[i];
					resolved[key] = this[key];
				}
				return resolved;
			},
			// not enumerable or anything 
		});
		for (let i = 0, l = structure.length; i < l; i++) {
			let key = structure[i];
			Object.defineProperty(prototype, key, {
				get() {
					let source = this[sourceSymbol];
					let src = source.src;
					//let uint32 = src.uint32 || (src.uint32 = new Uint32Array(src.buffer, src.byteOffset, src.byteLength));
					let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
					let position = source.position + (i << 2);
					let value = dataView.getUint32(position, true);
					let start;
					switch (value >>> 29) {
						case 0:
							return value;
						case 3:
							if (value & 0x10000000) {
								start = (value & 0xffff) + position;
								return src.toString('utf8', start, start + ((value >> 16) & 0x7ff));
							} else {
								if (!srcString) {
									start = source.position + (l << 2);
									srcString = src.toString('latin1', start, start + stringLength);
								}
								start = value & 0xffff;
								return srcString.slice(start, start + ((value >> 16) & 0x7ff));
							}
						case 4:
							start = (0x1fffffff & value) + position;
							let end = srcEnd;
							for (let next = i + 1; next < l; next++) {
								position = source.position + (next << 2);
								let nextValue = dataView.getUint32(position, true);;
								if ((nextValue & 0xe0000000) == -0x80000000) {
									end = (0x1fffffff & nextValue) + position;
									break;
								}
							}
							return unpackr.unpack(src.slice(start, end));
						case 1: case 2: case 5: case 6:
							let fValue = dataView.getFloat32(position, true);
							// this does rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
							let multiplier = mult10[((src[position + 3] & 0x7f) << 1) | (src[position + 2] >> 7)]
							return ((multiplier * fValue + (fValue > 0 ? 0.5 : -0.5)) >> 0) / multiplier;
						case 7:
							switch((value >> 24) & 0x1f) {
								case 0: return null;
								case 1: return undefined;
								case 2: return false;
								case 3: return true;
								case 8: return dataView.getFloat64(position + (value & 0x3ffffff), true);
								case 0x18: return '';
								case 0x19: return String.fromCharCode((value >> 16) & 0xff);
								case 0x20: return String.fromCharCode((value >> 16) & 0xff, (value >> 8) & 0xff);
								case 0x21: return String.fromCharCode((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
								default: throw new Error('Unknown constant');
							}
					}
				},
				enumerable: true,
			});
		}
	}
	var instance = new construct();
	instance[sourceSymbol] = {
		src,
		uint32: src.uint32,
		position,
	}
	return instance;
}
setReadStruct(readStruct)
