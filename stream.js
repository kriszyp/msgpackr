"use strict"
import { Transform } from 'stream'
import { Packr } from './pack.js'
import { read, getPosition, Unpackr, clearSource } from './unpack.js'
var DEFAULT_OPTIONS = {objectMode: true}

export class PackrStream extends Transform {
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

export class UnpackrStream extends Transform {
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
			let value = this.unpackr.unpack(chunk, size, true)
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
