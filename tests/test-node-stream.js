import { EncoderStream, DecoderStream } from '../node.js'
import stream from 'stream'
import chai from 'chai'
var assert = chai.assert

suite('cbor-x node stream tests', function(){
	test('serialize/parse stream', () => {
		const serializeStream = new EncoderStream({
		})
		const parseStream = new DecoderStream()
		serializeStream.pipe(parseStream)
		const received = []
		parseStream.on('data', data => {
			received.push(data)
		})
		const messages = [{
			name: 'first'
		}, {
			name: 'second'
		}, {
			name: 'third'
		}, {
			name: 'third',
			extra: [1, 3, { foo: 'hi'}, 'bye']
		}]
		for (const message of messages)
			serializeStream.write(message)
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				assert.deepEqual(received, messages)
				resolve()
			}, 10)
		})
	})
	test('stream from buffer', () => new Promise(async resolve => {
		const parseStream = new DecoderStream()
		let values = []
		parseStream.on('data', (value) => {
			values.push(value)
		})
		parseStream.on('end', () => {
			assert.deepEqual(values, [1, 2])
			resolve()
		})
		let bufferStream = new stream.Duplex()
		bufferStream.pipe(parseStream)
		bufferStream.push(new Uint8Array([1, 2]))
		bufferStream.push(null)
	}))
})
