"use strict"
var Transform = require('stream').Transform
var Packr = require('./pack').Packr
const { read, getPosition, Unpackr, clearSource } = require('./unpack')
var DEFAULT_OPTIONS = {objectMode: true}

class PackrStream extends Transform {
	constructor(options) {
		if (!options)
			options = {}
		super(options)
		options.sequential = true
		this.packr = new Packr(options)
	}
	write(value) {
		this.push(this.packr.pack(value))
	}

	end(value) {
		if (value != null)
			this.push(this.packr.pack(value))
		this.push(null)
	}
}

class UnpackrStream extends Transform {
	constructor(options) {
		if (!options)
			options = {}
		options.objectMode = true
		super(options)
		options.structures = []
		this.unpackr = new Unpackr(options)
	}
	_transform(chunk, encoding, callback) {
		if (this.incompleteBuffer) {
			chunk = Buffer.concat([this.incompleteBuffer, chunk])
			this.incompleteBuffer = null
		}
		let position = 0
		let size = chunk.length
		try {
			this.push(this.unpackr.unpack(chunk, size, true))
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

exports.PackrStream = PackrStream
exports.UnpackrStream = UnpackrStream
