const { transfer, MultiWritableStream } = require('./lib/transfer');
const { ElasticsearchSourceStream } = require('./lib/streams/ElasticsearchSourceStream');
const { ElasticsearchTargetStream } = require('./lib/streams/ElasticsearchTargetStream');
const { FileTargetStream } = require('./lib/streams/FileTargetStream');
const { DocumentTransformStream } = require('./lib/streams/DocumentTransformStream');
const { createClient, pingClient } = require('./lib/client/clientFactory');
const { transferMapping, sanitizeMapping } = require('./lib/mapping/mappingManager');
const { loadConfigFile, normalizeConfig } = require('./lib/config');

// If executed directly via `node index.js`
if (require.main === module) {
  (async () => {
    try {
      await transfer();
      process.exit(0);
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}`);
      if (process.env.DEBUG) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = {
  transfer,
  createClient,
  pingClient,
  transferMapping,
  sanitizeMapping,
  loadConfigFile,
  normalizeConfig,
  ElasticsearchSourceStream,
  ElasticsearchTargetStream,
  FileTargetStream,
  DocumentTransformStream,
  MultiWritableStream,
};
