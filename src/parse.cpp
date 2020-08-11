#include <vector>
#include <algorithm>
#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <nan.h>
using namespace v8;

typedef void (*token_handler)(int token);
token_handler tokenTable[256] = {};
const int MAX_TARGET_SIZE = 256;

uint8_t* source;
int position = 0;
int writePosition = 0;
v8::Local<v8::Value> target[MAX_TARGET_SIZE];

Nan::Callback arrayMaker;
void setupHandlers() {
	tokenTable[0xd9] = ([](int token) -> void {
		int length = source[position++];
		target[writePosition++] = Nan::New<v8::String>((char*) source + position, length).ToLocalChecked();
		position += length;
	});
	tokenTable[0xda] = ([](int token) -> void {
		int length = source[position++] << 8;
		length += source[position++];
		target[writePosition++] = Nan::New<v8::String>((char*) source + position, length).ToLocalChecked();
		position += length;
	});

	tokenTable[0xcb] = ([](int token) -> void {
		position += 8;
	});
	tokenTable[0xcc] = ([](int token) -> void {
		position++;
	});
	tokenTable[0xcd] = ([](int token) -> void {
		position += 2;;
	});
	tokenTable[0xce] = ([](int token) -> void {
		position += 4;
	});


	//arrayMaker.Reset(v8::Local<v8::Function>::Cast(info[0]));
}
NAN_METHOD(setSource) {
	int length = node::Buffer::Length(info[0]);
	position = 0;
	source = (uint8_t*) node::Buffer::Data(info[0]);
}

NAN_METHOD(readStrings) {
	writePosition = 0;
	Local<Context> context = Nan::GetCurrentContext();
	position = Local<Number>::Cast(info[0])->IntegerValue(context).ToChecked();
	int size = Local<Number>::Cast(info[1])->IntegerValue(context).ToChecked();
	while (position < size) {
		uint8_t token = source[position++];
		if (token < 0xa0) {
			// one byte tokens
		} else if (token < 0xc0) {
			// string, we want to convert this
			token -= 0xa0;
			target[writePosition++] = Nan::New<v8::String>((char*) source + position, (int) token).ToLocalChecked();
			position += token;
			if (writePosition >= MAX_TARGET_SIZE)
				break;
		} else {
			if (tokenTable[token]) {
				tokenTable[token](token);
			}
			if (writePosition >= MAX_TARGET_SIZE)
				break;
		}
	}
	Isolate *isolate = Isolate::GetCurrent();
	info.GetReturnValue().Set(Array::New(isolate, target, writePosition));
}



void initializeModule(v8::Local<v8::Object> exports) {
	setupHandlers();
	Nan::SetMethod(exports, "setSource", setSource);
	Nan::SetMethod(exports, "readStrings", readStrings);
}

NODE_MODULE(addon, initializeModule);
