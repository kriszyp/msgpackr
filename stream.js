import { Transform } from 'stream'
import { Encoder } from './encode.js'
import { read, getPosition, Decoder, clearSource } from './decode.js'
var DEFAULT_OPTIONS = {objectMode: true}

export class EncoderStream extends Transform {
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

export class DecoderStream extends Transform {
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
			let value = this.decoder.decode(chunk, size, true)
			if (value === null)
				value = this.getNullValue()
			this.push(value)
			position = getPosition()
			while (position < size) {
				value = read()
				if (value === null)
					value = this.getNullValue()
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
	getNullValue() {
		return Symbol.for(null)
	}
}
