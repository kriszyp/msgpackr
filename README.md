msgpackr is an insanely fast MessagePack implementation. It also comes an extension for defining record structures that further improves performance and compactness of serialized data.

operation                                                  |   op   |   ms  |  op/s
---------------------------------------------------------- | ------: | ----: | -----:
buf = Buffer(JSON.stringify(obj));                         | 1215400 |  5000 | 243080
obj = JSON.parse(buf);                                     | 1290100 |  5000 | 258019
msgpackr {objectsAsMaps: true}: serializer.serialize(obj); | 2936100 |  5000 | 587220
msgpackr {objectsAsMaps: true}: serializer.parse(buf);     | 1729800 |  5000 | 345960
msgpackr w/ shared structures: serializer.serialize(obj);  | 3393200 |  5000 | 678640
msgpackr w/ shared structures: serializer.parse(buf);      | 4491900 |  5000 | 898380
buf = require("msgpack-lite").encode(obj);                 |  430300 |  5000 |  86060
obj = require("msgpack-lite").decode(buf);                 |  268300 |  5001 |  53649
buf = require("notepack").encode(obj);                     | 1113200 |  5000 | 222640
obj = require("notepack").decode(buf);                     |  543800 |  5000 | 108760
require("what-the-pack")... encoder.encode(obj);           | 1019800 |  5000 | 203960
require("what-the-pack")... encoder.decode(buf);           |  535200 |  5000 | 107040