//Values that will have consequences

module.exports = Object.freeze({
	//Source client: from where the documents are to be fetched
	"source": {
		"host": "localhost:9200",

		"index": "my_source_index",
		"type": "_doc"
	},

	//Target client: where documents are to be transferred to
	"target": {
		"index": "my_target_index",
		"type": "_doc",

        //if options.consume.byFile is not set, this will be ignored
		"filePath": "data.json",

        //if options.consume.byElastic is not set, this will be ignored
		"host": "localhost:9200",
		"importMappingFromSource": true
	}
})