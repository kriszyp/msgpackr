#include <vector>
#include <algorithm>
#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <nan.h>
using namespace v8;

uint8_t* source;
int position = 0;
int writeEndPosition = 0;
v8::Local<v8::Value>* target = new v8::Local<v8::Value>[1000];
Nan::Callback arrayMaker;
NAN_METHOD(setupHandlers) {
	//arrayMaker.Reset(v8::Local<v8::Function>::Cast(info[0]));
}
NAN_METHOD(setSource) {
	int length = node::Buffer::Length(info[0]);
	position = 0;
	source = (uint8_t*) node::Buffer::Data(info[0]);
}

void readNext(int length, int targetIndex) {
	int writePosition = writeEndPosition;
	writeEndPosition += length;
	target[writeEndPosition] = Nan::New<v8::Number>(writeEndPosition - targetIndex);
	writeEndPosition++;
	uint8_t token;
	for (int i = 0; i < length; i++) {
		token = source[position++];
		if (token < 0xa0) {
			if (token < 0x80) {
				if (token < 0x40)
					target[writePosition++] = Nan::New<v8::Number>(token);
				else {/*
					let structure = currentStructures[token & 0x3f];
					if (structure) {
						if (!structure.read) {
							structure.read = createStructureReader(structure)
						}
						return structure.read()
					} else
						return token*/
				}
			} else if (token < 0x90) {
				// map
				/*
				token -= 0x80
				let map = new Map()
				for (let i = 0; i < token; i++) {
					map.set(read(), read())
				}
				return map*/
			} else {
				token -= 0x90;
				target[writePosition] = Nan::New<v8::Number>(token);
				readNext(token, writePosition);
				writePosition++;
			}
		} else if (token < 0xc4) {
			if (token < 0xc0){
				token -= 0xa0;
				target[writePosition++] = Nan::New<v8::String>((char*) source + position, (int) token).ToLocalChecked();
				position += token;
			}
			else if (token < 0xc2)
				target[writePosition++] = token == 0xc0 ? Nan::Null() : Nan::Undefined();
			else
				target[writePosition++] = Nan::New<Boolean>(token == 0xc3); // boolean
		} else if (token > 0) {
			/*if (!parseTable[token])
				return 'error token ' + token
			return parseTable[token](token)*/
		} else
			fprintf(stderr, "Unexpected end of MessagePack\n");
	}
}

NAN_METHOD(readNextExport) {
	writeEndPosition = 0;
	position = 0;
	readNext(1, 0);
	Isolate *isolate = Isolate::GetCurrent();
	info.GetReturnValue().Set(Array::New(isolate, target, writeEndPosition));
}


void initializeModule(v8::Local<v8::Object> exports) {
	Nan::SetMethod(exports, "setupHandlers", setupHandlers);
	Nan::SetMethod(exports, "setSource", setSource);
	Nan::SetMethod(exports, "readNext", readNextExport);
}

NODE_MODULE(addon, initializeModule);
