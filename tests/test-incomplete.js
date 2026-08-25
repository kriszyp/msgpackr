import { encode, unpack, Unpackr } from '../index.js';
import { assert } from 'chai';
import { Encoder } from '../pack.js';

const tests = {
  string: 'interesting string',
  number: 12345,
  buffer: Buffer.from('hello world'),
  bigint: 12345678910n,
  array: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  'many-strings': [],
  set: new Set('abcdefghijklmnopqrstuvwxyz'.split('')),
  object: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }
};
for (let i = 0; i < 100; i++) {
  tests['many-strings'].push('test-data-' + i);
}

suite('encode and decode tests with partial values', function () {
  const encoder = new Encoder({ objectMode: true, structures: [], moreTypes: true, structuredClone: true });

  for (const [label, testData] of Object.entries(tests)) {
    test(label, () => {
      const encoded = encoder.encode(testData);
      assert.isTrue(Buffer.isBuffer(encoded), 'encode returns a Buffer');
      assert.deepStrictEqual(encoder.decode(encoded, encoded.length, true), testData, 'full buffer decodes well');
      for (let length = Math.max(1, Math.ceil(encoded.length / 2) - 40); length < Math.ceil(encoded.length / 2); length++) {
        const firstHalf = encoded.slice(0, length);
        let value;
        try {
          value = encoder.decode(firstHalf, firstHalf.length, true);
        } catch (err) {
          if (err.incomplete !== true) {
            assert.fail(`Should throw an error with .incomplete set to true, instead threw error <${err}>, for ${JSON.stringify(testData)} ${encoded.length}, ${length}`);
          } else {
            continue; // victory! correct outcome!
          }
        }
        assert.fail(`Should throw an error with .incomplete set to true, instead returned value ${JSON.stringify(value)}`);
      }
    });
  }
});

// An array or map header declares its element count up front. Decoding must not allocate for that
// count before the elements are known to be present in the source, otherwise a few bytes of header
// can force an arbitrarily large allocation.
const malformedContainers = {
  'array32 declaring 20 million elements': [0xdd, 0x01, 0x31, 0x2d, 0x00],
  'array32 declaring 20 million elements with one present': [0xdd, 0x01, 0x31, 0x2d, 0x00, 0x01],
  'array32 declaring the maximum length': [0xdd, 0xff, 0xff, 0xff, 0xff],
  'array16 declaring 65535 elements': [0xdc, 0xff, 0xff],
  'nested array32 declaring a million elements each': [0xdd, 0, 0x10, 0, 0, 0xdd, 0, 0x10, 0, 0],
  'map32 declaring 20 million entries': [0xdf, 0x01, 0x31, 0x2d, 0x00],
  'map16 declaring 65535 entries': [0xde, 0xff, 0xff],
  'fixarray with no elements present': [0x9f]
};

suite('unpack malformed containers', function () {
  this.timeout(1000); // these must all fail immediately, not after filling a declared length
  const unpackrs = [
    ['default', new Unpackr()],
    ['mapsAsObjects: false', new Unpackr({ mapsAsObjects: false })],
    ['useRecords', new Unpackr({ useRecords: true, structures: [] })]
  ];
  for (const [label, bytes] of Object.entries(malformedContainers)) {
    test(label, () => {
      for (const [unpackrLabel, unpackr] of unpackrs) {
        try {
          let value = unpackr.unpack(Buffer.from(bytes));
          assert.fail(`${label} should not unpack (${unpackrLabel}), returned ${JSON.stringify(value)}`);
        } catch (error) {
          assert.isTrue(error.incomplete, `${label} (${unpackrLabel}): ${error.message}`);
        }
      }
    });
  }

  test('rejecting an oversized declared length does not allocate', () => {
    let before = process.memoryUsage().heapUsed;
    assert.throws(() => unpack(Buffer.from([0xdd, 0x01, 0x31, 0x2d, 0x00])));
    // before this was checked, the 5 byte header above allocated a 20 million element array (~150MB)
    assert.isBelow((process.memoryUsage().heapUsed - before) / 1048576, 50, 'heap growth in MB');
  });
});
