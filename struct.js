
/*

For "any-data":
32-55 - record with record ids (-32)
56 - 8-bit record ids
57 - 16-bit record ids
58 - 24-bit record ids
59 - 32-bit record ids
250-255 - followed by typed fixed width values
64-250 msgpackr/cbor/paired data
arrays and strings within arrays are handled by paired encoding

Structure encoding:
(type - string (using paired encoding))+

Type encoding
encoding byte - fixed width byte - next reference+

Encoding byte:
first bit:
	0 - inline
	1 - reference
second bit:
	0 - data or number
	1 - string

remaining bits:
	character encoding - ISO-8859-x


null (0xff)+ 0xf6
null (0xff)+ 0xf7

*/


import { setWriteStructSlots, RECORD_SYMBOL } from './pack.js'
import {setReadStruct, unpack, mult10, loadStructures} from './unpack.js';
const ASCII = 3; // the MIBenum from https://www.iana.org/assignments/character-sets/character-sets.xhtml (and other character encodings could be referenced by MIBenum)
const NUMBER = 0;
const UTF8 = 2;
const OBJECT_DATA = 1;
const TYPE_NAMES = ['num', 'object', 'string', 'ascii'];
const float32Headers = [false, true, true, false, false, true, true, false];
let updatedPosition;
const hasNodeBuffer = typeof Buffer !== 'undefined'
let textEncoder
try {
	textEncoder = new TextEncoder()
} catch (error) {}
const encodeUtf8 = hasNodeBuffer ? function(target, string, position) {
	return target.utf8Write(string, position, 0xffffffff)
} : (textEncoder && textEncoder.encodeInto) ?
	function(target, string, position) {
		return textEncoder.encodeInto(string, target.subarray(position)).written
	} : false

const TYPE = Symbol('type');
const PARENT = Symbol('parent');
setWriteStructSlots(writeStruct);
function writeStruct(object, target, position, structures, makeRoom, pack, packr) {
	let typedStructs = packr.typedStructs;
	if (!typedStructs) {
		typedStructs = packr.typedStructs = [];
	}
	let targetView = target.dataView;
	let refsStartPosition = (typedStructs.lastStringStart || 100) + position;
	let safeEnd = target.length - 10;
	let start = position;
	if (position > safeEnd) {
		let lastStart = start;
		target = makeRoom(position);
		targetView = target.dataView;
		position -= lastStart;
		refsStartPosition -= lastStart;
		start = 0;
		safeEnd = target.length - 10
	}

	let refOffset, refPosition = refsStartPosition;

	let transition = typedStructs.transitions || (typedStructs.transitions = Object.create(null));
	let nextId = typedStructs.nextId || typedStructs.length;
	let headerSize =
		nextId < 0xf ? 1 :
			nextId < 0xf0 ? 2 :
				nextId < 0xf000 ? 3 :
					nextId < 0xf00000 ? 4 : 0;
	if (headerSize === 0)
		return 0;
	position += headerSize;
	let queuedReferences = [];
	let usedLatin0;
	let keyIndex = 0;
	for (let key in object) {
		let value = object[key];
		let nextTransition = transition[key];
		if (!nextTransition){
			transition[key] = nextTransition = {
				key,
				parent: transition,
				enumerationOffset: 0,
				ascii0: null,
				ascii8: null,
				num8: null,
				string16: null,
				object16: null,
				num32: null,
				float64: null
			};
		}
		if (position > safeEnd) {
			let lastStart = start;
			target = makeRoom(position);
			targetView = target.dataView;
			position -= lastStart;
			refsStartPosition -= lastStart;
			refPosition -= lastStart;
			start = 0;
			safeEnd = target.length - 10
		}
		switch (typeof value) {
			case 'number':
				let number = value;
				if (number >> 0 === number && number < 0x20000000 && number > -0x1f000000) {
					if (number < 0xf6 && number >= 0 && (nextTransition.num8 || number < 0x20 && !nextTransition.num32)) {
						transition = nextTransition.num8 || createTypeTransition(nextTransition, NUMBER, 1);
						target[position++] = number;
					} else {
						transition = nextTransition.num32 || createTypeTransition(nextTransition, NUMBER, 4);
						targetView.setUint32(position, number, true);
						position += 4;
					}
					break;
				} else if (number < 0x100000000 && number >= -0x80000000) {
					targetView.setFloat32(position, number, true);
					if (float32Headers[target[position + 3] >>> 5]) {
						let xShifted
						// this checks for rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
						if (((xShifted = number * mult10[((target[position + 3] & 0x7f) << 1) | (target[position + 2] >> 7)]) >> 0) === xShifted) {
							transition = nextTransition.num32 || createTypeTransition(nextTransition, NUMBER, 4);
							position += 4;
							break;
						}
					}
				}
				transition = nextTransition.num64 || createTypeTransition(nextTransition, NUMBER, 8);
				targetView.setFloat64(position, number, true);
				position += 8;
				break;
			case 'string':
				let strLength = value.length;
				refOffset = refPosition - refsStartPosition;
				if ((strLength << 2) + position > safeEnd) {
					let lastStart = start;
					target = makeRoom(position);
					targetView = target.dataView;
					position -= lastStart;
					refsStartPosition -= lastStart;
					refPosition -= lastStart;
					start = 0;
					safeEnd = target.length - 10

				}
				if (strLength > ((0xff00 + refOffset) >> 2)) {
					queuedReferences.push(key, value, position - start);
					break;
				}
				let isNotAscii
				let strStart = refPosition;
				if (strLength < 0x40) {
					let i, c1, c2;
					for (i = 0; i < strLength; i++) {
						c1 = value.charCodeAt(i)
						if (c1 < 0x80) {
							target[refPosition++] = c1
						} else if (c1 < 0x800) {
							isNotAscii = true;
							target[refPosition++] = c1 >> 6 | 0xc0
							target[refPosition++] = c1 & 0x3f | 0x80
						} else if (
							(c1 & 0xfc00) === 0xd800 &&
							((c2 = value.charCodeAt(i + 1)) & 0xfc00) === 0xdc00
						) {
							isNotAscii = true;
							c1 = 0x10000 + ((c1 & 0x03ff) << 10) + (c2 & 0x03ff)
							i++
							target[refPosition++] = c1 >> 18 | 0xf0
							target[refPosition++] = c1 >> 12 & 0x3f | 0x80
							target[refPosition++] = c1 >> 6 & 0x3f | 0x80
							target[refPosition++] = c1 & 0x3f | 0x80
						} else {
							isNotAscii = true;
							target[refPosition++] = c1 >> 12 | 0xe0
							target[refPosition++] = c1 >> 6 & 0x3f | 0x80
							target[refPosition++] = c1 & 0x3f | 0x80
						}
					}
				} else {
					refPosition += encodeUtf8(target, value, refPosition);
					isNotAscii = refPosition - strStart > strLength;
				}
				if (refOffset < 0x100) {
					if (isNotAscii)
						transition = nextTransition.string8 || createTypeTransition(nextTransition, UTF8, 1);
					else
						transition = nextTransition.ascii8 || createTypeTransition(nextTransition, ASCII, 1);
					target[position++] = refOffset;
				} else {
					if (isNotAscii)
						transition = nextTransition.string16 || createTypeTransition(nextTransition, UTF8, 2);
					else
						transition = nextTransition.ascii16 || createTypeTransition(nextTransition, ASCII, 2);
					targetView.setUint16(position, refOffset, true);
					position += 2;
				}
				break;
			case 'object':
				if (value) {
					//transition = nextTransition.object16 || createTypeTransition(nextTransition, OBJECT_DATA, 2);
					queuedReferences.push(key, value, keyIndex);
					break;
				} else { // null
					nextTransition = anyType(nextTransition, position, targetView, -10); // match CBOR with this
					if (nextTransition) {
						transition = nextTransition;
						position = updatedPosition;
					} else queuedReferences.push(key, value, keyIndex);
				}
				break;
			case 'boolean':
				transition = nextTransition.num8 || nextTransition.ascii8 || createTypeTransition(nextTransition, NUMBER, 1);
				target[position++] = value ? 0xf9 : 0xf8; // match CBOR with these
				break;
			case 'undefined':
				nextTransition = anyType(nextTransition, position, targetView, -9); // match CBOR with this
				if (nextTransition) {
					transition = nextTransition;
					position = updatedPosition;
				} else queuedReferences.push(key, value, keyIndex);
				break;
		}
		keyIndex++;
	}

	for (let i = 0, l = queuedReferences.length; i < l;) {
		let key = queuedReferences[i++];
		let value = queuedReferences[i++];
		let propertyIndex = queuedReferences[i++];
		let nextTransition = transition[key];
		if (!nextTransition) {
			transition[key] = nextTransition = {
				key,
				parent: transition,
				enumerationOffset: propertyIndex - keyIndex,
				ascii0: null,
				ascii8: null,
				num8: null,
				string16: null,
				object16: null,
				num32: null,
				float64: null
			};
		}
		let newPosition;
		if (value) {
			/*if (typeof value === 'string') { // TODO: we could re-enable long strings
				if (position + value.length * 3 > safeEnd) {
					target = makeRoom(position + value.length * 3);
					position -= start;
					targetView = target.dataView;
					start = 0;
				}
				newPosition = position + target.utf8Write(value, position, 0xffffffff);
			} else { */
			let size;
			refOffset = refPosition - refsStartPosition;
			if (refOffset < 0xff00) {
				transition = nextTransition.object16;
				if (transition)
					size = 2;
				else if ((transition = nextTransition.object32))
					size = 4;
				else {
					transition = createTypeTransition(nextTransition, OBJECT_DATA, 2);
					size = 2;
				}
			} else {
				transition = nextTransition.object32 || createTypeTransition(nextTransition, OBJECT_DATA, 4);
				size = 4;
			}
			newPosition = pack(value, refPosition);
			//}
			if (typeof newPosition === 'object') {
				// re-allocated
				refPosition = newPosition.position;
				targetView = newPosition.targetView;
				target = newPosition.target;
				refsStartPosition -= start;
				position -= start;
				start = 0;
			} else
				refPosition = newPosition;
			if (size === 2) {
				targetView.setUint16(position, refOffset, true);
				position += 2;
			} else {
				targetView.setUint32(position, refOffset, true);
				position += 4;
			}
		} else {
			transition = nextTransition.object16 || createTypeTransition(nextTransition, OBJECT_DATA, 2);
			targetView.setInt16(position, value === null ? -10 : -9, true);
			position += 2;
		}
		keyIndex++;
	}


	let recordId = transition[RECORD_SYMBOL];
	if (recordId == null) {
		recordId = packr.typedStructs.length;
		let structure = [];
		let nextTransition = transition;
		let key, type, prevStrProp, prevDataProp, firstDataIndex, lastStrProp;
		while((type = nextTransition.__type) !== undefined) {
			let size = nextTransition.__size;
			nextTransition = nextTransition.__parent;
			key = nextTransition.key;
			structure.push({ key, type, size, enumerationOffset: nextTransition.enumerationOffset });
			nextTransition = nextTransition.parent;
		}
		structure.reverse();

		if (packr.saveStructures({ typed: packr.typedStructs, named: packr.structures }) === false) {
			loadStructures();
			return writeStruct(object, target, start, structures, makeRoom, pack, packr);
		}
		transition[RECORD_SYMBOL] = recordId;
		packr.typedStructs[recordId] = structure;
	}


	switch(headerSize) {
		case 1:
			if (recordId >= 0x10) return 0;
			target[start] = recordId + 0x20;
			break;
		case 2:
			if (recordId >= 0x100) return 0;
			target[start] = 0x38;
			target[start + 1] = recordId;
			break;
		case 3:
			if (recordId >= 0x10000) return 0;
			target[start] = 0x39;
			target.setUint16(start + 1, recordId, true);
			break;
		case 4:
			if (recordId >= 0x1000000) return 0;
			target.setUint32(start, (recordId << 8) + 0x3a, true);
			break;
	}

	if (position < refsStartPosition) {
		if (refsStartPosition === refPosition) // no refs
			return position;
		// adjust positioning
		target.copyWithin(position, refsStartPosition, refPosition);
		refPosition += position - refsStartPosition;
		typedStructs.lastStringStart = position - start;
		console.log('typedStructs.lastStringStart', typedStructs.lastStringStart)
	} else if (position > refsStartPosition) {
		if (refsStartPosition === refPosition) // no refs
			return position;
		typedStructs.lastStringStart = position - start;
		return writeStruct(object, target, start, structures, makeRoom, pack, packr);
	}
	return refPosition;
/*	if (asciiStrLength > 0) {
		if (position + asciiStrLength > safeEnd) {
			target = makeRoom(position + asciiStrLength);
			position -= start;
			targetView = target.dataView;
			start = 0;
			dataStart = position;
		}
		if (asciiStrLength > 0x40)
			position += target.ascii1Write(asciiArray.join(''), position, 0xffffffff);
		else {
			for (let i = 0; i < asciiStrCount; i++) {
				let str = asciiArray[i];
				for (let j = 0, l = str.length; j < l; j++) {
					target[position++] = str.charCodeAt(j);
				}
			}
		}
	}*/
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
	}

	return position;*/
}
function anyType(transition, position, targetView, value) {
	let nextTransition;
	if ((nextTransition = transition.ascii8 || transition.num8)) {
		targetView.setInt8(position, value, true);
		updatedPosition = position + 1;
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
	if (nextTransition = transition.num64) {
		targetView.setFloat64(position, NaN, true);
		targetView.setInt8(position, value);
		updatedPosition = position + 8;
		return nextTransition;
	}
	updatedPosition = position;
	// TODO: can we do an "any" type where we defer the decision?
	return;
}
function createTypeTransition(transition, type, size) {
	let typeName = TYPE_NAMES[type] + (size << 3);
	let newTransition = transition[typeName] = Object.create(null);
	newTransition.__type = type;
	newTransition.__size = size;
	newTransition.__parent = transition;
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
	let recordId = src[position++] - 0x20;
	if (recordId >= 24) {
		switch(recordId) {
			case 24: recordId = src[position++]; break;
			// little endian:
			case 25: recordId = src[position++] + (src[position++] << 8); break;
			case 26: recordId = src[position++] + (src[position++] << 8) + (src[position++] << 16); break;
			case 27: recordId = src[position++] + (src[position++] << 8) + (src[position++] << 16) + (src[position++] << 24); break;
		}
	}
	let structure = unpackr.typedStructs[recordId];
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
		let lastRefProperty, firstRefProperty;
		let properties = [];
		for (let i = 0, l = structure.length; i < l; i++) {
			let definition = structure[i];
			let { key, type, size, enumerationOffset } = definition;
			let property = {
				key,
				offset: currentOffset,
			}
			if (enumerationOffset)
				properties.splice(i + enumerationOffset, 0, property);
			else
				properties.push(property);
			let getRef;
			switch(size) { // TODO: Move into a separate function
				case 0: getRef = () => 0; break;
				case 1:
					getRef = (source, position) => {
						let ref = source.src[position + property.offset];
						return ref >= 0xf6 ? toConstant(ref) : ref;
					};
					break;
				case 2:
					getRef = (source, position) => {
						let src = source.src;
						let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
						let ref = dataView.getUint16(position + property.offset, true);
						return ref >= 0xff00 ? toConstant(ref & 0xff) : ref;
					};
					break;
				case 4:
					getRef = (source, position) => {
						let src = source.src;
						let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
						let ref = dataView.getUint32(position + property.offset, true);
						return ref >= 0xffffff00 ? toConstant(ref & 0xff) : ref;
					};
					break;
			}
			property.getRef = getRef;
			currentOffset += size;
			let get;
			switch(type) {
				case ASCII:
					if (lastRefProperty && !lastRefProperty.next)
						lastRefProperty.next = property;
					lastRefProperty = property;
					property.multiGetCount = 0;
					get = function() {
						let source = this[sourceSymbol];
						let src = source.src;
						let position = source.position;
						let refStart = currentOffset + position;
						let ref = getRef(source, position);
						if (typeof ref !== 'number') return ref;

						let end, next = property.next;
						while(next) {
							end = next.getRef(source, position);
							if (typeof end === 'number')
								break;
							else
								end = null;
							next = next.next;
						}
						if (end == null)
							end = srcEnd - refStart;
						if (source.srcString) {
							return source.srcString.slice(ref, end);
						}
						/*if (property.multiGetCount > 0) {
							let asciiEnd;
							next = firstRefProperty;
							let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
							do {
								asciiEnd = dataView.getUint16(source.position + next.offset, true);
								if (asciiEnd < 0xff00)
									break;
								else
									asciiEnd = null;
							} while((next = next.next));
							if (asciiEnd == null)
								asciiEnd = srcEnd - refStart
							source.srcString = src.toString('latin1', refStart, refStart + asciiEnd);
							return source.srcString.slice(ref, end);
						}
						if (source.prevStringGet) {
							source.prevStringGet.multiGetCount += 2;
						} else {
							source.prevStringGet = property;
							property.multiGetCount--;
						}*/
						return src.toString('latin1', ref + refStart, end + refStart);
					};
					break;
				case UTF8: case OBJECT_DATA:
					if (lastRefProperty && !lastRefProperty.next)
						lastRefProperty.next = property;
					lastRefProperty = property;
					get = function() {
						let source = this[sourceSymbol];
						let position = source.position;
						let refStart = currentOffset + position;
						let ref = getRef(source, position);
						if (typeof ref !== 'number') return ref;
						let src = source.src;

						/*if (src[ref] == 62) {
							// read the 32-bit reference
							let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
							ref = dataView.getUint32(ref) + refStart;
							end = dataView.getUint32(ref + 4) + refStart;
						} */
						let end, next = property.next;
						while(next) {
							end = next.getRef(source, position);
							if (typeof end === 'number')
								break;
							else
								end = null;
							next = next.next;
						}
						if (end == null)
							end = srcEnd - refStart;
						if (type === UTF8) {
							return src.toString('utf8', ref + refStart, end + refStart);
						} else {
							return unpackr.unpack(src, { start: ref + refStart, end: end  + refStart }); // could reuse this object
						}
					};
					break;
				case NUMBER:
					switch(size) {
						case 4:
							get = function () {
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
							break;
						case 8:
							get = function () {
								let source = this[sourceSymbol];
								let src = source.src;
								let dataView = src.dataView || (src.dataView = new DataView(src.buffer, src.byteOffset, src.byteLength));
								let value = dataView.getFloat64(source.position + property.offset, true);
								if (isNaN(value)) {
									let byte = src[source.position + property.offset];
									if (byte >= 0xf6)
										return toConstant(byte);
								}
								return value;
							};
							break;
						case 1:
							get = function () {
								let source = this[sourceSymbol];
								let src = source.src;
								let value = src[source.position + property.offset];
								return value < 0xf6 ? value : toConstant(value);
							};
							break;
					}
			}
			property.get = get;
		}
		for (let property of properties) // assign in enumeration order
			Object.defineProperty(prototype, property.key, { get: property.get, enumerable: true });
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
