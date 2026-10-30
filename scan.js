import { _stream } from './unpack.js';

const ITEMS = 0;
const DEFINITION = 1;
const BUNDLE = 2;
const MAX_DEPTH = 16384;

/**
 * Finds where an incomplete MessagePack value ends without constructing it, resuming as more bytes arrive, so a
 * value split across many chunks is scanned once and unpacked once. Positions are relative to the start of the
 * value. A value it can not frame (an unknown extension, an undefined record id, a malformed bundle, keys it can not
 * count) is marked unframeable, and is unpacked again as each chunk arrives, as before scanning.
 */
export class StructureScanner {
	constructor(unpackr) {
		this.unpackr = unpackr;
		this.frames = [];
		this.records = new Map(); // definitions within this value: { length, highByte }
		this.reset();
	}

	reset() {
		this.position = 0;
		this.depth = 0;
		this.neededLength = 0;
		this.postBundlePosition = 0;
		this.bundled = false; // after a bundle, 0xc1 is followed by a string length, as in read()
		this.loadedStructures = false;
		this.headers = 0;
		this.unframeable = false;
		this.records.clear();
		this.push(ITEMS, 1);
	}

	push(kind, remaining) {
		if (this.depth === MAX_DEPTH) throw new RangeError('Maximum MessagePack nesting depth exceeded');
		const frame = this.frames[this.depth] || (this.frames[this.depth] = {});
		frame.kind = kind;
		frame.remaining = remaining;
		frame.stage = 0;
		this.depth++;
		return frame;
	}

	need(length) {
		this.neededLength = length;
		return false;
	}

	invalid(end) {
		this.depth = 0;
		this.postBundlePosition = 0;
		this.position = end;
		this.unframeable = true;
		return true;
	}

	structure(id) {
		const record = this.records.get(id);
		if (record) return record;
		const unpackr = this.unpackr;
		let structure = unpackr.structures && unpackr.structures[id];
		if (!structure && unpackr.getStructures && !this.loadedStructures) {
			// read() would load them here too, and keeps what it loaded
			this.loadedStructures = true;
			structure = unpackr._mergeStructures(unpackr.getStructures(), unpackr.structures)[id];
		}
		return structure;
	}

	// true once the value is complete, with position at its end; else false, with the length needed to progress
	scan(source, end) {
		while (this.depth) {
			if (this.position > end) return this.need(this.position);
			const frame = this.frames[this.depth - 1];
			if (frame.kind === ITEMS) {
				if (frame.remaining === 0) this.depth--;
				else if (!this.item(source, end, frame)) return false;
			} else if (frame.kind === DEFINITION) {
				if (!this.definition(source, end, frame)) return false;
			} else if (!this.bundle(source, end, frame)) return false;
		}
		if (this.postBundlePosition) this.position = this.postBundlePosition;
		if (this.frames.length > 256) this.frames.length = 256;
		return true;
	}

	item(source, end, frame) {
		const start = this.position;
		if (start >= end) return this.need(start + 1);
		const token = source[start];
		let size = 1; // of the header
		let length = 0; // of the data after it
		let items = 0;
		let extension = -1;
		if (token < 0xc0) {
			if (token < 0x80) {
				if (token >= 0x40) {
					const firstId = token & 0x3f;
					let structure = this.structure(firstId);
					if (structure) {
						let position = start + 1;
						while (structure.highByte === 0) {
							// a second byte selects the record, as in createSecondByteReader
							if (position >= end) return this.need(position + 1);
							const highByte = source[position++];
							if (highByte === 0) break;
							structure = this.structure(firstId < 32 ? -(firstId + (highByte << 5)) : firstId + (highByte << 5));
							if (!structure) return this.invalid(end);
						}
						this.position = position;
						this.headers++;
						frame.remaining--;
						if (structure.length) this.push(ITEMS, structure.length);
						return true;
					}
				}
			} else if (token < 0x90) items = (token - 0x80) * 2;
			else if (token < 0xa0) items = token - 0x90;
			else length = token - 0xa0;
		} else if (token >= 0xe0) {
			// a negative fixint
		} else {
			switch (token) {
				case 0xc1: if (this.bundled) items = 1; break;
				case 0xc4: case 0xcc: case 0xd0: case 0xd9: size = 2; break;
				case 0xc5: case 0xc7: case 0xcd: case 0xd1: case 0xda: case 0xdc: case 0xde: size = 3; break;
				case 0xc8: size = 4; break;
				case 0xc6: case 0xca: case 0xce: case 0xd2: case 0xdb: case 0xdd: case 0xdf: size = 5; break;
				case 0xc9: size = 6; break;
				case 0xcb: case 0xcf: case 0xd3: size = 9; break;
				case 0xd4: case 0xd5: case 0xd6: case 0xd7: case 0xd8: size = 2; break;
			}
			if (start + size > end) return this.need(start + size);
			switch (token) {
				case 0xc4: case 0xd9: length = source[start + 1]; break;
				case 0xc5: case 0xda: length = (source[start + 1] << 8) | source[start + 2]; break;
				case 0xc6: case 0xdb: length = readUint32(source, start + 1); break;
				case 0xc7: length = source[start + 1]; break;
				case 0xc8: length = (source[start + 1] << 8) | source[start + 2]; break;
				case 0xc9: length = readUint32(source, start + 1); break;
				case 0xd4: length = 1; break;
				case 0xd5: length = 2; break;
				case 0xd6: length = 4; break;
				case 0xd7: length = 8; break;
				case 0xd8: length = 16; break;
				case 0xdc: items = (source[start + 1] << 8) | source[start + 2]; break;
				case 0xdd: items = readUint32(source, start + 1); break;
				case 0xde: items = ((source[start + 1] << 8) | source[start + 2]) * 2; break;
				case 0xdf: items = readUint32(source, start + 1) * 2; break;
			}
			if (token >= 0xc7 && token <= 0xc9 || token >= 0xd4 && token <= 0xd8) {
				extension = source[start + size - 1];
				if (extension === 0x72 && (token === 0xd4 || token === 0xd5)) {
					if (start + size + length > end) return this.need(start + size + length);
					const firstId = source[start + 2] & 0x3f;
					const highByte = token === 0xd5 ? source[start + 3] : undefined;
					this.position = start + size + length;
					this.headers++;
					frame.remaining--;
					const definition = this.push(DEFINITION, 0);
					definition.id = highByte === undefined ? firstId :
						firstId < 32 ? -((highByte << 5) + firstId) : (highByte << 5) + firstId;
					definition.highByte = highByte;
					return true;
				}
			}
		}
		const dataStart = start + size;
		if (extension >= 0) {
			const follows = _stream.extensionFollows(extension, token === 0xd4);
			if (follows < 0 || follows === 2 && length < 4) {
				// unpack reads the data before it fails
				if (dataStart + length > end) return this.need(dataStart + length);
				return this.invalid(end);
			}
			if (follows === 2) {
				// the data holds the offset of the bundle's two strings
				if (dataStart + length > end) return this.need(dataStart + length);
				const bundle = this.push(BUNDLE, 2);
				bundle.target = dataStart + ((source[dataStart] << 24) + (source[dataStart + 1] << 16) +
					(source[dataStart + 2] << 8) + source[dataStart + 3]);
				bundle.resume = dataStart + length;
				frame.remaining--;
			} else {
				frame.remaining--;
				if (follows) this.push(ITEMS, 1);
			}
		} else {
			frame.remaining--;
			if (items) this.push(ITEMS, items);
		}
		this.position = dataStart + length;
		this.headers++;
		return true;
	}

	definition(source, end, frame) {
		if (frame.stage === 0) {
			let position = this.position;
			if (position >= end) return this.need(position + 1);
			const token = source[position];
			let count;
			if (token >= 0x90 && token < 0xa0) {
				count = token - 0x90;
				position++;
			} else if (token === 0xdc) {
				if (position + 3 > end) return this.need(position + 3);
				count = (source[position + 1] << 8) | source[position + 2];
				position += 3;
			} else if (token === 0xdd) {
				if (position + 5 > end) return this.need(position + 5);
				count = readUint32(source, position + 1);
				position += 5;
			} else {
				// keys from an extension are unpacked to count them, once complete
				frame.schemaStart = position;
				frame.stage = 2;
				this.push(ITEMS, 1);
				return true;
			}
			this.position = position;
			this.headers++;
			frame.length = count;
			frame.stage = 1;
			if (count) this.push(ITEMS, count);
			return true;
		}
		let length = frame.length;
		if (frame.stage === 2) {
			try {
				length = _stream.countKeys(this.unpackr, source.subarray(frame.schemaStart, this.position));
			} catch (error) {
				return this.invalid(end);
			}
		}
		this.records.set(frame.id, { length, highByte: frame.highByte });
		frame.kind = ITEMS;
		frame.remaining = length;
		return true;
	}

	// a bundle's two strings come before the value after the extension, as in its unpacker
	bundle(source, end, frame) {
		if (frame.stage === 0) {
			if (frame.target < 0) return this.invalid(end);
			frame.stage = 1;
			this.position = frame.target;
			return true;
		}
		if (frame.remaining) {
			const start = this.position;
			if (start >= end) return this.need(start + 1);
			const token = source[start];
			let size = 1, length;
			if (token >= 0xa0 && token < 0xc0) length = token - 0xa0;
			else if (token === 0xd9) size = 2;
			else if (token === 0xda) size = 3;
			else if (token === 0xdb) size = 5;
			else return this.invalid(end);
			if (start + size > end) return this.need(start + size);
			if (token === 0xd9) length = source[start + 1];
			else if (token === 0xda) length = (source[start + 1] << 8) | source[start + 2];
			else if (token === 0xdb) length = readUint32(source, start + 1);
			this.position = start + size + length;
			this.headers++;
			frame.remaining--;
			return true;
		}
		this.postBundlePosition = this.position;
		this.position = frame.resume;
		this.bundled = true;
		frame.kind = ITEMS;
		frame.remaining = 1;
		return true;
	}
}

function readUint32(source, position) {
	return source[position] * 0x1000000 + ((source[position + 1] << 16) | (source[position + 2] << 8) | source[position + 3]);
}
