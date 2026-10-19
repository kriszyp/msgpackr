import { Transform } from 'stream';
import { Packr } from './pack.js';
import { Unpackr } from './unpack.js';
import { unpackChunk, DEFAULT_MAX_INCOMPLETE_BUFFER_SIZE } from './iterators.js';
var DEFAULT_OPTIONS = {objectMode: true};

export class PackrStream extends Transform {
	constructor(options) {
		if (!options)
			options = {};
		options.writableObjectMode = true;
		super(options);
		options.sequential = true;
		this.packr = options.packr || new Packr(options);
	}
	_transform(value, encoding, callback) {
		this.push(this.packr.pack(value));
		callback();
	}
}

export class UnpackrStream extends Transform {
	constructor(options) {
		if (!options)
			options = {};
		options.objectMode = true;
		super(options);
		options.structures = [];
		this.maxIncompleteBufferSize = options.maxIncompleteBufferSize !== undefined ? options.maxIncompleteBufferSize : DEFAULT_MAX_INCOMPLETE_BUFFER_SIZE;
		this.unpackr = options.unpackr || new Unpackr(options);
	}
	_transform(chunk, encoding, callback) {
		let values, fatalError;
		try {
			values = unpackChunk(this, chunk);
		} catch(error) {
			values = error.values;
			fatalError = error;
		}
		for (let value of values || []) {
			if (value === null)
				value = this.getNullValue();
			this.push(value);
		}
		callback(fatalError);
	}
	_flush(callback) {
		if (this.incompleteBuffer) {
			this.incompleteBuffer = null;
			let error = new Error('Unexpected end of MessagePack data');
			error.incomplete = true;
			return callback(error);
		}
		callback();
	}
	getNullValue() {
		return Symbol.for(null);
	}
}
