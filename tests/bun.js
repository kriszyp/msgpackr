import { unpack, pack } from '../node-index.js';
import { readFileSync } from 'fs';
let sampleData = JSON.parse(readFileSync(new URL(`./example4.json`, import.meta.url)));

var data = sampleData
let structures = []
var serialized = pack(data)
var deserialized = unpack(serialized)
console.log(deserialized)
var serialized = pack(data)
var deserialized = unpack(serialized)
console.log(deserialized)
