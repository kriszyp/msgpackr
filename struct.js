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
const float32Headers = [false, true, true, false, false, true, true, false];
let updatedPosition;

const TYPE = Symbol('type');
const PARENT = Symbol('parent');
setWriteStructSlots(writeStruct);
function writeStruct(object, target, position, structures, makeRoom, pack, packr) {
	let structs = packr.structs || (packr.structs = []);
	let transition = structs.transitions || (structs.transitions = Object.create(null));
	let start = position;
	position += 2;
	let queuedReferences = [];
	let targetView = target.dataView;
	let stringData = '';
	let safeEnd = target.length - 10;
	for (let key in object) {
		let nextTransition = transition[key] || (transition[key] = Object.create(null, {
			key: {value: key},
			parent: {value: transition},
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
				if (value >> 0 === value && value < 0x20000000 && value > -0x1f000000) {
					if (value < 0xf6 && value >= 0 && (transition.num8 || value < 0x20 && !transition.num32)) {
						transition = transition.num8 || createTypeTransition(transition, 'num8');
						target[position++] = value;
					} else {
						transition = transition.num32 || createTypeTransition(transition, 'num32');
						targetView.setUint32(position, value, true);
						position += 4;
					}
					break;
				} else if (value < 0x100000000 && value >= -0x80000000) {
					targetView.setFloat32(position, value, true);
					if (float32Headers[target[position + 3] >>> 5]) {
						let xShifted
						// this checks for rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
						if (((xShifted = value * mult10[((target[position + 3] & 0x7f) << 1) | (target[position + 2] >> 7)]) >> 0) === xShifted) {
							transition = transition.num32 || createTypeTransition(transition, 'num32');
							position += 4;
							break;
						}
					}
				}
				transition = transition.float64 || createTypeTransition(transition, 'float64');
				targetView.setFloat64(position, value, true);
				position += 8;
				break;
			case 'string':
				if (value.length > ((0xff - stringData.length) >> 2) || hasNonLatin.test(value)) {
					transition = transition.string16 || createTypeTransition(transition, 'string16');
					queuedReferences.push(value, position - start);
					position += 2;
				} else { // latin reference
					// TODO: if stringData.length == 0, use latin0
					// TODO: if stringData.length == 0, use latin0
					transition = transition.latin8 || createTypeTransition(transition, 'latin8');
					target[position++] = stringData.length;
					stringData += value;
				}
				break;
			case 'object':
				if (value) {
					transition = transition.object16 || createTypeTransition(transition, 'object16');
					queuedReferences.push(value, position - start);
					position += 2;
					continue;
				} else { // null
					transition = anyType(transition, position, targetView, -10); // match CBOR with this
					position = updatedPosition;
				}
				break;
			case 'boolean':
				transition = transition.num8 || transition.latin8 || createTypeTransition(transition, 'num8');
				target[position++] = value ? 0xf9 : 0xf8; // match CBOR with these
				break;
			case 'undefined':
				transition = anyType(transition, position, targetView, -9); // match CBOR with this
				position = updatedPosition;
				break;
		}
	}
	let recordId = transition[RECORD_SYMBOL];
	if (recordId == null) {
		while(true) {
			recordId = packr.structs.length;
			let structure = [];
			let nextTransition = transition;
			let key, type;
			while((type = nextTransition[TYPE])) {
				nextTransition = nextTransition[PARENT];
				key = nextTransition.key;
				structure.push([ key, type ]);
				nextTransition = nextTransition.parent;
			}
			structure.reverse();
			packr.structs[recordId] = structure;
			transition[RECORD_SYMBOL] = recordId;
			if (packr.saveStructure(recordId, structure) === false) {
				while(packr.getStructure(++recordId)) {
				}
			}
			else break;
		}
	}

	if (!(recordId < 0x10000000)) {
		// for now just punt and go back to writeObject
		return 0;
		// newRecord(transition, transition.__keys__ || Object.keys(object), newTransitions, true)
	}
	let dataStart = position;
	let stringLength = stringData.length;
	if (stringData) {
		if (position + stringLength > safeEnd) {
			target = makeRoom(position + stringLength);
			position -= start;
			targetView = target.dataView;
			start = 0;
			dataStart = position;
		}
		position += target.latin1Write(stringData, position, 0xffffffff);
	}
	target[start] = 0x38; // indicator for one-byte record id
	target[start + 1] = recordId;
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
		let offset = position - dataStart;
		let newPosition;
		if (typeof value === 'string') {
			if (position + value.length * 3 > safeEnd) {
				target = makeRoom(position + value.length * 3);
				position -= start;
				targetView = target.dataView;
				start = 0;
			}
			newPosition = position + target.utf8Write(value, position, 0xffffffff);
		} else {
			newPosition = pack(value, position);
		}
		queuedReferences[i++] = offset;
		if (typeof newPosition === 'object') {
			// re-allocated
			position = newPosition.position;
			targetView = newPosition.targetView;
			start = 0;
		} else
			position = newPosition;
		let slotOffset = queuedReferences[i++] + start;
		targetView.setUint16(slotOffset, offset, true);
	}
	/*
	if (position > 0xc000) {
		// TODO: Repack so we can reference everything properly
		// TODO: makeRoom
		for (let i = 0, l = queued32BitReferences.length; i < l; i++) {
			let ref = queued32BitReferences[i];
			targetView.setUint32(ref.slotOffset, 0xa0000000 - ((l - i) << 2), true);
			targetView.setUint32(position, ref.offset, true);
			position += 4;
		}
	}*/

	return position;
}
function anyType(transition, position, targetView, value) {
	let nextTransition;
	if ((nextTransition = transition.latin8 || transition.num8)) {
		targetView.setInt8(position++, value, true);
		return nextTransition;
	}
	if ((nextTransition = transition.string16 || transition.object16)) {
		targetView.setInt16(position, value, true);
		updatedPosition = position + 2;
		return nextTransition;
	}
	if (nextTransition = transition.num32) {
		targetView.setUint32(position, 0xe0000100 + value, true);
		updatedPosition = position + 4;
		return nextTransition;
	}
	// transition.float64
	if (nextTransition = transition.float64) {
		targetView.setFloat64(position, NaN, true);
		targetView.setInt8(position, value);
		updatedPosition = position + 8;
		return nextTransition;
	}
	// TODO: can we do an any type where we defer the decision?
	nextTransition = createTypeTransition(transition, 'object16');
	targetView.setInt16(position, value, true);
	updatedPosition = position + 2;
	return nextTransition;
}
function createTypeTransition(transition, type) {
	let newTransition = transition[type] = Object.create(null);
	newTransition[TYPE] = type;
	newTransition[PARENT] = transition;
	return newTransition;
}
function loadStruct(id, structure, transition) {
	for (let [ key, type ] of structure) {
		transition = transition[key] || (transition[key] = Object.create(null, {
			key: {value: key},
			parent: {value: transition},
		}));
		transition = transition[type] || createTypeTransition(transition, type);
	}
	transition[RECORD_SYMBOL] = id;
}
var sourceSymbol = Symbol('source')
function readStruct(src, position, srcEnd, unpackr) {
//	var stringLength = (src[position++] << 8) | src[position++];
	position++;
	let recordId = src[position++];
	let structure = unpackr.structs[recordId];
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
		let lastRefProperty, lastLatinProperty, firstRefProperty;
		for (let i = 0, l = structure.length; i < l; i++) {
			let property = structure[i];
			let [ key, type ] = property;
			property.offset = currentOffset;
			let get;
			switch(type) {
				case 'latin8':
					property.multiGetCount = 0;
					if (lastLatinProperty)
						lastLatinProperty.next = property;
					lastLatinProperty = property;
					get = function() {
						let source = this[sourceSymbol];
						let src = source.src;
						let refStart = currentOffset + source.position;
						let ref = src[source.position + property.offset];
						if (ref >= 0xf6) return toConstant(ref);
						let end, next = property;
						while ((next = next.next)) {
							end = src[source.position + next.offset];
							if (end < 0xf6)
								break;
							else
								end = null;
						}
						if (end == null) {
							next = firstRefProperty;
							let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
							do {
								end = dataView.getUint16(source.position + next.offset, true);
								if (end < 0xff00)
									break;
								else
									end = null;
							} while((next = next.next));
						}
						if (end == null)
							end = srcEnd - refStart;
						if (source.srcString) {
							return source.srcString.slice(ref, end);
						}
						if (property.multiGetCount > 0) {
							let latinEnd;
							next = firstRefProperty;
							let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
							do {
								latinEnd = dataView.getUint16(source.position + next.offset, true);
								if (latinEnd < 0xff00)
									break;
								else
									latinEnd = null;
							} while((next = next.next));
							if (latinEnd == null)
								latinEnd = srcEnd - refStart
							source.srcString = src.toString('latin1', refStart, refStart + latinEnd);
							return source.srcString.slice(ref, end);
						}
						if (source.prevStringGet) {
							source.prevStringGet.multiGetCount += 2;
						} else {
							source.prevStringGet = property;
							property.multiGetCount--;
						}
						return src.toString('latin1', ref + refStart, end + refStart);
					};
					currentOffset++;
					break;
				case 'string16': case 'object16':
					if (lastRefProperty)
						lastRefProperty.next = property;
					lastRefProperty = property;
					if (!firstRefProperty)
						firstRefProperty = property;
					get = function() {
						let source = this[sourceSymbol];
						let src = source.src;
						let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
						let ref = dataView.getUint16(source.position + property.offset, true);
						let refStart = currentOffset + source.position;
						if (ref >= 0xff00) return toConstant(ref & 0xff);
						ref += refStart; // adjust to after the fixed slots
						let end;

						if (src[ref] < 12) {
							// read the 32-bit reference
							ref = dataView.getUint32(ref) + refStart;
							end = dataView.getUint32(ref + 4) + refStart;
						} else {
							// if we have a recursive fixed structure, we also don't need to proactively
							// get the end, but would need to
							let next = property;
							while ((next = next.next)) {
								let nextRef = dataView.getUint16(source.position + next.offset, true);
								if (nextRef < 0xff00) {
									end = nextRef + refStart;
									break;
								}
							}
							if (!end) end = source.srcEnd;
						}
						if (type === 'string16') {
							return src.toString('utf8', ref, end);
						} else {
							return unpackr.unpack(src.slice(ref, end));
						}
					};
					currentOffset += 2;
					break;
				case 'num32':
					get = function() {
						let source = this[sourceSymbol];
						let src = source.src;
						let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
						let position = source.position + property.offset;
						let value = dataView.getInt32(position, true)
						if (value < 0x20000000) {
							if (value > -0x1f000000)
								return value;
							if (value > -0x20000000)
								return toConstant(value & 0xff);
						}
						let fValue = dataView.getFloat32(position, true);
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
						if (isNaN(value) ) {
							let byte = src[source.position + property.offset];
							if (byte >= 0xf6)
								return toConstant(byte);
						}
						return value;
					};
					currentOffset += 8;
					break;
				case 'num8':
					get = function() {
						let source = this[sourceSymbol];
						let src = source.src;
						let value = src[source.position + property.offset];
						return value < 0xf6 ? value : toConstant(value);
					};
					currentOffset += 1;
					break;
			}
			Object.defineProperty(prototype, key, { get, enumerable: true });
		}
	}
	var instance = new construct();
	instance[sourceSymbol] = {
		src,
		position,
		srcString: '',
		srcEnd
	}
	return instance;
}
function toConstant(code) {
	switch(code) {
		case 0xf6: return null;
		case 0xf7: return undefined;
		case 0xf8: return false;
		case 0xf9: return true;
	}
	throw new Error('Unknown constant');
}
setReadStruct(readStruct)
