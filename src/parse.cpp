#include <vector>
#include <algorithm>
#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <nan.h>
using namespace v8;

uint8_t* source;
int position = 0;
Nan::Callback arrayMaker;
NAN_METHOD(setupHandlers) {
	//arrayMaker.Reset(v8::Local<v8::Function>::Cast(info[0]));
}
NAN_METHOD(setSource) {
	int length = node::Buffer::Length(info[0]);
	position = 0;
   source = (uint8_t*) node::Buffer::Data(info[0]);
}

v8::Local<v8::Value> readNext() {
	uint8_t token = source[position++];
	v8::Local<v8::Value> value;
	if (token < 128)
		return Nan::New<v8::Number>(token);
	else if (token < 196) {
		token = token - 128;
		v8::Local<v8::Value>* values = new v8::Local<v8::Value>[token];
		for (int i = 0; i < token; i++) {
			values[i] = readNext();
		}
	   Isolate *isolate = Isolate::GetCurrent();
		return Array::New(isolate, values, token);
	} else {
		token = token - 196;
		v8::Local<v8::String> string = Nan::New<v8::String>((char*) source + position, (int) token).ToLocalChecked();
		position = position + token;
		return string;
	}
}

NAN_METHOD(readNextExport) {
   info.GetReturnValue().Set(readNext());
}


void initializeModule(v8::Local<v8::Object> exports) {
	Nan::SetMethod(exports, "setupHandlers", setupHandlers);
	Nan::SetMethod(exports, "setSource", setSource);
	Nan::SetMethod(exports, "readNext", readNextExport);
}

NODE_MODULE(addon, initializeModule);
