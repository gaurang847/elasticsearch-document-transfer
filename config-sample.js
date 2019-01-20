//Stuff that will have consequences

module.exports = Object.freeze({
	//Source client: from where the documents are to be fetched
	"source": {
		"host": "localhost",

		"index": "my_source_index",
		"type": "_doc"
	},

	//Target client: where documents are to be transferred to
	//If 'host' field is present, it'll be assumed the target is an elasticsearch server
	"target": {
		"index": "my_target_index",
		"type": "_doc",

		"filePath": "data.json",

		"host": "localhost:9200",
		"importMappingFromSource": true
	}
})