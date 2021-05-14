# cbor-x
[![license](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE)
[![npm version](https://img.shields.io/npm/v/cbor-x.svg?style=flat-square)](https://www.npmjs.org/package/cbor-x)
[![encode](https://img.shields.io/badge/encode-1.5GB%2Fs-yellow)](benchmark.md)
[![decode](https://img.shields.io/badge/decode-2GB%2Fs-yellow)](benchmark.md)
[![types](https://img.shields.io/npm/types/cbor-x)](README.md)
[![module](https://img.shields.io/badge/module-ESM%2FCJS-blue)](README.md)

The cbor-x package is an extremely fast CBOR NodeJS/JavaScript implementation. Currently, it is significantly faster than any other known implementations, faster than Avro (for JS), and generally faster than native V8 JSON.stringify/parse. It implements the CBOR format as specificed in [RFC-8949](https://www.rfc-editor.org/rfc/rfc8949.html), numerous [registered IANA tag extensions](https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml) (the `x` in cbor-x), [RFC-8746](https://tools.ietf.org/html/rfc8746) and proposed optional record extension, for defining record structures that makes CBOR even faster and more compact, often over twice as fast as even native JSON functions, several times faster than other JS implementations, and 15-50% more compact. See the performance section for more details. Structured cloning (with support for cyclical references) is supported through these tag extensions.

## Basic Usage

Install with:

```
npm i cbor-x
```
And `import` or `require` it for basic standard serialization/encoding (`encode`) and deserialization/decoding (`decode`) functions:
```
import { decode, encode } from 'cbor-x';
let serializedAsBuffer = encode(value);
let data = decode(serializedAsBuffer);
```
This `encode` function will generate standard CBOR without any extensions that should be compatible with any standard CBOR parser/decoder. It will serialize JavaScript objects as CBOR `map`s by default. The `decode` function will deserialize CBOR `map`s as an `Object` with the properties from the map.

## Node Usage
The cbor-x package runs on any modern JS platform, but is optimized for NodeJS usage (and will use a node addon for performance boost as an optional dependency).

### Streams
We can use the including streaming functionality (which further improves performance). The `EncoderStream` is a NodeJS transform stream that can be used to serialize objects to a binary stream (writing to network/socket, IPC, etc.), and the `DecoderStream` can be used to deserialize objects from a binary sream (reading from network/socket, etc.):

```
import { EncoderStream } from 'cbor-x';
let stream = new EncoderStream();
stream.write(myData);

```
Or for a full example of sending and receiving data on a stream:
```
import { EncoderStream } from 'cbor-x';
let sendingStream = new EncoderStream();
let receivingStream = new DecoderStream();
// we are just piping to our own stream, but normally you would send and
// receive over some type of inter-process or network connection.
sendingStream.pipe(receivingStream);
sendingStream.write(myData);
receivingStream.on('data', (data) => {
	// received data
});
```
 The `EncoderStream` and `DecoderStream` instances  will have also the record structure extension enabled by default (see below).

## Deno Usage
Msgpackr modules are standard ESM modules and can be loaded directly from github (https://raw.githubusercontent.com/kriszyp/msgpackr/master/index.js) or downloaded and used directly in Deno. The standard pack/encode and unpack/decode functionality is available on Deno, like other platforms.

## Browser Usage
Cbor-x  works as standalone JavaScript as well, and runs on modern browsers. It includes a bundled script, at `dist/index.js` for ease of direct loading:
```
<script src="node_modules/cbor-x/dist/index.js"></script>
```

This is UMD based, and will register as a module if possible, or create a `CBOR` global with all the exported functions.

For module-based development, it is recommended that you directly import the module of interest, to minimize dependencies that get pulled into your application:
```
import { decode } from 'cbor-x/decode' // if you only need to decode
```

## Structured Cloning
You can also use cbor-x for [structured cloning](https://html.spec.whatwg.org/multipage/structured-data.html). By enabling the `structuredClone` option, you can include references to other objects or cyclic references, and object identity will be preserved. Structured cloning also enables preserving certain typed objects like `Error`, `Set`, `RegExp` and TypedArray instances, using [registered CBOR tag extensions](https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml). For example:
```
let obj = {
	set: new Set(['a', 'b']),
	regular: /a\spattern/
};
obj.self = obj;
let encoder = new Encoder({ structuredClone: true });
let serialized = encoder.encode(obj);
let copy = encoder.decode(serialized);
copy.self === copy // true
copy.set.has('a') // true

```

This option is disabled by default because it uses extensions and reference checking degrades performance (by about 25-30%). (Note this implementation doesn't serialize every class/type specified in the HTML specification since not all of them make sense for storing across platforms.)

## Record / Object Structures
There is a critical difference between maps (or dictionaries) that hold an arbitrary set of keys and values (JavaScript `Map` is designed for these), and records or object structures that have a well-defined set of fields. Typical JS objects/records may have many instances re(use) the same structure. By using the record extension, this distinction is preserved in CBOR and the encoding can reuse structures and not only provides better type preservation, but yield much more compact encodings and increase decoding performance by 2-3x. cbor-x automatically generates record definitions that are reused and referenced by objects with the same structure. Records use CBOR's tags to align well CBOR's tag/extension mechanism. There are a number of ways to use this to our advantage. For large object structures with repeating nested objects with similar structures, simply serializing with the record extension can yield significant benefits. To use the record structures extension, we create a new `Encoder` instance. By default a new `Encoder` instance will have the record extension enabled:
```
import { Encoder } from 'cbor-x';
let encoder = new Encoder();
encoder.encode(myBigData);
```

Another way to further leverage the benefits of the cbor-x record structures is to use streams that naturally allow for data to reuse based on previous record structures. The stream classes have the record structure extension enabled by default and provide excellent out-of-the-box performance.

When creating a new `Encoder`, `EncoderStream`, or `DecoderStream` instance, we can enable or disable the record structure extension with the `objectsAsMaps` property. When this is `true`, the record structure extension will be disabled, and all objects will revert to being serialized using MessageMap `map`s, and all `map`s will be deserialized to JS `Object`s as properties (like the standalone `encode` and `decode` functions).

### Shared Record Structures
Another useful way of using cbor-x, and the record extension, is for storing data in a databases, files, or other storage systems. If a number of objects with common data structures are being stored, a shared structure can be used to greatly improve data storage and deserialization efficiency. In the simplest form, provide a `structures` array, which is updated if any new object structure is encountered:

```
import { Encoder } from 'cbor-x';
let encoder = new Encoder({
	structures: [... structures that were last generated ...]
});
```
If you are working with persisted data, you will need to persist the `structures` data when it is updated. Cbor-x provides an API for loading and saving the `structures` on demand (which is robust and can be used in multiple-process situations where other processes may be updating this same `structures` array), we just need to provide a way to store the generated shared structure so it is available to deserialize stored data in the future:
```
import { Encoder } from 'cbor-x';
let encoder = new Encoder({
	getStructures() {
		// storing our data in file (but we could also store in a db or key-value store)
		return decode(readFileSync('my-shared-structures.cbor')) || [];
	},
	saveStructures(structures) {
		writeFileSync('my-shared-structures.cbor', encode(structures))
	},
	structures: []
});
```
Cbor-x will automatically add and saves structures as it encounters any new object structures (up to a limit of 32). It will always add structures in incremental/compatible way: Any object encoded with an earlier structure can be decoded with a later version (as long as it is persisted).

### Reading Multiple Values
If you have a buffer with multiple values sequentially encoded, you can choose to parse and read multiple values. This can be done using the `unpackMultiple` function/method, which can return an array of all the values it can sequentially parse within the provided buffer. For example:
```js
let data = new Uint8Array([1, 2, 3]) // encodings of values 1, 2, and 3
let values = unpackMultiple(data) // [1, 2, 3]
```
Alternately, you can provide a callback function that is called as the parsing occurs with each value, and can optionally terminate the parsing by returning `false`:
```js
let data = new Uint8Array([1, 2, 3]) // encodings of values 1, 2, and 3
unpackMultiple(data, (value) => {
	// called for each value
	// return false if you wish to end the parsing
})
```

## Options
The following options properties can be provided to the Encoder or Decoder constructor:

* `useRecords` - Setting this to `false` disables the record extension and stores JavaScript objects as CBOR maps, and decodes maps as JavaScript `Object`s, which ensures compatibilty with other decoders.
* `structures` - Provides the array of structures that is to be used for record extension, if you want the structures saved and used again. This array will be modified in place with new record structures that are serialized (if less than 32 structures are in the array).
* `structuredClone` - This enables the structured cloning extensions that will encode object/cyclic references and additional built-in types/classes.
* `mapsAsObjects` - If `true`, this will decode CBOR maps and JS `Object`s with the map entries decoded to object properties. If `false`, maps are decoded as JavaScript `Map`s. This is disabled by default if `useRecords` is enabled (which allows `Map`s to be preserved), and is enabled by default if `useRecords` is disabled.
* `useFloat32` - This will enable cbor-x to encode non-integer numbers as `float32`. See next section for possible values.
* `variableMapSize` - This will use varying map size definition (fixmap, map16, map32) based on the number of keys when encoding objects, which yields slightly more compact encodings (for small objects), but is typically 5-10% slower during encoding. This is only relevant when record extension is disabled.
* `copyBuffers` - When decoding a CBOR with binary data (Buffers are encoded as binary data), copy the buffer rather than providing a slice/view of the buffer. If you want your input data to be collected or modified while the decoded embedded buffer continues to live on, you can use this option (there is extra overhead to copying).
* `useTimestamp32` - Encode JS `Date`s in 32-bit format when possible by dropping the milliseconds. This is a more efficient encoding of dates. You can also cause dates to use 32-bit format by manually setting the milliseconds to zero (`date.setMilliseconds(0)`).
* `largeBigIntToFloat` - If a bigint needs to be encoded that is larger than will fit in 64-bit integers, it will be encoded as a float-64 (otherwise will throw a RangeError).

### 32-bit Float Options
By default all non-integer numbers are serialized as 64-bit float (double). This is fast, and ensures maximum precision. However, often real-world data doesn't not need 64-bits of precision, and using 32-bit encoding can be much more space efficient. There are several options that provide more efficient encodings. Using the decimal rounding options for encoding and decoding provides lossless storage of common decimal representations like 7.99, in more efficient 32-bit format (rather than 64-bit). The `useFloat32` property has several possible options, available from the module as constants:
```
import { ALWAYS, DECIMAL_ROUND, DECIMAL_FIT } from 'cbor-x'
```

* `ALWAYS` (1) - Always will encode non-integers (absolute less than 2147483648) as 32-bit float.
* `DECIMAL_ROUND` (3) - Always will encode non-integers as 32-bit float, and when decoding 32-bit float, round to the significant decimal digits (usually 7, but 6 or 8 digits for some ranges).
* `DECIMAL_FIT` (4) - Only encode non-integers as 32-bit float if all significant digits (usually up to 7) can be unamiguously encoded as a 32-bit float, and decode with decimal rounding (same as above). This will ensure round-trip encoding/decoding without loss in precision and use 32-bit when possible.

Note, that the performance is decreased with decimal rounding by about 20-25%, although if only 5% of your values are floating point, that will only have about a 1% impact overall.

## Performance
Cbor-x is fast. Really fast. Here is comparison with the next fastest JS projects using the benchmark tool from `msgpack-lite` (and the sample data is from some clinical research data we use that has a good mix of different value types and structures). It also includes comparison to V8 native JSON functionality, and JavaScript Avro (`avsc`, a very optimized Avro implementation):

operation                                                  |   op   |   ms  |  op/s
---------------------------------------------------------- | ------: | ----: | -----:
buf = Buffer(JSON.stringify(obj));                         |   78200 |  5004 |  15627
obj = JSON.parse(buf);                                     |   89600 |  5003 |  17909
require("cbor-x").encode(obj);                             |  163100 |  5001 |  32613
require("cbor-x").decode(buf);                             |  100200 |  5004 |  20023
cbor-x w/ shared structures: packr.encode(obj);            |  178300 |  5002 |  35645
cbor-x w/ shared structures: packr.decode(buf);            |  414000 |  5000 |  82800
buf = require("cbor").encode(obj);                         |    7800 |  5016 |   1555
obj = require("cbor").decode(buf);                         |    3200 |  5087 |    629
buf = require("cbor-sync").encode(obj);                    |   18600 |  5012 |   3711
obj = require("cbor-sync").decode(buf);                    |   20000 |  5020 |   3984
buf = require("msgpack-lite").encode(obj);                 |   30900 |  5013 |   6163
obj = require("msgpack-lite").decode(buf);                 |   15800 |  5012 |   3152
buf = require("notepack").encode(obj);                     |   62600 |  5006 |  12504
obj = require("notepack").decode(buf);                     |   33700 |  5007 |   6730
require("avsc")...make schema/type...type.toBuffer(obj);   |   86900 |  5002 |  17373
require("avsc")...make schema/type...type.fromBuffer(obj); |  106100 |  5000 |  21220

All benchmarks were performed on Node 14.8.0 (Windows i7-4770 3.4Ghz).
(`avsc` is schema-based and more comparable in style to cbor-x with shared structures).

Here is a benchmark of streaming data (again borrowed from `msgpack-lite`'s benchmarking), where cbor-x is able to take advantage of the structured record extension and really demonstrate its performance capabilities:

operation (1000000 x 2)                          |   op    |  ms   |  op/s
------------------------------------------------ | ------: | ----: | -----:
new EncoderStream().write(obj);                    | 1000000 |   372 | 2688172
new DecoderStream().write(buf);                  | 1000000 |   247 | 4048582
stream.write(msgpack.encode(obj));               | 1000000 |  2898 | 345065
stream.write(msgpack.decode(buf));               | 1000000 |  1969 | 507872
stream.write(notepack.encode(obj));              | 1000000 |   901 | 1109877
stream.write(notepack.decode(buf));              | 1000000 |  1012 | 988142
msgpack.Encoder().on("data",ondata).encode(obj); | 1000000 |  1763 | 567214
msgpack.createDecodeStream().write(buf);         | 1000000 |  2222 | 450045
msgpack.createEncodeStream().write(obj);         | 1000000 |  1577 | 634115
msgpack.Decoder().on("data",ondata).decode(buf); | 1000000 |  2246 | 445235

See the [benchmark.md](benchmark.md) for more benchmarks and information about benchmarking.

## Custom Extensions
You can add your own custom extensions, which can be used to encode specific types/classes in certain ways. This is done by using the `addExtension` function, and specifying the class, extension type code (custom extensions should be a number greater than 40500, all others are reserved for  CBOR or cbor-x), and your encode and decode functions (or just the one you need). You can use cbor-x encoding and decoding within your extensions:
```
import { addExtension, Encoder } from 'cbor-x';

class MyCustomClass {...}

let extEncoder = new Encoder();
addExtension({
	Class: MyCustomClass,
	tag: 43311, // register our own extension code (a tag code)
	encode(instance, encode) {
		// define how your custom class should be encoded
		encode(instance.myData); // return a buffer
	}
	decode(data) {
		// define how your custom class should be decoded
		let instance = new MyCustomClass();
		instance.myData = data
		return instance; // decoded value from buffer
	}
});
```
If you want to use msgpackr to encode and decode the data within your extensions, you can use the `read` and `write` functions and read and write data/objects that will be encoded and decoded by msgpackr, which can be easier and faster than creating and receiving separate buffers (note that you can't just return the instance from `write` or msgpackr will recursively try to use extension infinitely):
```js
import { addExtension, Packr } from 'msgpackr';

class MyCustomClass {...}

let extPackr = new Packr();
addExtension({
	Class: MyCustomClass,
	type: 11, // register your own extension code (a type code from 1-100)
	write(instance) {
		// define how your custom class should be encoded
		return instance.myData; // return some data to be encoded
	}
	read(data) {
		// define how your custom class should be decoded,
		// data will already be unpacked/decoded
		let instance = new MyCustomClass();
		instance.myData = data;
		return instance; // return decoded value
	}
});
```

## Unknown Tags
If no extension is registered for a tag, the decoder will return an instance of the `Tag` class, where the value provided for the tag will be available in the `value` property of the `Tag` instance. The `Tag` class is an export of the package and decode module.

### CBOR Compliance
The cbor-x package is designed to encode and decode to the CBOR extended generic data model, implementing extensions to support the extended model, and will generally attempt to use preferred serializations where feasible. When duplicate keys are encountered in maps, previous entries will be lost, and the final entry is preserved.

### Additional Performance Optimizations
Cbor-x is already fast, but here are some tips for making it faster.

#### Arena Allocation (`useBuffer()`)
During the serialization process, data is written to buffers. Again, allocating new buffers is a relatively expensive process, and the `useBuffer` method can help allow reuse of buffers that will further improve performance. With `useBuffer` method, you can provide a buffer, serialize data into it, and when it is known that you are done using that buffer, you can call `useBuffer` again to reuse it. The use of `useBuffer` is never required, buffers will still be handled and cleaned up through GC if not used, it just provides a small performance boost.

## Extensions
Cbor-x currently uses tag ids 40000 to 40500 for its proposed extensions (until accepted).

## Record Structure Extension Definition
The record struction extension uses tag 40006 to declare a new record structure. This is followed by an array where the first element indicates the tag id of the record structure to declare and the next element is an array of the field names, and the third element is array of the property values. The extension declaration must be immediately follow by the field names of the record structure.

### Dates
cbor-x saves all JavaScript `Date`s using the standard CBOR date extension (tag 1).

### Structured Cloning
With structured cloning enabled, cbor-x will also use tags/extensions to store Set, Map, Error, RegExp, ArrayBufferView objects and preserve their types.

## Alternate Encoding/Package
The high-performance serialization and deserialization algorithms in this package are also available in the [msgpackr](https://github.com/kriszyp/msgpackr) for the MessagePack format, with the same API and design. A quick summary of the pros and cons of using MessagePack vs CBOR are:
* MessagePack has wider adoption, and, at least with this implementation is slightly more efficient (by roughly 2-4%).
* CBOR has an [official IETF standardization track](https://www.rfc-editor.org/rfc/rfc8949.html), and the record extensions is conceptually/philosophically a better fit for CBOR tags.

## License

MIT

### Browser Consideration
CBOR can be a great choice for high-performance data delivery to browsers, as reasonable data size is possible without compression. And msgpackr works very well in modern browsers. However, it is worth noting that if you want highly compact data, brotli or gzip are most effective in compressing, and CBOR's character frequency tends to defeat Huffman encoding used by these standard compression algorithms, resulting in less compact data than compressed JSON.

### Credits

Various projects have been inspirations for this, and code has been borrowed from https://github.com/msgpack/msgpack-javascript and https://github.com/mtth/avsc.
