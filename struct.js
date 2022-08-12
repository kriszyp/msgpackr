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

/*

short slot: for small positive ints and booleans
string slot: for strings, references END of string
object slot: for data references, references START of data
number byte slot: float32 or uint32
double byte slot: float64

storage layout:

header - 32 bits or 64 bits
property slots
16-bit addressable strings
32-bit string references
32-bit addressable strings
object data
32-bit object references

string header
00 - standard ref (32K)
10 - reference ref
11 - latin string ref


object reference
0 - standard ref (32K)
1 - reference ref

null (0xff)+ 0xf6
null (0xff)+ 0xf7



*/


import { setWriteStructSlots, RECORD_SYMBOL } from './pack.js'
import { setReadStruct, unpack, mult10 } from './unpack.js';
const hasNonLatin = /[\u0080-\uFFFF]/;

const TYPE = Symbol('type');
const PARENT = Symbol('parent');
setWriteStructSlots(writeStruct);
function writeStruct(object, target, position, structures, makeRoom, pack, packr) {
	let structs = packr.structs || (packr.structs = new Map());
	let transition = structs.transitions;
	let keyCount = 0;
	let start = position;
	position += 4;
	let queuedReferences = [], queuedStringReferences;
	let uint32 = target.uint32 || (target.uint32 = new Uint32Array(target.buffer));
	let targetView = target.dataView;
	let encoded;
	let stringData = '';
	let safeEnd = target.length - 10;
	for (let key in object) {
		let nextTransition = transition[key] = (transition[key] = Object.create(null, {
			key,
			parent: transition,
		}));
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
					if (value < 0xf0) {
						transition = transition.short || createTypeTransition(transition, 'short');
						target[position] = value;
						position++;
						continue;
					} else {
						transition = transition.num32 || createTypeTransition(transition, 'num32');
						targetView.setUint32(position, value);
						position += 4;
					}
					encoded = value;
					break;
				} else if (value < 0x100000000 && value >= -0x80000000) {
					targetView.setFloat32(position, value, true);
					if (float32Headers[target[position + 3] >>> 5]) {
						let xShifted
						// this checks for rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
						if (((xShifted = value * mult10[((target[position + 3] & 0x7f) << 1) | (target[position + 2] >> 7)]) >> 0) === xShifted) {
							transition = transition.num32 || (transition.num32 = Object.create(null));
							position += 4;
							continue;
						}
					}
					transition = transition.float64 || createTypeTransition(transition, 'float64');
					targetView.setFloat64(position, value, true);
					position += 8;
				}
				// fall back to msgpack encoding
				queuedReferences.push(value, position - start);
				position += 4;
				continue;
			case 'string':
				transition = transition.string || createTypeTransition(transition, 'string');
				let header = (stringData.length > 0x3000 || hasNonLatin.test(value)) ? 0 : 0xc000; // the later indicates a latin string in the short string section
				if (value.length > 0x100 || stringData.length > 0x3000 || hasNonLatin.test(value)) {
					queuedReferences.push(value, position - start);
				} else { // latin reference
					stringData += value; // add the string first, so we point to the ending index
					targetView.setUint16(position, stringData.length | header);
				}
				position += 2;
				break;
			case 'object':
				if (value) {
					transition = transition.object || createTypeTransition(transition, 'object');
					queuedReferences.push(value, position - start);
					position += 2;
					continue;
				} else { // null
					transition = anyType(transition, position);
					position = updatedPosition;
					target[position - 1] = 0xf6; // match CBOR with this
				}
				break;
			case 'boolean':
				transition = transition.boolean || || createTypeTransition(transition, 'boolean');
				target[position++] = value ? 0xf5 : 0xf4; // match CBOR with these
				break;
			case 'undefined':
				transition = anyType(transition, position);
				position = updatedPosition;
				target[position - 1] = 0xf7; // match CBOR with this
				break;
		}
		targetView.setUint32(position, encoded, true);
		position += 4;
	}
	let recordId = transition[RECORD_SYMBOL]
	if (recordId == null) {
		let recordId = packr.structs.size;
		packr.saveStructure(recordId, )
	}

	if (!(recordId < 0x10000000)) {
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
	targetView.setUint32(start, recordId);
	targetView.setUint16(start + 2, stringData.length);
	/*if (queuedStringReferences) {
		let stringCount = queuedStringReferences.length;
		let stringStart = position + (stringCount << 2);
		let stringPosition = stringStart;
		for (let i = 0; i < stringCount; i++) {
			let string = queuedStringReferences[i];
			let bytesWritten = target.utf8Write(string, stringPosition, 0xffffffff);
			stringPosition += bytesWritten;
			targetView.setUint32(position, stringPosition - stringStart, true);
		}
	}*/
	let queued32BitReferences;
	for (let i = 0, l = queuedReferences.length; i < l;) {
		let value = queuedReferences[i];
		let slotOffset = queuedReferences[i + 1] + start;
		let offset = position - slotOffset;

		let newPosition = pack(value, position);
		queuedReferences[i] = newPosition;
		i += 2;
		if (typeof newPosition === 'object') {
			// re-allocated
			position = newPosition.position;
			targetView = newPosition.targetView;
			start = 0;
		} else
			position = newPosition;

		targetView.setUint16(slotOffset, offset);
	}
	if (position > 0xc000) {
		// TODO: Repack so we can reference everything properly
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
function anyType(transition, position) {
	let nextTransition;
	if ((nextTransition = transition.short || transition.string || transition.object)) {
		updatedPosition = position + 2;
		return nextTransition;
	}
	if (nextTransition = transition.num32) {
		updatedPosition = position + 4;
		return nextTransition;
	}
	// transition.float64
	if (nextTransition = transition.float64) {
		updatedPosition = position + 8;
		return nextTransition;
	}
	// TODO: can we do an any type where we defer the decision?
	nextTransition = createTypeTransition(transition, 'object');
	updatedPosition = position + 2;
	return nextTransition;
}
function createTypeTransition(transition, type) {
	let newTransition = transition[type] = Object.create(null);
	newTransition[TYPE] = type;
	newTransition[PARENT] = parent;
	return newTransition;
}
var sourceSymbol = Symbol('source')
function readStruct(src, position, srcEnd, structure, unpackr) {
	var stringLength = (src[position++] << 8) | src[position++];
	var construct = structure.construct;
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
		let currentOffset = 0;
		let lastRefProperty;
		for (let i = 0, l = structure.length; i < l; i++) {
			let property = structure[i];
			let key = property.key;
			let type = property.type;
			property.offset = currentOffset;
			let get;
			switch(type) {
				case 'string': case 'object':
					property.previous = lastRefProperty;
					get = function() {
						let source = this[sourceSymbol];
						let src = source.src;
						let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
						let ref = dataView.getUint16(source.position + property.offset);
						let start;
						if (ref >= 0xc000) {
							if (ref >= 0xf000) {
								if (ref && 0xff00 == 0xf600)
									return null;
								if (ref && 0xff00 == 0xf700)
									return undefined;
							} else {
								let previous = property;
								while (previous = property.previous) {
									let prevRef = dataView.getUint16(source.position + previous.offset);
									if (prefRef >= 0xc000 && prevRef < 0xf000) {
										start = prefRef & 0x3fff;
										break;
									}
								}
								if (!source.srcString) {
									// TODO:
									start = source.position + (l << 2);
									source.srcString = src.toString('latin1', start, start + source.stringLength);
								}
								return source.srcString.slice(start, ref & 0x3fff);
							}
						}
						let previous = property;
						while (previous = property.previous) {
							let prevRef = dataView.getUint16(source.position + previous.offset);
							if (prefRef < 0xc000) {
								start = prefRef;
								break;
							}
						}
						if (src[start] < 12) {
							// read the 32-bit reference
							start = dataView.getUint32(ref - 8);
							ref = dataView.getUint32(ref - 4);
						}
						if (type === 'string') {
							return src.toString('utf8', start, ref);
						} else {
							return unpackr.unpack(src.slice(start, ref));
						}
					};
					lastRefProperty = property;
					currentOffset += 2;
					break;
				case 'num32':
					get = function() {
						let source = this[sourceSymbol];
						let src = source.src;
						let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
						let value = dataView.getInt32(source.position + property.offset, true)
						if (value < 0x20000000 && value >= -0x8000000) {
							return value;
						}
						if (value >= -0xa0000000) {
							return (value >> 24) == 0xf6 ? null : undefined;
						}
						let fValue = dataView.getFloat32(source.position + property.offset, true);
						// this does rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
						let multiplier = mult10[((src[position + 3] & 0x7f) << 1) | (src[position + 2] >> 7)]
						return ((multiplier * fValue + (fValue > 0 ? 0.5 : -0.5)) >> 0) / multiplier;
					};
					currentOffset += 4;
					break;
				case 'float64':
					get = function() {
						let source = this[sourceSymbol];
						let src = source.src;
						let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
						let value = dataView.getFloat64(source.position + property.offset, true);
						if (isNaN(value)) {
							switch(src[source.position + property.offset]) {
								case 0xf6: return null;
								case 0xf7: return undefined;
								case 0xf8: return false;
								case 0xf9: return true;
							}
						}
						return value;
					};
					currentOffset += 8;
					break;
			}
			Object.defineProperty(prototype, key, { get, enumerable: true });
		}
	}
	var instance = new construct();
	instance[sourceSymbol] = {
		src,
		uint32: src.uint32,
		position,
		srcString: '',
		srcEnd,
		stringLength
	}
	return instance;
}
setReadStruct(readStruct)
