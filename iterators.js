import { Packr } from './pack.js';
import { Unpackr, _stream } from './unpack.js';
import { StructureScanner } from './scan.js';

/**
 * Given an Iterable first argument, returns an Iterable where each value is packed as a Buffer
 * If the argument is only Async Iterable, the return value will be an Async Iterable.
 * @param {Iterable|Iterator|AsyncIterable|AsyncIterator} objectIterator - iterable source, like a Readable object stream, an array, Set, or custom object
 * @param {options} [options] - msgpackr pack options
 * @returns {IterableIterator|Promise.<AsyncIterableIterator>}
 */
export function packIter (objectIterator, options = {}) {
  if (!objectIterator || typeof objectIterator !== 'object') {
    throw new Error('first argument must be an Iterable, Async Iterable, or a Promise for an Async Iterable');
  } else if (typeof objectIterator[Symbol.iterator] === 'function') {
    return packIterSync(objectIterator, options);
  } else if (typeof objectIterator.then === 'function' || typeof objectIterator[Symbol.asyncIterator] === 'function') {
    return packIterAsync(objectIterator, options);
  } else {
    throw new Error('first argument must be an Iterable, Async Iterable, Iterator, Async Iterator, or a Promise');
  }
}

function * packIterSync (objectIterator, options) {
  const packr = new Packr(options);
  for (const value of objectIterator) {
    yield packr.pack(value);
  }
}

async function * packIterAsync (objectIterator, options) {
  const packr = new Packr(options);
  for await (const value of objectIterator) {
    yield packr.pack(value);
  }
}

export const DEFAULT_MAX_INCOMPLETE_BUFFER_SIZE = 0x4000000;

/**
 * Given an Iterable/Iterator input which yields buffers, returns an IterableIterator which yields sync decoded objects
 * Or, given an Async Iterable/Iterator which yields promises resolving in buffers, returns an AsyncIterableIterator.
 * @param {Iterable|Iterator|AsyncIterable|AsyncIterableIterator} bufferIterator
 * @param {object} [options] - unpackr options
 * @returns {IterableIterator|Promise.<AsyncIterableIterator}
 */
export function unpackIter (bufferIterator, options = {}) {
  if (!bufferIterator || typeof bufferIterator !== 'object') {
    throw new Error('first argument must be an Iterable, Async Iterable, Iterator, Async Iterator, or a promise');
  }

  const state = {
    unpackr: streamUnpackr(new Unpackr(options)),
    maxIncompleteBufferSize: options.maxIncompleteBufferSize !== undefined ? options.maxIncompleteBufferSize : DEFAULT_MAX_INCOMPLETE_BUFFER_SIZE
  };
  let fatalError;
  const parser = (chunk) => {
    try {
      return unpackChunk(state, chunk);
    } catch (error) {
      fatalError = error;
      return error.values || [];
    }
  };

  if (typeof bufferIterator[Symbol.iterator] === 'function') {
    return (function * iter () {
      for (const value of bufferIterator) {
        yield * parser(value);
        if (fatalError) throw fatalError;
      }
      if (state.incompleteBuffer) throw endOfInput();
    })();
  } else if (typeof bufferIterator[Symbol.asyncIterator] === 'function') {
    return (async function * iter () {
      for await (const value of bufferIterator) {
        yield * parser(value);
        if (fatalError) throw fatalError;
      }
      if (state.incompleteBuffer) throw endOfInput();
    })();
  }
}

/**
 * Unpacks the values in the next chunk of a sequence, holding the start of a value that continues
 * into later chunks. state carries the unpackr and maxIncompleteBufferSize, and the held bytes
 * between calls. A fatal error is thrown with the values that preceded it as error.values.
 */
export function unpackChunk (state, chunk) {
  if (chunk.length === 0) return [];
  let source = chunk;
  let scannedEnd = 0;
  if (state.incompleteBuffer) {
    if (!(ArrayBuffer.isView(chunk) && chunk.BYTES_PER_ELEMENT === 1)) throw new TypeError('Chunk must be a Uint8Array or Buffer');
    const length = state.incompleteLength + chunk.length;
    if (length < state.incompleteNeeded && length > state.maxIncompleteBufferSize) {
      state.incompleteBuffer = null;
      throw new Error('Maximum incomplete buffer size exceeded');
    }
    holdIncomplete(state, chunk, length);
    if (length < state.incompleteNeeded) return [];
    source = state.incompleteBuffer.subarray(0, length);
    const scanner = state.incompleteScanner;
    if (scanner) {
      let complete;
      try {
        complete = scanner.scan(state.incompleteBuffer, length);
      } catch (error) {
        state.incompleteBuffer = null;
        throw error;
      }
      if (!complete) {
        state.incompleteNeeded = scanner.neededLength;
        if (length > state.maxIncompleteBufferSize) {
          state.incompleteBuffer = null;
          throw new Error('Maximum incomplete buffer size exceeded');
        }
        return [];
      }
      if (!scanner.unframeable) scannedEnd = scanner.position;
    }
    state.incompleteBuffer = null;
  }
  try {
    return scannedEnd ? _stream.unpackFragmented(state.unpackr, source, scannedEnd, state.incompleteScanner.extensions) : state.unpackr.unpackMultiple(source);
  } catch (error) {
    if (!error.incomplete) throw error;
    if (scannedEnd && error.lastPosition === 0) {
      error.incomplete = false; // the scan found all of the value
      throw error;
    }
    try {
      holdRemainder(state, source.subarray(error.lastPosition), source === chunk, error.missingBytes);
    } catch (holdError) {
      holdError.values = error.values;
      throw holdError;
    }
    return error.values || [];
  }
}

/**
 * Prepares an unpackr for a stream: record definitions in one chunk apply to the values in later ones, as they
 * do between values in one buffer.
 */
export function streamUnpackr (unpackr) {
  if (!unpackr.structures) unpackr.structures = [];
  return unpackr;
}

function holdRemainder (state, remainder, borrowed, missingBytes) {
  if (remainder.length > state.maxIncompleteBufferSize) throw new Error('Maximum incomplete buffer size exceeded');
  // copy what the caller passed in, so it can reuse its buffer
  state.incompleteBuffer = borrowed ? Buffer.from(remainder) : remainder;
  state.incompleteLength = remainder.length;
  state.incompleteNeeded = remainder.length + (missingBytes || 1); // with no hint, any byte may complete it
  const unpackr = state.unpackr;
  if (unpackr._readStruct && remainder[0] >= 0x20 && remainder[0] < 0x40) {
    // a struct extends to the end of the source, so it is unpacked again as each chunk arrives
    state.incompleteScanner = null;
  } else {
    if (!state.incompleteScanner) state.incompleteScanner = new StructureScanner(unpackr);
    state.incompleteScanner.reset();
  }
}

function holdIncomplete (state, chunk, length) {
  let buffer = state.incompleteBuffer;
  if (length > buffer.length) {
    // grow geometrically, so a value arriving in many small chunks is copied a bounded number of times
    const grown = Buffer.allocUnsafe(Math.max(length, Math.min(buffer.length * 2, state.maxIncompleteBufferSize)));
    // unpacked binaries are views of this buffer, so the bytes after the data are cleared
    grown.fill(0, length);
    buffer.copy(grown, 0, 0, state.incompleteLength);
    buffer = state.incompleteBuffer = grown;
  }
  buffer.set(chunk, state.incompleteLength);
  state.incompleteLength = length;
}

function endOfInput () {
  const error = new Error('Unexpected end of MessagePack data');
  error.incomplete = true;
  return error;
}

export const decodeIter = unpackIter;
export const encodeIter = packIter;