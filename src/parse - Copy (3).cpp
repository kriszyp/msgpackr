#include <vector>
#include <algorithm>
#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <nan.h>
using namespace v8;

uint8_t* source;
int position = 0;
Persistent<Function> objectMaker;
Isolate *isolate = Isolate::GetCurrent();


NAN_METHOD(setupHandlers) {
	objectMaker.Reset(isolate, v8::Local<v8::Function>::Cast(info[0]));
}
NAN_METHOD(setSource) {
	int length = node::Buffer::Length(info[0]);
	position = 0;
	source = (uint8_t*) node::Buffer::Data(info[0]);
}

Local<Value> readNext() {
	uint8_t token = source[position++];
	if (token < 0xa0) {
		if (token < 0x80) {
			if (token < 0x40)
				return Nan::New<v8::Number>(token);
			else {
				Local<Context> context = Nan::GetCurrentContext();
				token -= 0x40;
				v8::Local<v8::Value>* args = new v8::Local<v8::Value>[3];
				for (int i = 0; i < 3; i++) {
					args[i] = readNext();
				}
				Isolate *isolate = Isolate::GetCurrent();
				return objectMaker.Get(isolate)->Call(context, Nan::Null(), 3, args).ToLocalChecked();
				/*let structure = currentStructures[token & 0x3f];
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
			v8::Local<v8::Value>* array = new v8::Local<v8::Value>[token];
			for (int i = 0; i < token; i++) {
				array[i] = readNext();
			}
			return Array::New(isolate, array, token);
		}
	} else if (token < 0xc4) {
		if (token < 0xc0){
			token -= 0xa0;
			Local<String> string = Nan::New<v8::String>((char*) source + position, (int) token).ToLocalChecked();
			position += token;
			return string;
		}
		else if (token < 0xc2)
			return token == 0xc0 ? Nan::Null() : Nan::Undefined();
		else
			return Nan::New<Boolean>(token == 0xc3); // boolean
	} else if (token > 0) {
		/*if (!parseTable[token])
			return 'error token ' + token
		return parseTable[token](token)*/
	} else
		fprintf(stderr, "Unexpected end of MessagePack\n");
}
NAN_METHOD(readNextExport) {
	position = 0;
	info.GetReturnValue().Set(readNext());
}

NAN_METHOD(readString) {
	int position = Local<Number>::Cast(info[0])->IntegerValue(Nan::GetCurrentContext()).ToChecked();
	uint8_t token = source[position - 1];
	info.GetReturnValue().Set(Nan::New<v8::String>((char*) source + position, token - 0xa0).ToLocalChecked());
}


void initializeModule(v8::Local<v8::Object> exports) {
	Nan::SetMethod(exports, "setupHandlers", setupHandlers);
	Nan::SetMethod(exports, "setSource", setSource);
	Nan::SetMethod(exports, "readNext", readNextExport);
	Nan::SetMethod(exports, "readString", readString);
}

NODE_MODULE(addon, initializeModule);
