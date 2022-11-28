import { pack, unpack, isNativeAccelerationEnabled } from 'npm:msgpackr';
import chai from "https://cdn.skypack.dev/chai@4.3.4?dts";
import sampleData from './example4.json' assert { type: 'json'};
const { assert, should: loadShould } = chai;
let should = loadShould();
console.log({isNativeAccelerationEnabled})
var data = sampleData
let structures = []
var serialized = pack(data)
var deserialized = unpack(serialized)
sampleData.should.deep.equal(deserialized);
var serialized = new Uint8Array(pack(data));
var deserialized = unpack(serialized)
sampleData.should.deep.equal(deserialized);
console.log('done')
