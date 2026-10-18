import { Transform } from 'stream';
import { Packr } from './pack.js';
import { Unpackr } from './unpack.js';
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
		this.maxIncompleteBufferSize = options.maxIncompleteBufferSize !== undefined ? options.maxIncompleteBufferSize : 0x4000000;
		this.unpackr = options.unpackr || new Unpackr(options);
	}
	_transform(chunk, encoding, callback) {
		if (this.incompleteBuffer) {
			chunk = Buffer.concat([this.incompleteBuffer, chunk]);
			this.incompleteBuffer = null;
		}
		let values, fatalError;
		try {
			values = this.unpackr.unpackMultiple(chunk);
		} catch(error) {
			values = error.values;
			if (error.incomplete) {
				let incompleteBuffer = chunk.slice(error.lastPosition);
				if (incompleteBuffer.length > this.maxIncompleteBufferSize)
					fatalError = new Error('Maximum incomplete buffer size exceeded');
				else
					this.incompleteBuffer = incompleteBuffer;
			} else {
				fatalError = error;
			}
		}
		for (let value of values || []) {
			if (value === null)
				value = this.getNullValue();
			this.push(value);
		}
		callback(fatalError);
	}
	_flush(callback) {
		if (this.incompleteBuffer && this.incompleteBuffer.length > 0) {
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
