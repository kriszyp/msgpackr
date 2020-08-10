#include <vector>
#include <algorithm>
#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <nan.h>

// type codes:
// these are the codes that are used to determine the rudimentary type of numbers
const uint8_t PROPERTY_CODE = 0;
const uint8_t TYPE_CODE = 3;
const uint8_t STRING_CODE = 2;
const uint8_t NUMBER_CODE = 1;
const uint8_t SEQUENCE_CODE = 7;

// constant codes
const uint8_t NULL_CODE = 0; // p
const uint8_t FALSE_CODE = 3; // s
const uint8_t TRUE_CODE = 4; // t
const uint8_t UNDEFINED = 5; // u

// these are the starting codes (structures also use this space) for complete types
const uint8_t DEFAULT_TYPE = 6;
const uint8_t ARRAY_TYPE = 7;
const uint8_t REFERENCING_TYPE = 8;
const uint8_t NUMBER_TYPE = 9;
const uint8_t EXTENSIONS = 10;
const uint8_t METADATA_TYPE = 11;
const uint8_t COPY_PROPERTY = 12; // for defining a typed object without returning the value
const uint8_t REFERENCING_POSITION = 13;
const uint8_t TYPE_DEFINITION = 14;  // for defining a typed object without returning the value

const int ERROR_METADATA = 500;
// sequence codes
const uint8_t OPEN_SEQUENCE = 12; // <
const uint8_t PARTIAL_DEFERRED_REFERENCE = 12; // <
const uint8_t END_SEQUENCE = 14; // >
const uint8_t DEFERRED_REFERENCE = 15; // ?

class Property {
	public:
	int code;
	v8::Local<v8::String> key;
	std::vector<v8::Local<v8::String>>* values;
	std::vector<Property*> children;
	~Property() {
		for (Property* child : children) {
			delete child;
		}
	}
};


class Parser {
private:
	int offset = 0;
	uint8_t* source;
	int sourceLength;

	/*isPartial
	/*var classByName = options.classByName || new Map()
	var freeze = options.freeze && (options.freeze == true ? Object.freeze : options.freeze)
	classByName.set('Map', readMap)
	classByName.set('Set', readSet)
	classByName.set('Date', readDate)*/
public:
	Parser(uint8_t* sourceIn, int sourceLengthIn) {
		source = sourceIn;
		sourceLength = sourceLengthIn;
	}

	v8::Local<v8::Value> readSequence(int length, Property* thisProperty, bool isRoot = false) {
		/* propertyStates:
		0 - starting next property slot
		1 - property created, succeeding value should be value of property
		2 - property creation in progress, next value should define key
		11+ - modifying property, next value modifies property (adds metadata, position, type, etc.)
		*/
		int propertyState = 0;
//		thisProperty = thisProperty || [];
		Property* property;
		v8::Isolate *isolate = v8::Isolate::GetCurrent();
    
		v8::Local<v8::Value> value;
		v8::Local<v8::Context> context = Nan::GetCurrentContext();
		int i = 0, propertyIndex = 0;
		bool isArray = thisProperty->code == ARRAY_TYPE;/*ARRAY_TYPE*/
		v8::Local<v8::Object> object = v8::Local<v8::Object>(); //isArray ? v8::Local<v8::Object>::Cast(Nan::New<v8::Array>(length)) : Nan::New<v8::Object>(); // TODO: we could probably construct a new reader that does this a little faster
   //fprintf(stdout, "readsequence length %u\n", length);
		int type;
		int number;
		int lastRead = offset;
		int token;
		for (; i < length;) {
			token = source[offset++];
			if (token >= 0x30) { // fast path for one byte with stop bit
				if (token > 0x3000) { // long-token handling
					type = (token >> 12) ^ 4;
					number = token & 0xfff;
				} else {
					type = (token >> 4) ^ 4;
					number = token & 0xf;
				}
			} else {
				type = (token >> 4) & 11; // shift and omit the stop bit (bit 3)
				number = token & 0xf;
				token = source[offset++];
				number = (number << 6) + (token & 0x3f); // 10 bit number
				if (!(token >= 0x40)) {
					token = source[offset++];
					number = (number << 6) + (token & 0x3f); // 16 bit number
					if (!(token >= 0x40)) {
						token = source[offset++];
						number = (number << 6) + (token & 0x3f); // 22 bit number
						if (!(token >= 0x40)) {
							token = source[offset++];
							number = (number << 6) + (token & 0x3f); // 28 bit number
							if (!(token >= 0x40)) {
								token = source[offset++];
								number = (number * 0x40) + (token & 0x3f); // 34 bit number (we can't use 32-bit shifting operators anymore)
								if (!(token >= 0x40)) {
									token = source[offset++];
									number = (number * 0x40) + (token & 0x3f); // 40 bit number
									if (!(token >= 0x40)) {
										token = source[offset++];
										number = (number * 0x40) + (token & 0x3f); // 46 bit number, we don't go beyond this
										if (!(token >= 0)) {
											if (offset > sourceLength) {
												Nan::ThrowError("Unexpected end");
												return Nan::Null();
											}
										}
									}
								}
							}
						}
					}
				}
			}
		//fprintf(stdout, "type %u number %u\n", type, number);
			if (type == 0) { /*PROPERTY_CODE*/
				propertyIndex = number;
				propertyState = 0;
				continue;
			}
			if (thisProperty->children.size() > propertyIndex)
				property = thisProperty->children[propertyIndex];
			else
				property = nullptr;
			if (type == 3) { /*TYPE_CODE*/
				// we store the previous property state in token, so we can assign the next one
				if (number < 6) {
					// special values (constants, deferreds)
					if (number < 3) {
						if (number == 0) {
							value = Nan::Null();
						} else {
							value = Nan::New<v8::String>("Unknown token").ToLocalChecked();
						} 
					} else {
						if (number == TRUE_CODE) {
							value = Nan::True();
						} else if (number == FALSE_CODE) {
							value = Nan::False();
						} else {
							value = Nan::Undefined();
						}
					}
				} else {
					if (number <= NUMBER_TYPE) {
						// property definition
						if (propertyState == 1) {
							// we were in property value position, but no value, so we increment position here
							propertyIndex++;
							i++;
							property = thisProperty->children.size() > propertyIndex ? thisProperty->children[propertyIndex] : nullptr;
						}
//						if (propertyIndex < thisProperty->resetTo) {
	//						return Nan::ThrowError("Overwriting frozen property");
		//				}
						if (property) {
//							if (!property.resume) {
								value = property->key; // inherit the existing key
								thisProperty->children.push_back(property = new Property());
								property->key = v8::Local<v8::String>::Cast(value);
//							}
						} else { // no property existed in slot, start with default empty key
							thisProperty->children.push_back(property = new Property());
							property->key = v8::String::Empty(isolate);
						}
						property->code = number;
						//property.parent = thisProperty;
						//property.key = null
						propertyState = 2; // read next value as the key
						if (number == REFERENCING_TYPE/*REFERENCING_TYPE*/) {
							property->values = new std::vector<v8::Local<v8::String>>();
						} else if (number == ARRAY_TYPE) {
							Property* arrayChild = new Property();
							property->children.push_back(arrayChild);// [0] = new Property();
							arrayChild->key = v8::String::Empty(isolate);
							arrayChild->code = DEFAULT_TYPE;
							//arrayChild.parent = property;
						}
					} else {
						// property modification
						propertyState = number;
					}
					continue;
				}
			} else {
				if (type == 2 /*STRING_CODE*/) {
					int i = offset;
					bool hasTwoBytes = false;
					for (; number > 0; number--) {
						if (i > sourceLength) {
							Nan::ThrowError("Unexpected end");
							return Nan::Null();
						}
						if (source[i] >= 0x80) {
							if (source[i] >= 0xe0) {
								if (source[i] >= 0xf0) {
									i += 4;
									number--;
								} else
									i += 3;
							}
							else
								i += 2;
							hasTwoBytes = true;
						}
						else
							i++;
					}
					value = v8::String::NewFromOneByte(isolate, source + offset, v8::NewStringType::kNormal, i - offset).ToLocalChecked();
					offset = i;
					if (propertyState < 2) {
						if (property->code == NUMBER_TYPE/*NUMBER_TYPE*/) {
							value = value->ToNumber(context).ToLocalChecked();
						}
					}
				} else if (type == 1) { /*NUMBER_CODE*/
					value = v8::Integer::NewFromUnsigned(isolate, (uint32_t) number);
					//value = Nan::New<v8::Number>(number);
				} else { /*if type == 7 SEQUENCE_CODE*/
					if (number > 13) {
						if (number == END_SEQUENCE) {
							//if (freeze)
								//freeze(object)
							return object;
						}
						/*else if (number == DEFERRED_REFERENCE) {
							value = readSequence(0, property);
							propertyState = 0;
							if (options.forDeferred) {
								value = options.forDeferred(value, property)
							} else {
								(deferredReads || (deferredReads = [])).push({
									property: property,
									value: value
								})
							}
						}*/
					} else {
						if (number >= OPEN_SEQUENCE) {
							number = 2000000000;
						}
						if (propertyState > 1) {
							if (propertyState == 2) {
								propertyState = 0; // if the property key was skipped, go directly into value mode
								value = readSequence(number, property);
							}/* else if (propertyState == METADATA_TYPE) {
								value = readSequence(number, [{ key: null, code: 6 }]);
							}*/ else
								value = readSequence(number, property);
						} else
							value = readSequence(number, property);
					}
				}
			}
			if (!property) {
				Nan::ThrowError("No property defined for slot");
				return Nan::Null();
			}
			if (propertyState < 2 && property && property->code == REFERENCING_TYPE/*REFERENCING_TYPE*/) {
				if (type == 1) {
					if (property->values->size() <= number) {
						Nan::ThrowError("Referencing value that has not been read yet");
						return Nan::Null();
					}					
					value = (*property->values)[number];
				} else if ((type == 2 || type == 7)) { // only strings and sequences
/*					if (property.values.nextPosition > -1) {
						// we use this path for fulfilling forward references
						if (property.recordValueReference) {
							property.recordValueReference(values)
						}
						property.values[property.values.nextPosition++] = value
					} else {*/
						property->values->push_back(v8::Local<v8::String>::Cast(value));
					//}
				}
			}
			
			if (propertyState > 1) {
				// 0, 1: values are the value of the property
				if (propertyState == 2) { // property key
					property->key = v8::Local<v8::String>::Cast(value);
				}/* else if (propertyState == METADATA_TYPE) { // 3: metadata paramater
					if (typeof value == 'string') {
						var extendedType = classByName.get(value)
						if (extendedType) {
							if (extendedType.fromValue) {
								property.fromValue = extendedType.fromValue
							} else {
								property.constructs = extendedType
							}
						} else if (options.errorOnUnknownClass) {
							return Nan::ThrowError("Attempt to deserialize to unknown class");
						} else {
							// if no warning, just parse as a plain value/object
						}
						property.extendedType = extendedType // if this gets used for serialization, this is needed
					} else {
						// extended metadata assignment (used by shared structures to mark objects as unstructured)
						property.metadata = value
						if (value == ERROR_METADATA)
							property.fromValue = onError
					}
				} else if (propertyState == REFERENCING_POSITION) {
					var values = property->values || (property->values = [])
					//values.splice(value, values.length)
					values.nextPosition = value;
				}*/ else if (propertyState == TYPE_DEFINITION) { // for type-only state
					// throw away this value and read next value as the real value
				} else {
					Nan::ThrowError("Unknown property type");
					return Nan::Null();
				}
				propertyState = 1; // property value after definition position
				continue; // read next value as the property value
			} else {
				propertyState = 0;
			}
			//if (property.fromValue) {
			//	value = property.fromValue(value)
			//}
			if (isRoot)
				return value;
			if (isArray && property->key->IsNull()) {
				//object->Set(context, i, value);
			} else if (!value->IsUndefined()) {
				//object->Set(context, property->key, value);
			}
			i++;
			if (!isArray)
				propertyIndex++;
		}
		//if (freeze)
			//freeze(object);
		return object;
	}
};

NAN_METHOD(parse) {
	int length = node::Buffer::Length(info[0]);
   char* data = node::Buffer::Data(info[0]);
//   fprintf(stdout, "length %u\n", length);
   Parser* parser = new Parser((uint8_t*) data, length);
   Property* groundProperty = new Property();
   Property* rootProperty = new Property();
   groundProperty->children.push_back(rootProperty);
   //rootProperty->key = Nan::New<v8::String>("").ToLocalChecked();
   rootProperty->code = 6;
//   fprintf(stdout, "parsing\n");
	info.GetReturnValue().Set(parser->readSequence(1, groundProperty, true));
	delete groundProperty;
}

void initializeModule(v8::Local<v8::Object> exports) {
	Nan::SetMethod(exports, "parse", parse);
}

NODE_MODULE(addon, initializeModule);
