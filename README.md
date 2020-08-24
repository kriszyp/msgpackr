# msgpackr

The msgpackr package is an extremely fast MessagePack NodeJS/JavaScript implementation. At the time of writing, it is significantly faster than any other known implementations, faster than Avro (for JS), and generally faster than native JSON.stringify/parse. It also includes an optional record extension (the `r` in msgpackr), for defining record structures that makes MessagePack even faster and more compact, often over twice as fast as even native JSON functions and several times faster than other JS implementations.

## Basic Usage

Install with:

```
npm install msgpackr
```
And import or require it for basic serialization/encoding (`pack`) and deserialization/decoding (`unpack`) functions:
```
import { unpack, pack } from 'msgpackr';
let serializedAsBuffer = pack(value);
let data = unpack(serializedAsBuffer);
```
This `pack` function will generate standard MessagePack without any extensions that should be compatible with any standard MessagePack parser/decoder. It will serialize JavaScript objects as MessagePack `map`s by default. The `unpack` function will deserialize MessagePack `map`s as an `Object` with the properties from the map.

## Node Usage
The msgpackr package is optimized for NodeJS usage (and will use a node addon for performance boost as an optional dependency).

### Streams
We can use the including streaming functionality (which further improves performance). The `PackrStream` is a NodeJS transform stream that can be used to serialize objects to a binary stream (writing to network/socket, IPC, etc.), and the `UnpackrStream` can be used to deserialize objects from a binary sream (reading from network/socket, etc.):

```
import { PackrStream } from 'msgpackr';
let stream = PackrStream();
stream.write(myData);

```
Or for a full example of sending and receiving data on a stream:
```
import { PackrStream } from 'msgpackr';
let sendingStream = PackrStream();
let receivingStream = UnpackrStream();
// we just piping to our own stream, but normally you would send and
// receive over some type of inter-process or network connection.
sendingStream.pipe(receivingStream);
sendingStream.write(myData);
receivingStream.on('data', (data) => {
	// received data
});
```
 The `PackrStream` and `UnpackrStream` instances  will have also the record structure extension enabled by default (see below).

## Browser Usage
Msgpackr works as standalone JavaScript as well, and runs on modern browsers. It includes a bundled script for ease of direct loading. For module-based development, it is recommended that you directly import the module of interest, to minimize dependencies that get pulled into your application:
```
import { unpack } from 'msgpackr/unpack' // if you only need to unpack
```
(It is worth noting that while msgpackr works well in browsers, the MessagePack format itself is usually not an ideal format for web use. If you want compact data, brotli or gzip are most effective in compressing, and MessagePack's character frequency tends to defeat Huffman encoding used by these standard compression algorithms, resulting in less compact data than compressed JSON. The modern browser architecture is heavily optimized for parsing JSON from HTTP traffic, and it is difficult to achieve the same level of overall efficiency and ease with MessagePack.)

## Record / Object Structures
There is a critical difference between maps (or dictionaries) that hold an arbitrary set of keys and values (JavaScript `Map` is designed for these), and records or object structures that have a well-defined set of fields which may have many instances using that same structure (most objects in JS). By using the record extension, this distinction is preserved in MessagePack and the encoding can reuse structures and not only provides better type preservation, but yield much more compact encodings and increase parsing/deserialization performance by 2-3x. Msgpackr automatically generates record definitions that are reused and referenced by objects with the same structure. There are a number of ways to use this to our advantage. For large object structures with repeating nested objects with similar structures, simply serializing with the record extension can yield benefits. To use the record structures extension, we create a new `Packr` instance. By default a new `Packr` instance will have the record extension enabled:
```
import { Packr } from 'msgpackr';
let packr = Packr();
packr.pack(myBigData);

```

Another way to further leverage the benefits of the msgpackr record structures is to use streams that naturally allow for data to reuse based on previous record structures. The stream classes have the record structure extension enabled by default and provide excellent out-of-the-box performance.

When creating a new `Packr`, `PackrStream`, or `UnpackrStream` instance, we can enable or disable the record structure extension with the `objectsAsMaps` property. When this is `true`, the record structure extension will be disabled, and all objects will revert to being serialized using MessageMap `map`s, and all `map`s will be deserialized to JS `Object`s as properties (like the standalone `pack` and `unpack` functions).

### Shared Record Structures
Another useful way of using msgpackr, and the record extension, is for storing data in a databases, files, or other storage systems. If a number of objects with common data structures are being stored, a shared structure can be used to greatly improve data storage and deserialization efficiency. We just need to provide a way to store the generated shared structure so it is available to deserialize stored data in the future:

```
import { Packr } from 'msgpackr';
let packr = Packr({
	getStructures() {
		// storing our data in file (but we could also store in a db or key-value store)
		return unpack(readFileSync('my-shared-structures.mp')) || [];
	},
	saveStructures(structures) {
		writeFileSync('my-shared-structures.mp', pack(structures))
	},
	structures: []
});

```

## Performance
Msgpackr is fast. Really fast. Here is comparison with the next fastest JS projects using the benchmark tool from `msgpack-lite` (and the sample data is from some clinical research data we use that has a good mix of different value types and structures). It also includes comparison to V8 native JSON functionality, and JavaScript Avro (`avsc`, a very optimized Avro implementation):

operation                                                  |   op   |   ms  |  op/s
---------------------------------------------------------- | ------: | ----: | -----:
buf = Buffer(JSON.stringify(obj));                         |   82000 |  5004 |  16386
obj = JSON.parse(buf);                                     |   88600 |  5000 |  17720
require("msgpackr").pack(obj);                             |  161500 |  5002 |  32287
require("msgpackr").unpack(buf);                           |   94600 |  5004 |  18904
msgpackr w/ shared structures: packr.pack(obj);            |  178400 |  5002 |  35665
msgpackr w/ shared structures: packr.unpack(buf);          |  376700 |  5000 |  75340
buf = require("msgpack-lite").encode(obj);                 |   30100 |  5012 |   6005
obj = require("msgpack-lite").decode(buf);                 |   16200 |  5001 |   3239
buf = require("notepack").encode(obj);                     |   62600 |  5005 |  12507
obj = require("notepack").decode(buf);                     |   32400 |  5007 |   6470
require("what-the-pack")... encoder.encode(obj);           |   63500 |  5002 |  12694
require("what-the-pack")... encoder.decode(buf);           |   32000 |  5001 |   6398
require("avsc")...make schema/type...type.toBuffer(obj);   |   84600 |  5003 |  16909
require("avsc")...make schema/type...type.toBuffer(obj);   |   99300 |  5001 |  19856

All benchmarks were performed on Node 14.8.0 (Windows i7-4770 3.4Ghz).
(`avsc` is schema-based and more comparable in style to msgpackr with shared structures).

Here is a benchmark of streaming data (again borrowed from `msgpack-lite`'s benchmarking), where msgpackr is able to take advantage of the structured record extension and really demonstrate its performance capabilities:

operation (1000000 x 2)                          |   op    |  ms   |  op/s
------------------------------------------------ | ------: | ----: | -----:
new PackrStream().write(obj);                    | 1000000 |   372 | 2688172
new UnpackrStream().write(buf);                  | 1000000 |   247 | 4048582
stream.write(msgpack.encode(obj));               | 1000000 |  2898 | 345065
stream.write(msgpack.decode(buf));               | 1000000 |  1969 | 507872
stream.write(notepack.encode(obj));              | 1000000 |   901 | 1109877
stream.write(notepack.decode(buf));              | 1000000 |  1012 | 988142
msgpack.Encoder().on("data",ondata).encode(obj); | 1000000 |  1763 | 567214
msgpack.createDecodeStream().write(buf);         | 1000000 |  2222 | 450045
msgpack.createEncodeStream().write(obj);         | 1000000 |  1577 | 634115
msgpack.Decoder().on("data",ondata).decode(buf); | 1000000 |  2246 | 445235

See the benchmark.md for more benchmarks and information about benchmarking.

### Additional Performance Optimizations
Msgpackr is already fast, but here are some tips for making it faster. Msgpackr is designed to work well with reusable buffers. Allocating new buffers can be relatively expensive, so if you have Node addons, it can be much faster to reuse buffers and use memcpy to copy data into existing buffers. Then msgpackr `unpack` can be executed on the same buffer, with new data.

#### Arena Allocation (`resetMemory()`)
During the serialization process, data is written to buffers. Allocating new buffers is a relatively expensive process, and the `resetMemory` method can help allow reuse of buffers that will further improve performance. The `resetMemory` method can be called when previously created buffer(s) are no longer needed. For example, if we serialized an object, and wrote it to a database, we could indicate that we are done:
```
let buffer = packr.pack(data);
writeToStorageSync(buffer);
// finished with buffer, we can reset the memory on our packr now:
packr.resetMemory()
// future serialization can now reuse memory for better performance
```
The use of `resetMemory` is never required, buffers will still be handled and cleaned up through GC if not used, it just provides a small performance boost.

## Record Structure Extension Definition
The record struction extension uses extension id 0x72 ("r") to declare the use of this functionality. The extension "data" byte (or bytes) identifies the byte or bytes used to identify the start of a record in the subsequent MessagePack block or stream. The identifier byte (or the first byte in a sequence) must be from 0x40 - 0x7f (and therefore replaces one byte representations of positive integers 64 - 127, which can alternately be represented with int or uint types). The extension declaration must be immediately follow by an MessagePack array that defines the field names of the record structure.

Once a record identifier and record field names have been defined, the parser/decoder should proceed to read the next value. Any subsequent use of the record identifier as a value in the block or stream should parsed as a record instance, and the next n values, where is n is the number of fields (as defined in the array of field names), should be read as the values of the fields. For example, here we have defined a structure with fields "foo" and "bar", with the record identifier 0x40, and then read a record instance that defines the field values of 4 and 2, respectively:
```
+--------+--------+--------+~~~~~~~~~~~~~~~~~~~~~~~~~+--------+--------+--------+
|  0xd4  |  0x72  |  0x40  | array: [ "foo", "bar" ] |  0x40  |  0x04  |  0x02  |
+--------+--------+--------+~~~~~~~~~~~~~~~~~~~~~~~~~+--------+--------+--------+
```
Which should generate an object that would correspond to JSON:
```
{ "name" : 4, "bar": 2}
```

## Additional value types
msgpackr supports `undefined` (using fixext1 + type: 0 + data: 0 to match other JS implementations), `NaN`, `Infinity`, and `-Infinity` (using standard IEEE 754 representations with doubles/floats).

## License

MIT

### Credits

Various projects have been inspirations for this, and code has been borrowed from https://github.com/msgpack/msgpack-javascript and https://github.com/mtth/avsc.