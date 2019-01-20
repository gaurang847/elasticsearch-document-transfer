# elasticsearch-document-transfer
Simple Node.js script to transfer documents between two elasticsearch servers or between indices of the same elasticsearch server.

Implementation based on [consumer-producer problem][3].  
Since Node.js is single-threaded, `producer` and `consumer` cannot simultaneously access the `buffer`. And hence, as long as the asynchronous nature of Node.js is handled properly, there shouldn't be any issues related to concurrency.

### Usage:
1. Clone the repo.
2. Run `npm install` in the directory.
3. Add `config.js` using [`config-sample.js`][1]
4. (Optional) Set appropriate values in [`options.js`][2]
5. Run the script
    ```
    node index.js
    ```
    
[1]: /config-sample.js
[2]: /options.js
[3]: https://en.wikipedia.org/wiki/Producer–consumer_problem
