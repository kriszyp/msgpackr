// first four bits
// 0000 - unsigned int
// 0010 - float32
// 0011 - float32
// 0100 - float32
// 0101 - float32
// 0110 - plain reference
// 0111 - latin string reference
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

import { setWriteSlots, RECORD_SYMBOL } from './pack.js'
import { setReadStruct, unpack, mult10 } from './unpack.js';
const hasNonLatin = /[\u0080-\uFFFF]/;
const float32Headers = [false, true, true, false, false, true, true, false]
setWriteSlots(writeSlots);
function writeSlots(object, target, position, structures, makeRoom) {
	let transition = structures.transitions || false
	let newTransitions = 0
	let keyCount = 0;
	let start = position;
	position = (position >> 2) + 1;
	let queuedReferences = [];
	let uint32 = target.uint32 || (target.uint32 = new Uint32Array(target.buffer));
	let encoded;
	let stringData = '';
	let safeEnd = (target.length - 10) >> 2;
	for (let key in object) {
		let nextTransition = transition[key]
		if (!nextTransition) {
			return; // bail
			//nextTransition = transition[key] = Object.create(null)
			//newTransitions++
		}
		if (position > safeEnd) {
			target = makeRoom(position << 2)
			position -= start
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
					if (float32Headers[uint32[position] >>> 29]) {
						let xShifted
						// this checks for rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
						if (((xShifted = value * mult10[((target[position] & 0x7f) << 1) | (target[position + 1] >> 7)]) >> 0) === xShifted) {
							break;
						}
					}
				}
				// fall back to msgpack encoding
				queuedReferences.push(value, position++);
				continue;
			case 'string':
				if (hasNonLatin.test(value)) {
					queuedReferences.push(value, position++);
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
					queuedReferences.push(value, position++);
					continue;
				}
				break;
			case 'object':
				if (value) {
					queuedReferences.push(value, position++);
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
		uint32[position++] = encoded;
	}
	let recordId = transition[RECORD_SYMBOL]
	if (!(recordId < 256)) {
		// for now just punt and go back to writeObject
		return;
		// newRecord(transition, transition.__keys__ || Object.keys(object), newTransitions, true)
	}
	position = position << 2;
	safeEnd = safeEnd << 2;
	let stringLength = stringData.length;
	if (stringData) {
		if (position + stringLength > safeEnd) {
			target = makeRoom(position + stringLength);
		}	
		position += target.latin1Write(stringData, position, 0xffffffff);
	}
	target[start++] = 0xc1;
	target[start++] = recordId;
	target[start++] = stringLength >> 8;
	target[start++] = stringLength & 0xff;
	queuedReferences.position = position;
	return queuedReferences;
}
var sourceSymbol = Symbol('source')
function readStruct(src, position, srcEnd, structure) {
	var stringLength = (src[position++] << 8) | src[position++];
	var construct = structure.construct;
	var srcString;
	if (!construct) {
		construct = structure.construct = function() {
		}
		var prototype = construct.prototype;
		for (let i = 0, l = structure.length; i < l; i++) {
			let key = structure[i];
			Object.defineProperty(prototype, key, {
				get() {
					let source = this[sourceSymbol];
					let src = source.src;
					let uint32 = src.uint32 || (src.uint32 = new Uint32Array(src.buffer, src.byteOffset, src.byteLength));
					let value = uint32[source.position + i];
					let start;
					switch (value >>> 29) {
						case 0:
							return value;
						case 1: case 2: case 5: case 6:
							// TODO: Use decimal rounding
							return float32[source.position + i];
						case 3:
							if (!srcString) {
								start = (source.position + l) << 2;
								srcString = src.toString('utf-8', start, start + stringLength);
							}
							start = value & 0xffff;
							return srcString.slice(start, start + ((value >> 16) & 0x7ff));
						case 4:
								start = 0x1fffffff & value;
								let end = srcEnd;
								for (let next = i + 1; next < l; next++) {
									let nextValue = uint32[source.position + next];
									if ((nextValue & 0xf0000000) == 0x30000000) {
										end = 0x1fffffff & nextValue;
									}
								}
								return unpack(src.slice(start, end));
						case 7:
							switch((value >> 24) & 0xf) {
								case 0: return null;
								case 1: return undefined;
								case 2: return false;
								case 3: return true;
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
		position: position >> 2,
	}
	return instance;
}
setReadStruct(readStruct)