const { transfer } = require('./lib/transfer');
const { MultiWritableStream } = require('./lib/streams/MultiWritableStream');
const { ElasticsearchSourceStream } = require('./lib/streams/ElasticsearchSourceStream');
const { ElasticsearchTargetStream } = require('./lib/streams/ElasticsearchTargetStream');
const { FileTargetStream } = require('./lib/streams/FileTargetStream');
const { DocumentTransformStream } = require('./lib/streams/DocumentTransformStream');
const { createPipeline } = require('./lib/pipeline/pipelineFactory');
const { createClient, pingClient } = require('./lib/client/clientFactory');
const { transferMapping, sanitizeMapping } = require('./lib/mapping/mappingManager');
const { loadConfigFile, normalizeConfig, resolveConfig } = require('./lib/config');

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
  createPipeline,
  createClient,
  pingClient,
  transferMapping,
  sanitizeMapping,
  loadConfigFile,
  normalizeConfig,
  resolveConfig,
  ElasticsearchSourceStream,
  ElasticsearchTargetStream,
  FileTargetStream,
  DocumentTransformStream,
  MultiWritableStream,
};
