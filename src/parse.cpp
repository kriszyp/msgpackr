/*
This is responsible for extracting the strings, in bulk, from a MessagePack buffer. Creating strings from buffers can
be one of the biggest performance bottlenecks of parsing, but creating an array of extracting strings all at once
provides much better performance. This will parse and produce up to 256 strings at once .The JS parser can call this multiple
times as necessary to get more strings. This must be partially capable of parsing MessagePack so it can know where to
find the string tokens and determine their position and length. All strings are decoded as UTF-8.
*/
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

void setupTokenTable() {
	for (int i = 0; i < 256; i++) {
		tokenTable[i] = nullptr;	
	}
	// str 8
	tokenTable[0xd9] = ([](int token) -> void {
		int length = source[position++];
		target[writePosition++] = Nan::New<v8::String>((char*) source + position, length).ToLocalChecked();
		position += length;
	});
	// str 16
	tokenTable[0xda] = ([](int token) -> void {
		int length = source[position++] << 8;
		length += source[position++];
		target[writePosition++] = Nan::New<v8::String>((char*) source + position, length).ToLocalChecked();
		position += length;
	});
	// str 32
	tokenTable[0xdb] = ([](int token) -> void {
		int length = source[position++] << 24;
		length += source[position++] << 16;
		length += source[position++] << 8;
		length += source[position++];
		target[writePosition++] = Nan::New<v8::String>((char*) source + position, length).ToLocalChecked();
		position += length;
	});

	tokenTable[0xcb] = ([](int token) -> void {
		position += 8;
	});
	// uint8, int8
	tokenTable[0xcc] = tokenTable[0xd0] = ([](int token) -> void {
		position++;
	});
	// uint16, int16, array 16, map 16, fixext 1
	tokenTable[0xcd] = tokenTable[0xd1] = tokenTable[0xdc] = tokenTable[0xde] = tokenTable[0xd4] = ([](int token) -> void {
		position += 2;;
	});
	// fixext 16
	tokenTable[0xd5] = ([](int token) -> void {
		position += 3;
	});
	// uint32, int32, float32, array 32, map 32
	tokenTable[0xce] = tokenTable[0xd2] = tokenTable[0xca] = tokenTable[0xdd] = tokenTable[0xdf] = ([](int token) -> void {
		position += 4;
	});
	// fixext 4
	tokenTable[0xd6] = ([](int token) -> void {
		position += 5;
	});
	// uint64, int64, float64, fixext 8
	tokenTable[0xcf] = tokenTable[0xd3] = tokenTable[0xcb] = ([](int token) -> void {
		position += 8;
	});
	// fixext 8
	tokenTable[0xd8] = ([](int token) -> void {
		position += 9;
	});
	// fixext 16
	tokenTable[0xd8] = ([](int token) -> void {
		position += 17;
	});
	// bin 8
	tokenTable[0xc4] = ([](int token) -> void {
		int length = source[position++];
		position += length;
	});
	// bin 16
	tokenTable[0xc5] = ([](int token) -> void {
		int length = source[position++] << 8;
		length += source[position++];
		position += length;
	});
	// bin 32
	tokenTable[0xc6] = ([](int token) -> void {
		int length = source[position++] << 24;
		length += source[position++] << 16;
		length += source[position++] << 8;
		length += source[position++];
		position += length;
	});
	// ext 8
	tokenTable[0xc7] = ([](int token) -> void {
		int length = source[position++];
		position++;
		position += length;
	});
	// ext 16
	tokenTable[0xc8] = ([](int token) -> void {
		int length = source[position++] << 8;
		length += source[position++];
		position++;
		position += length;
	});
	// ext 32
	tokenTable[0xc9] = ([](int token) -> void {
		int length = source[position++] << 24;
		length += source[position++] << 16;
		length += source[position++] << 8;
		length += source[position++];
		position++;
		position += length;
	});
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
	next_token: while (position < size) {
		uint8_t token = source[position++];
		if (token < 0xa0) {
			// all one byte tokens
		} else if (token < 0xc0) {
			// fixstr, we want to convert this
			token -= 0xa0;
			if (token < 8) {
				// skip simple strings that are less than 8 characters and only latin, these are handled in JS, 
				int strPosition = position;
				int end = position + token;
				while(strPosition < end) {
					if (source[strPosition] & 0x80 == 0)
						strPosition++;
					else
						break;
				}
				if (strPosition == end)
					goto next_token; // processed all of them, safe to skip
			} else {
				target[writePosition++] = Nan::New<v8::String>((char*) source + position, (int) token).ToLocalChecked();
				position += token;
				if (writePosition >= MAX_TARGET_SIZE)
					break;
			}
		} else {
			if (tokenTable[token]) {
				tokenTable[token](token);
				if (writePosition >= MAX_TARGET_SIZE)
					break;
			}
		}
	}
	Isolate *isolate = Isolate::GetCurrent();
	info.GetReturnValue().Set(Array::New(isolate, target, writePosition));
}

void initializeModule(v8::Local<v8::Object> exports) {
	setupTokenTable();
	Nan::SetMethod(exports, "setSource", setSource);
	Nan::SetMethod(exports, "readStrings", readStrings);
}

NODE_MODULE(addon, initializeModule);
