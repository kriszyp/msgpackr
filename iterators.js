import { Packr } from './pack.js';
import { Unpackr } from './unpack.js';

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
    unpackr: new Unpackr(options),
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
  if (state.incompleteBuffer) {
    const length = state.incompleteLength + chunk.length;
    if (length < state.incompleteNeeded) {
      // the value is known to need more bytes than this, so unpacking again could not succeed yet
      if (length > state.maxIncompleteBufferSize) {
        state.incompleteBuffer = null;
        throw new Error('Maximum incomplete buffer size exceeded');
      }
      holdIncomplete(state, chunk, length);
      return [];
    }
    source = Buffer.concat([state.incompleteBuffer.subarray(0, state.incompleteLength), chunk], length);
    state.incompleteBuffer = null;
  }
  try {
    return state.unpackr.unpackMultiple(source);
  } catch (error) {
    if (!error.incomplete) throw error;
    const remainder = source.subarray(error.lastPosition);
    if (remainder.length > state.maxIncompleteBufferSize) {
      const fatalError = new Error('Maximum incomplete buffer size exceeded');
      fatalError.values = error.values;
      throw fatalError;
    }
    // copy what was passed in, so the caller can reuse its buffer
    state.incompleteBuffer = source === chunk ? Buffer.from(remainder) : remainder;
    state.incompleteLength = remainder.length;
    state.incompleteNeeded = remainder.length + (error.missingBytes || 1); // with no hint, any byte may complete it
    return error.values || [];
  }
}

function holdIncomplete (state, chunk, length) {
  let buffer = state.incompleteBuffer;
  if (length > buffer.length) {
    // grow geometrically, so a value arriving in many small chunks is copied a bounded number of times
    const grown = Buffer.allocUnsafe(Math.min(Math.max(length, buffer.length * 2), state.incompleteNeeded, state.maxIncompleteBufferSize));
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