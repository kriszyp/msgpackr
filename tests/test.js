var inspector = require('inspector')
inspector.open(9330, null, true)

function tryRequire(module) {
	try {
		return require(module)
	} catch(error) {
		return {}
	}
}
if (typeof chai === 'undefined') { chai = require('chai') }
assert = chai.assert
//if (typeof msgpack-struct === 'undefined') { msgpack-struct = require('..') }
var Serializer = require('..').Serializer

var zlib = tryRequire('zlib')
var deflateSync = zlib.deflateSync
var inflateSync = zlib.inflateSync
var deflateSync = zlib.brotliCompressSync
var inflateSync = zlib.brotliDecompressSync
var constants = zlib.constants
try {
//	var { decode, encode } = require('msgpack-lite')
} catch (error) {}

if (typeof XMLHttpRequest === 'undefined') {
	var fs = require('fs')
	var sampleData = JSON.parse(fs.readFileSync(__dirname + '/samples/slack.json'))
} else {
	var xhr = new XMLHttpRequest()
	xhr.open('GET', 'samples/outcomes.json', false)
	xhr.send()
	var sampleData = JSON.parse(xhr.responseText)
}
var ITERATIONS = 100000

suite('msgpack-struct basic tests', function(){
	test.only('serialize/parse data', function(){
		var data = {
			data: [
				{ a: 1, name: 'one', type: 'odd', isOdd: true },
				{ a: 2, name: 'two', type: 'even'},
				{ a: 3, name: 'three', type: 'odd', isOdd: true },
				{ a: 4, name: 'four', type: 'even'},
				{ a: 5, name: 'five', type: 'odd', isOdd: true },
				{ a: 6, name: 'six', type: 'even', isOdd: null }
			],
			description: 'some names',
			types: ['odd', 'even'],
			convertEnumToNum: [
				{ prop: 'test' },
				{ prop: 'test' },
				{ prop: 'test' },
				{ prop: 1 },
				{ prop: 2 },
				{ prop: [undefined] },
				{ prop: null }
			]
		}
		let structures = []
		let serializer = new Serializer({ structures })
		var serialized = serializer.serialize(data)
		var parsed = serializer.parse(serialized)
		assert.deepEqual(parsed, data)
	})

	test('mixed array', function(){
		var data = [
			'one',
			'two',
			'one',
			10,
			11,
			null,
			true,
			'three',
			'one'
		]
		var serialized = serialize(data)
		var parsed = parse(serialized)
		assert.deepEqual(parsed, data)
	})

	test.only('serialize/parse sample data', function(){
		var data = sampleData
		let structures = []
		let serializer = new Serializer({ structures })
		var serialized = serializer.serialize(data)
		var parsed = serializer.parse(serialized)
		assert.deepEqual(parsed, data)
	})

	test('write function', function() {
		serialize({ test: function() { console.log('just do not error') }})
	})

	test('extended class', function(){
		function Extended() {

		}
		Extended.prototype.getDouble = function() {
			return this.value * 2
		}
		var instance = new Extended()
		instance.value = 4
		var data = {
			extendedInstance: instance
		}
		// TODO: create two of these
		var options = new Options()
		options.addExtension(Extended, 'Extended')
		var serialized = serialize(data, options)
		var parsed = parse(serialized, options)
		assert.equal(parsed.extendedInstance.getDouble(), 8)
	})

	test('extended class as root', function(){
		function Extended() {

		}
		Extended.prototype.getDouble = function() {
			return this.value * 2
		}
		var instance = new Extended()
		instance.value = 4
		var options = new Options()
		options.addExtension(Extended, 'Extended')
		var serialized = serialize(instance, options)
		var parsed = parse(serialized, options)
		assert.equal(parsed.getDouble(), 8)
	})

	test('set/map/date', function(){
		var map = new Map()
		map.set(4, 'four')
		map.set('three', 3)

		var set = new Set()
		set.add(1)
		set.add('2')
		set.add({ name: 3})

		var data = {
			map: map,
			set: set,
			date: new Date(1532219539819)
		}
		var serialized = serialize(data)
		var parsed = parse(serialized)
		assert.equal(parsed.map.get(4), 'four')
		assert.equal(parsed.map.get('three'), 3)
		assert.equal(parsed.date.getTime(), 1532219539819)
		assert.isTrue(parsed.set.has(1))
		assert.isTrue(parsed.set.has('2'))
		assert.isFalse(parsed.set.has(3))
	})

	test('set/map/date as root', function(){
		var map = new Map()
		map.set(4, 'four')
		map.set('three', 3)

		var set = new Set()
		set.add(1)
		set.add('2')
		set.add({ name: 3})

		var serialized = serialize(map)
		var parsedMap = parse(serialized)
		serialized = serialize(set)
		var parsedSet = parse(serialized)
		serialized = serialize(new Date(1532219539819))
		var parsedDate = parse(serialized)
		assert.equal(parsedMap.get(4), 'four')
		assert.equal(parsedMap.get('three'), 3)
		assert.equal(parsedDate.getTime(), 1532219539819)
		assert.isTrue(parsedSet.has(1))
		assert.isTrue(parsedSet.has('2'))
		assert.isFalse(parsedSet.has(3))
	})

	test('numbers', function(){
		var data = {
			bigEncodable: 48978578104322,
			dateEpoch: 1530886513200,
			realBig: 3432235352353255323,
			decimal: 32.55234,
			negative: -34.11,
			exponential: 0.234e123,
			tiny: 3.233e-120,
			zero: 0,
			//negativeZero: -0,
			Infinity: Infinity
		}
		var serialized = serialize(data)
		var parsed = parse(serialized)
		assert.deepEqual(parsed, data)
	})

	test('utf16', function() {
		var data = sampleData
		this.timeout(10000)
		var serialized = serialize(data, { encoding: 'utf16le' })
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		var parsed
		parsed = parse(serialized, { encoding: 'utf16le' })
		assert.deepEqual(parsed, data)
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = parse(serialized, { encoding: 'utf16le' })
			//parsed = parse(inflateSync(serializedGzip))
			parsed.Settings
		}
	})

	test.skip('with block', function() {
		var testString = "[AhCommentsPDdDataGBqtBkDescription XEPS for Brugada SyndromeBdName PNew Bayesian NMADeOwnerpAfScopesQ[DfClientpDfDeletesDkDocumentSet[CbId2\u000f\u0003\u0019oHBdName XEPS for Brugada SyndromeBgGestalt XEPS for Brugada SyndromeBdTypehData SetIDeOwnerUJCbId2</\u0002YH PBrugada Syndrome PBrugada SyndromemDisease StateU2</\u0002I \\Cardiology/Vascular Diseases \\Cardiology/Vascular Diseases PTherapeutic AreaT2</\u0002HfGlobalfGlobalfGlobal]DdEditsDdTeampKDdTypeSJ4#\u0010\"HhCompoundhCompoundDdUserUJ8:q Wkzyp@doctorevidence.comhKris ZypdUserUyjTechnologyjTechnologyhDivisionTwoDoctor EvidenceoDoctor EvidencefClientDdViewrJ4#\u0010'_]DfStatusSJ4#\u0010\"FcN/AcN/AAdTagsPKR1\u0019\u000f.IlBayesian NMAU8:qyyxUyzzyTw{{zJ8\u0010\u0007\u0004EBgCreated \\2018-11-13T19:31:22.0224266ZBgUpdated \\2018-11-13T19:31:22.3505650ZDfLockedsG\u0010\u0014PZDgfiltersQDgstudiesXBdtype QStudy Set FiltersDhexpandedYDminterventionsrDhoutcomesrDdyearrDocharacteristicssDjstudyLevelsDestudysDfphasessDlparticipantssDfdesignsBdnamekNew FiltersAeorderZBpdyearminterventionsocharacteristicshoutcomesjstudyLevelestudyfphaseslparticipantsfdesignzDfconfigYHDdyearUIDhexpandedrDmnoSelectedMinrDmnoSelectedMaxrCcmin0\u001fTCcmax0\u001fcJDminterventionsRIsAjpredicatesQXBisubgroupsgexcludeD RexcludeOverlappingrAigroupTypeQBpfSingleKBdtypecanyAgclausesQRKtAevaluePDnshowComparatorrDjcomparatorRKtLAgclausesQRKtMAevaluePDgexcludeQLQRtPNDocharacteristicsQIsODhoutcomesQIs\u0000PDjstudyLevelQIs\u0000QDestudyQIs\u0000RDfphasesQIs\u0000SDlparticipantsRIsCetotalt\u0000TDfdesignQIsDflockedrDhdisabledsClorderVersionuDeviewsQ\u0000UDgstudiesWKhAnalysis\u0000VBdnameiNew Views\u0000WAeorderRBpocharacteristicsjstudyLevel\u0000XDfconfigRNQr\u0000PQs\u0000YDflockedr\u0000ZDhdisableds\u0000[DhexpandedR\u0000\\Docharacteristicsr\u0000]DjstudyLevels\u0000V PNew Bayesian NMAAfgroupsP\u0000^AhoutcomesP\u0000X[BmconfigVersionj10/07/2016Bgversionc0.7BemodeldconsBivalueType`BhrateTypegPersonsBklinearModelfrandomDdisSIsDlincludeANOHEsDlomScaleValuepDghyPriorpDlhyPriorFirstpDmhyPriorSecondpBkmeasureContcRMDDomeasureComputedpBjmeasureBinbORBkmeasureRatebHRCfnChainvCdthin~CenIter48dCfnAdapt1\u000eLD SincludeUnanalyzables]ChpositiontKlBayesian NMADgrenamesPDhbaselinep]"
		var data = parse(testString)
		assert.isTrue(typeof data.Data == 'object')
	})

	test('mixed map', function() {
		toMap = [{"key":22670471,"value":["SUBRIU"]},{"key":302461,"value":["SUCSgc"]},{"key":159653782,"value":["SUBrVs"]},{"key":159653789,"value":["SUyGO"]},{"key":159653792,"value":["SUFgs2"]},{"key":159653799,"value":["SUGhpW"]},{"key":159653802,"value":"literal:Overall Study, Other"},{"key":928494,"value":"literal:Overall"},{key: 159654549, value: ["SUE98q"]}]
	})
	test('shared structure', function() {
		var testData = [{"Enum":{"Id":14,"Name":"AttributeName"},"Binding":{"IsBound":true,"Phrases":[{"Conjunction":"or","Terms":[{"IsDisplaySynonym":false,"IsRoot":true,"IsSubgroup":false,"SynonymId":415579},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":71175},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":61423549},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":141278106},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":70385}]}]},"BoundName":"VAS Pain on Nominated Activity Active Knees Calculated","LookupTable":{"Id":148364057,"Name":"VAS, Pain, On Nominated Activity, Active Knee, Calculated","Gestalt":"VAS, Pain, On Nominated Activity, Active Knee, Calculated"},"LookupTableId":148364057,"Scope":{"Id":107228406,"Name":"DocumentSet : Efficacy and Safety of Hylan G-F 20 vs Steroid Injection for OA: A Systematic Literature Review","Gestalt":"DocumentSet : Efficacy and Safety of Hylan G-F 20 vs Steroid Injection for OA: A Systematic Literature Review","Type":"DocumentSet"},"ScopeId":107228406,"Synonyms":[{"Id":70385,"Name":"Calculated","Gestalt":"Calculated"},{"Id":71175,"Name":"Pain","Gestalt":"Pain"},{"Id":415579,"Name":"VAS","Gestalt":"VAS"},{"Id":61423549,"Name":"on Nominated Activity","Gestalt":"on Nominated Activity"},{"Id":141278106,"Name":"Active Knees","Gestalt":"Active Knees"}],"SynonymsCount":5,"Workflows":[],"WorkflowsCount":0,"Id":148434563,"Created":"2019-03-12T17:46:28.8558375Z","Updated":"2019-03-12T21:36:52.1289574Z","CreatorId":null,"VersionNo":4,"Locked":false,"Gestalt":"VAS Pain on Nominated Activity Active Knees Calculated"},
			{"Enum":{"Id":14,"Name":"AttributeName"},"extra": 3, "Binding":{"IsBound":true,"Phrases":[{"Conjunction":"or","Terms":[{"IsDisplaySynonym":false,"IsRoot":true,"IsSubgroup":false,"SynonymId":412832}]}]},"BoundName":"thrombocytopenia,","LookupTable":{"Id":1004902,"Name":"​​All grades: Haematological, Thrombocytopenia","Gestalt":"Thrombocytopenia"},"LookupTableId":1004902,"Scope":{"Id":67058053,"Name":"DocumentSet : Global","Gestalt":"DocumentSet : Global","Type":"DocumentSet"},"ScopeId":67058053,"Synonyms":[{"Id":412832,"Name":"thrombocytopenia,","Gestalt":"thrombocytopenia,"}],"SynonymsCount":1,"Workflows":[],"WorkflowsCount":0,"Id":67096694,"Created":"2017-02-11T04:10:55.1825881Z","Updated":"2017-02-11T04:10:55.1895882Z","CreatorId":null,"VersionNo":1,"Locked":false,"Gestalt":"thrombocytopenia,"},
			{"Enum":{"Id":14,"Name":"AttributeName"},"extra": 4, "Binding":{"IsBound":true,"Phrases":[{"Conjunction":"or","Terms":[{"IsDisplaySynonym":false,"IsRoot":true,"IsSubgroup":false,"SynonymId":6714096},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":5430815},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":1373198}]}]},"BoundName":"Number of Treatments Anti-VEGF Agents Cumulative","LookupTable":{"Id":6686299,"Name":"# Injections, Cumulative Anti-VEGF treatments"},"LookupTableId":6686299,"Scope":{"Id":67058053,"Name":"DocumentSet : Global","Gestalt":"DocumentSet : Global","Type":"DocumentSet"},"ScopeId":67058053,"Synonyms":[{"Id":1373198,"Name":"Cumulative","Gestalt":"Cumulative"},{"Id":5430815,"Name":"Anti-VEGF Agents","Gestalt":"Anti-VEGF Agents"},{"Id":6714096,"Name":"Number of Treatments","Gestalt":"Number of Treatments"}],"SynonymsCount":3,"Workflows":[],"WorkflowsCount":0,"Id":67096987,"Created":"2017-02-11T04:10:55.3406141Z","Updated":"2017-02-11T04:10:55.3595894Z","CreatorId":null,"VersionNo":1,"Locked":false,"Gestalt":"Number of Treatments Anti-VEGF Agents Cumulative"}]
		var sharedGenerator = createSharedStructure()
		serialize(testData[0], { shared: sharedGenerator })
		serialize(testData[1], { shared: sharedGenerator })
		serialize(testData[2], { shared: sharedGenerator })
		var serialized = sharedGenerator.serializeCommonStructure()
		var sharedStructure = readSharedStructure(serialized)
		var serializedWithShared = serialize(testData[0], { shared: sharedStructure })
		var serializedWithShared1 = serialize(testData[1], { shared: sharedStructure })
		var serializedWithShared2 = serialize(testData[2], { shared: sharedStructure })
		var parsed = parse(serializedWithShared, { shared: sharedStructure })
		assert.deepEqual(parsed, testData[0])
		var parsed = parse(serializedWithShared1, { shared: sharedStructure })
		assert.deepEqual(parsed, testData[1])
		var parsed = parse(serializedWithShared2, { shared: sharedStructure })
		assert.deepEqual(parsed, testData[2])
	})
})
suite('dpack performance tests', function(){

	test.skip('performance msgpack-lite', function() {
		var data = sampleData
		this.timeout(10000)
		var serialized = encode(data)
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			//parsed = decode(serialized)
			parsed = decode(inflateSync(serializedGzip))
			parsed.Settings
		}
	})

	test.only('performance JSON.parse', function() {
		this.timeout(10000)
		var data = sampleData
		var serialized = JSON.stringify(data)
		//var bs = Buffer.from(serialized)
		//var serializedGzip = deflateSync(bs, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 3 } })
		console.log('JSON size', serialized.length)
		//console.log('deflate size', serializedGzip.length)
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = JSON.parse(serialized)
//			inflateSync(serializedGzip)
			//parsed = JSON.parse()
			//let b = Buffer.alloc(bs.length)
			//lz4.decodeBlock(compressed, b)
			//parsed = JSON.parse(b)
			//parsed.Settings
		}
	})
	test('performance JSON.parse with schema', function() {
		this.timeout(10000)
		var data = sampleData
		let schema = createSchema(data)
		//schema = internalize(schema)
		let values = writeObjectWithSchema(data, schema)
		var serialized = JSON.stringify(values)
		//var serializedGzip = deflateSync(Buffer.from(serialized))
		console.log('JSON with schema size', serialized.length)
		//console.log('deflate size', serializedGzip.length)
		var parsed, parsedValues
		for (var i = 0; i < ITERATIONS; i++) {
			serialized.indexOf('\n')
			if (serialized[0] == 's') {

			}
			parsedValues = JSON.parse(serialized)
			//parsedValues = JSON.parse(inflateSync(serializedGzip))
			parsed = readObjectWithSchema(parsedValues, schema)
			parsed.Settings
		}
//		console.log({parsed})
	})
	test('performance shared', function() {
		this.timeout(10000)
		var data = sampleData
		//sharedStructure = undefined
		var sharedGenerator = createSharedStructure()
		serialize(sampleData, { shared: sharedGenerator })
		serialize(sampleData, { shared: sharedGenerator })
		//serialize(testData[2], { shared: sharedGenerator })
		var serialized = sharedGenerator.serializeCommonStructure()
		var sharedStructure = readSharedStructure(serialized)
		var serialized = serialize(data, { shared: sharedStructure })
		//var serialized = serialize(data)
		//var serializedGzip = deflateSync(serialized)
		console.log('dpack shared size', serialized.length)
		//console.log('deflate size', serializedGzip.length)
		//console.log({ shortRefCount, longRefCount })
		var parser = createParser({ shared: sharedStructure })
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parser.setSource(serialized)
			parsed = parser.read()

			parsed.Settings
		}
	})
	test.only('performance', function() {
		var data = sampleData
		this.timeout(10000)
		let structures = []
		let serializer = new Serializer({ structures })
		var serialized = serializer.serialize(data)

		console.log('msgpack-struct size', serialized.length)
		for (var i = 0; i < ITERATIONS; i++) {
			var parsed = serializer.parse(serialized)
		}
	})
	test.skip('performance serialize avro', function() {
		const type = avro.Type.forValue(sampleData);
		// We can use `type` to encode any values with the same structure:
		let serialized = type.toBuffer(sampleData);
		console.log('size', serialized.length, type.toString().length)
		for (var i = 0; i < ITERATIONS; i++) {
			serialized = type.toBuffer(sampleData);
		}
	})
	test.skip('performance avro', function() {
		const type = avro.Type.forValue(sampleData);

		// We can use `type` to encode any values with the same structure:
		let serialized = type.toBuffer(sampleData);
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length, serializedGzip.length)
		let data
		for (var i = 0; i < ITERATIONS; i++) {
			data = type.fromBuffer(serialized);
		}
	})
	test.skip('performance V8 serialize', function() {
		var v8 = require('v8')
		var data = sampleData
		this.timeout(10000)
		for (var i = 0; i < ITERATIONS; i++) {
			var serialized = v8.serialize(data)
			//var serializedGzip = deflateSync(serialized)
		}
	})
	test.skip('performance V8 deserialize', function() {
		var v8 = require('v8')
		var data = sampleData
		this.timeout(10000)
		var serialized = v8.serialize(data)
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		//console.log({ shortRefCount, longRefCount })
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = v8.deserialize(serialized)
			//parsed = parse(inflateSync(serializedGzip))
			parsed.Settings
		}
	})
	test.only('performance JSON.stringify', function() {
		var data = sampleData
		this.timeout(10000)
		for (var i = 0; i < ITERATIONS; i++) {
			let string = JSON.stringify(data)
			//deflateSync(Buffer.from(string), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 3 } })
		}
	})
	test('performance JSON.stringify with schema', function() {
		this.timeout(10000)
		var data = sampleData
		let schema = createSchema(data)
		for (var i = 0; i < ITERATIONS; i++) {
			let values = writeObjectWithSchema(data, schema)
			let string = JSON.stringify(values)
			//deflateSync(Buffer.from(string), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 3 } })
		}
	})


	test.only('performance serialize', function() {
		var data = sampleData
		this.timeout(10000)
		let structures = []
		let serializer = new Serializer({ structures })

		for (var i = 0; i < ITERATIONS; i++) {
			//serialized = serialize(data, { shared: sharedStructure })
			var serialized = serializer.serialize(data)
			serializer.resetMemory()
			//var serializedGzip = deflateSync(serialized)
		}
		//console.log('serialized', serialized.length, global.propertyComparisons)
	})
	test.skip('performance encode msgpack-lite', function() {
		var data = sampleData
		this.timeout(10000)
		for (var i = 0; i < ITERATIONS; i++) {
			var serialized = encode(data)
			var serializedGzip = deflateSync(serialized)
		}
	})

})


function createSchema(object) {
	let schema = []
	for (let key in object)	{
		let value = object[key]
		let childSchema
		if (value && typeof value == 'object') {
			childSchema = {
				key: key
			}
			if (value instanceof Array) {
				if (value[0] && typeof value[0] == 'object') {
					childSchema.schema = true
					childSchema.items = createSchema(value[0])
				}
			} else {
				childSchema.schema = true
				childSchema.structure = createSchema(value)
			}
		} else {
			childSchema = key
		}
		schema.push(childSchema)
	}
	return schema
}
function writeObjectWithSchema(object, schema) {
	let i = 0
	let base = {}
	let values = []
	for (let key in object) {
		let value = object[key]
		let childSchema = schema[i++]
		if (typeof childSchema == 'string' ? childSchema == key : (childSchema && childSchema.key == key)) {
			if (childSchema.schema) {
				if (childSchema.items) {
					value = writeArrayWithSchema(value, childSchema.items)
				} else {
					value = writeObjectWithSchema(value, childSchema.structure)
				}
			}
			values.push(value)
		} else {
			base[key] = value
		}
	}
	return values
}
function writeArrayWithSchema(array, schema) {
	let l = array.length
	let target = new Array(l)
	for (let i = 0; i < l; i++) {
		target[i] = writeObjectWithSchema(array[i], schema)
	}
	return target
}
function readObjectWithSchema(values, schema) {
	let l = values.length
	let target = {}
	for (let i = 0; i < l;) {
		let childSchema = schema[i]
		let value = values[i++]
		if (typeof childSchema == 'string') {
			target[childSchema] = value
		}
		else {
			if (typeof value == 'object' && value) {
				if (childSchema.items) {
					value = readArrayWithSchema(value, childSchema.items)
				} else if (childSchema.structure) {
					value = readObjectWithSchema(value, childSchema.structure)
				}
			}
			target[childSchema.key] = value
		}
	}
	return target
}
function readArrayWithSchema(values, schema) {
	let l = values.length
	let target = new Array(l)
	for (let i = 0; i < l; i++) {
		target[i] = readObjectWithSchema(values[i], schema)
	}
	return target
}
function internalize(object) {
	return eval('(' + JSON.stringify(object) +')')
}
