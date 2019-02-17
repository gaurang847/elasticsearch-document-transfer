# elasticsearch-document-transfer
[![npm version](https://badge.fury.io/js/elasticsearch-document-transfer.svg)](https://badge.fury.io/js/elasticsearch-document-transfer)
[![](https://img.shields.io/twitter/url/https/github.com/masquerade817/elasticsearch-document-transfer.svg?style=social)](https://twitter.com/gaurang847)

Simple Node.js script to transfer documents between two elasticsearch servers or between indices of the same elasticsearch server.

Implementation based on [consumer-producer problem][3].  
Since Node.js is single-threaded, `producer` and `consumer` cannot simultaneously access the `buffer`. And hence, as long as the asynchronous nature of Node.js is handled properly, there shouldn't be any issues related to concurrency.

### Prerequisite:
Clone the repo and run following command in the installed directory:  
`$ npm install`  
OR  
Simply open the desired directory in the terminal and run:  
`$ npm install elasticsearch-document-transfer`

### Usage:
1. Add `config.js` using [`config-sample.js`][1] as reference.  
Exercise caution while setting source and target elastic hosts (and while editing this file in general).
2. (Optional) Set appropriate values in [`options.js`][2]
3. Run the script
    ```
    node index.js
    ```

### Writing to XLSX file:
If you want to aggregate your elasticsearch documents into an excel file, you can do that as well.  
1. Set [`options.consume.byXlsx : true`][2]  
2. Set the appropriate paths in [`config.target.rawHitToXlsxPaths`][1].  
The keys in `rawHitToXlsxPaths` will be used as column headers.
    
### Note:
If [`options.consume.byFile`][2] is set to `true`, the documents will be written to a file in a format as expected by the [bulk API][4] of elasticsearch. The path of file must be specified in [`config.js`][1].

If [`options.consume.byElastic`][2] is set to `true`, the documents will be directly added to the target elastic server. The connection details should be present in [`config.js`][1].
    
[1]: /config-sample.js
[2]: /options.js
[3]: https://en.wikipedia.org/wiki/Producer–consumer_problem
[4]: https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-bulk.html
