"use strict"
var Transform = require('stream').Transform
var Encoder = require('./encode').Encoder
const { read, getPosition, Decoder } = require('./decode')
var DEFAULT_OPTIONS = {objectMode: true}

class EncoderStream extends Transform {
	constructor(options) {
		if (!options)
			options = {}
		super(options)
		options.sequential = true
		this.encoder = new Encoder(options)
	}
	write(value) {
		this.push(this.encoder.encode(value))
	}

	end(value) {
		if (value != null)
			this.push(this.encoder.encode(value))
		this.push(null)
	}
}

class DecoderStream extends Transform {
	constructor(options) {
		if (!options)
			options = {}
		options.objectMode = true
		super(options)
		options.structures = []
		this.decoder = new Decoder(options)
	}
	_transform(chunk, encoding, callback) {
		if (this.incompleteBuffer) {
			chunk = Buffer.concat([this.incompleteBuffer, chunk])
			this.incompleteBuffer = null
		}
		let lastStart = 0
		let size = chunk.length
		try {
			this.push(this.decoder.decode(chunk))
			lastStart = getPosition()
			while (lastStart < size) {
				let value = read()
				this.push(value)
				lastStart = getPosition()
			}
		} catch(error) {
			if (error.incomplete)
				this.incompleteBuffer = chunk.slice(lastStart)
			else
				throw error
		}
		if (callback) callback()
	}
}

exports.EncoderStream = EncoderStream
exports.DecoderStream = DecoderStream
