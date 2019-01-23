# elasticsearch-document-transfer
[![npm version](https://badge.fury.io/js/elasticsearch-document-transfer.svg)](https://badge.fury.io/js/elasticsearch-document-transfer)

Simple Node.js script to transfer documents between two elasticsearch servers or between indices of the same elasticsearch server.

Implementation based on [consumer-producer problem][3].  
Since Node.js is single-threaded, `producer` and `consumer` cannot simultaneously access the `buffer`. And hence, as long as the asynchronous nature of Node.js is handled properly, there shouldn't be any issues related to concurrency.

### Usage:
1. Clone the repo.
2. Run `npm install` in the directory.
3. Add `config.js` using [`config-sample.js`][1].  
Exercise caution while setting source and target elastic hosts (and while editing this file in general).
4. (Optional) Set appropriate values in [`options.js`][2]
5. Run the script
    ```
    node index.js
    ```
    
### Note:
If [`options.consume.byFile`][2] is set to `true`, the documents will be written to a file in a format as expected by the [bulk API][4] of elasticsearch. The path of file must be specified in [`config.js`][1].

If [`options.consume.byElastic`][2] is set to `true`, the documents will be directly added to the target elastic server. The connection details should be present in [`config.js`][1].
    
[1]: /config-sample.js
[2]: /options.js
[3]: https://en.wikipedia.org/wiki/Producer–consumer_problem
[4]: https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-bulk.html
