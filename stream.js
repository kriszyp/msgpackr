"use strict"
var Transform = require('stream').Transform
var Encoder = require('./encode').Encoder
const { read, getPosition, Decoder, clearSource } = require('./decode')
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
		let position = 0
		let size = chunk.length
		try {
			this.push(this.decoder.decode(chunk, size, true))
			position = getPosition()
			while (position < size) {
				let value = read()
				this.push(value)
				position = getPosition()
			}
		} catch(error) {
			if (error.incomplete)
				this.incompleteBuffer = chunk.slice(position)
			else
				throw error
		} finally {
			clearSource()
		}
		if (callback) callback()
	}
}

exports.EncoderStream = EncoderStream
exports.DecoderStream = DecoderStream
