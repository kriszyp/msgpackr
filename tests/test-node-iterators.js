import { encodeIter, decodeIter } from '../index.js'
import { decode } from '../index.js'
import { assert } from 'chai'

const tests = [
  null,
  false,
  true,
  'interesting string',
  12345,
  123456789n,
  123.456,
  Buffer.from('Hello World'),
  'abcdefghijklmnopqrstuvwxyz'.split('')
]

suite('msgpackr iterators interface tests', function () {
  test('sync encode iterator', () => {
    const encodings = [...encodeIter(tests)]
    const decodings = encodings.map(x => decode(x))
    assert.deepStrictEqual(decodings, tests)
  })

  test('async encode iterator', async () => {
    async function * generate () {
      for (const test of tests) {
        await new Promise((resolve, reject) => setImmediate(resolve))
        yield test
      }
    }

    const chunks = []
    for await (const chunk of encodeIter(generate())) {
      chunks.push(chunk)
    }

    const decodings = chunks.map(x => decode(x))
    assert.deepStrictEqual(decodings, tests)
  })

  test('sync encode and decode iterator', () => {
    const encodings = [...encodeIter(tests)]
    assert.isTrue(encodings.every(v => Buffer.isBuffer(v)))
    const decodings = [...decodeIter(encodings)]
    assert.deepStrictEqual(decodings, tests)

    // also test decodings work with buffers multiple values in a buffer
    const concatEncoding = Buffer.concat([...encodings])
    const decodings2 = [...decodeIter([concatEncoding])]
    assert.deepStrictEqual(decodings2, tests)

    // also test decodings work with partial buffers that don't align to values perfectly
    const half1 = concatEncoding.slice(0, Math.floor(concatEncoding.length / 2))
    const half2 = concatEncoding.slice(Math.floor(concatEncoding.length / 2))
    const decodings3 = [...decodeIter([half1, half2])]
    assert.deepStrictEqual(decodings3, tests)
  })

  test('async encode and decode iterator', async () => {
    async function * generator () {
      for (const obj of tests) {
        await new Promise((resolve, reject) => setImmediate(resolve))
        yield obj
      }
    }
    const yields = []
    for await (const value of decodeIter(encodeIter(generator()))) {
      yields.push(value)
    }
    assert.deepStrictEqual(yields, tests)
  })
})