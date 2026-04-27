import { Transform } from 'stream'
import { Packr } from './pack.js'
import { Unpackr } from './unpack.js'
var DEFAULT_OPTIONS = {objectMode: true}

export class PackrStream extends Transform {
	constructor(options) {
		if (!options)
			options = {}
		options.writableObjectMode = true
		super(options)
		options.sequential = true
		this.packr = options.packr || new Packr(options)
	}
	_transform(value, encoding, callback) {
		this.push(this.packr.pack(value))
		callback()
	}
}

export class UnpackrStream extends Transform {
	constructor(options) {
		if (!options)
			options = {}
		options.objectMode = true
		super(options)
		options.structures = []
		this.maxIncompleteBufferSize = options.maxIncompleteBufferSize > -1 ? options.maxIncompleteBufferSize : 0x4000000
		this.unpackr = options.unpackr || new Unpackr(options)
	}
	_transform(chunk, encoding, callback) {
		if (this.incompleteBuffer) {
			let chunkSize = this.incompleteBuffer.length + chunk.length
			if (chunkSize > this.maxIncompleteBufferSize) {
				this.incompleteBuffer = null
				let error = new Error('Maximum incomplete buffer size exceeded')
				if (callback) return callback(error)
				throw error
			}
			chunk = Buffer.concat([this.incompleteBuffer, chunk])
			this.incompleteBuffer = null
		}
		let values, streamError
		try {
			values = this.unpackr.unpackMultiple(chunk)
		} catch(error) {
			if (error.incomplete) {
				let incompleteBuffer = chunk.slice(error.lastPosition)
				if (incompleteBuffer.length > this.maxIncompleteBufferSize) {
					this.incompleteBuffer = null
					streamError = new Error('Maximum incomplete buffer size exceeded')
				} else
					this.incompleteBuffer = incompleteBuffer
				values = error.values
			}
			else
				throw error
		} finally {
			for (let value of values || []) {
				if (value === null)
					value = this.getNullValue()
				this.push(value)
			}
		}
		if (streamError) {
			if (callback) return callback(streamError)
			throw streamError
		}
		if (callback) callback()
	}
	getNullValue() {
		return Symbol.for(null)
	}
}
