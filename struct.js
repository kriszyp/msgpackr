/*
types:
double
float
uint16
uint8
ref16
ref32
str16 - starting with 0x8 (first bit set) means latin1
str32 - starting with 0xf, means latin1

all types:
(0xff)*, 0xc0 = null
(0xff)*, msgpackr encoding -> decode with msgpackr
*/

const TYPE_SIZE = {
	double: 8,
	float: 4,
	uint16: 2,
	uint8: 1,
	ref16: 2,
	ref32: 4,
	str16: 2,
	str32: 4,
	ref0: 0,
	str0: 0,
}
function readObject() {
	
	var prototype = {}
	// sort with biggest types first for optimal packing and alignment
	positioned = structure.slice(0).sort((a, b) => {
		let asSize = TYPE_SIZE[a.type];
		let bSize = TYPE_SIZE[b.type];
		return asSize > bSize ? 1 : aSize < bSize ? -1 : 0;
	})
	let l = structure.length;
	let offset = 0;
	let lastReferencingOffset;
	for (let i = 0; i < l; i++) {
		let property = positioned[i];
		property.offset = offset;
		property.start = lastReferencingOffset;
		lastReferencingOffset = offset;
		offset += TYPE_SIZE[property.type];
	}
	for (let i = 0, l = structure.length; i < l; i++) {
		let property = structure[i]
		let get, set
		let offset = property.offset
		switch (property.type) {
			case 'double':
				get = function() {
					return this.buffer.dataView.getFloat64(this.position + offset)
				};
				break;
			case 'uint16':
				get = function() {
					let value = this.buffer.dataView.getUint16(this.position + offset)
					if (value >= 0xffc0) {
						return unpack(this.buffer, this.position + 2, this.position + 1);
					}
					return value;
				};
				break;
			case 'ref16':
				let start = property.start;
				get = function() {
					
					let refEnd = this.buffer.dataView.getUint16(this.position + offset) + this.position + offset;
					
					if (value >= 0xffc0) {
						return unpack(this.buffer, this.position + 2, this.position + 1);
					}
					return value;
				}
				
		}
		Object.defineProperty(prototype, property.name, { get, set, enumerable: true })

	}
	structure.read = function() {
		let object = {
			position,
			source,
			__proto__: prototype
		}
		position += 
	}

	if (readObject.count++ > inlineObjectReadThreshold) {
		let readObject = structure.read = (new Function('r', 'return function(){return {' + structure.map(key => validName.test(key) ? key + ':r()' : ('[' + JSON.stringify(key) + ']:r()')).join(',') + '}}'))(read)
		if (structure.highByte === 0)
			structure.read = createSecondByteReader(firstId, structure.read)
		return readObject() // second byte is already read, if there is one so immediately read object
	}
	let object = {}
	for (let i = 0, l = structure.length; i < l; i++) {
		let key = structure[i]
		object[key] = read()
	}
	return object
}