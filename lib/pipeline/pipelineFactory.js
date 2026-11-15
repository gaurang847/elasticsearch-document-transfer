const { ElasticsearchSourceStream } = require('../streams/ElasticsearchSourceStream');
const { DocumentTransformStream } = require('../streams/DocumentTransformStream');
const { ElasticsearchTargetStream } = require('../streams/ElasticsearchTargetStream');
const { FileTargetStream } = require('../streams/FileTargetStream');
const { MultiWritableStream } = require('../streams/MultiWritableStream');

/**
 * @typedef {Object} PipelineComponents
 * @property {ElasticsearchSourceStream} sourceStream - Readable source stream
 * @property {DocumentTransformStream} transformStream - Transform stream
 * @property {import('node:stream').Writable} compositeTarget - Writable target or composite multi-writable
 * @property {ElasticsearchTargetStream|null} elasticTargetStream - Elasticsearch writable stream (if enabled)
 * @property {FileTargetStream|null} fileTargetStream - File writable stream (if enabled)
 */

/**
 * Creates and connects stream pipeline components according to configuration.
 * @param {Object} options
 * @param {import('../config').TransferConfig} options.config - Normalized transfer configuration
 * @param {Object} options.sourceClient - Connected source Elasticsearch/OpenSearch client
 * @param {Object|null} [options.targetClient] - Connected target Elasticsearch/OpenSearch client
 * @returns {PipelineComponents}
 */
function createPipeline({ config, sourceClient, targetClient }) {
  const sourceStream = new ElasticsearchSourceStream({
    client: sourceClient,
    index: config.source.index,
    query: config.source.query,
    batchSize: config.source.batchSize,
    cursorMode: config.source.cursorMode,
    scrollTime: config.source.scrollTime,
    sort: config.source.sort,
    sourceFields: config.source.sourceFields,
  });

  const transformStream = new DocumentTransformStream({
    targetIndex: config.target.elasticsearch.enabled ? config.target.elasticsearch.index : undefined,
    useDocCountAsId: config.target.elasticsearch.useDocCountAsId,
    stripType: true,
    transform: config.transform.fn,
    customId: config.transform.customId,
  });

  const targetStreams = [];
  let elasticTargetStream = null;
  let fileTargetStream = null;

  if (config.target.elasticsearch.enabled && targetClient) {
    elasticTargetStream = new ElasticsearchTargetStream({
      client: targetClient,
      batchSize: config.target.elasticsearch.batchSize,
      action: config.target.elasticsearch.action,
      maxRetries: config.target.elasticsearch.maxRetries,
      retryDelayMs: config.target.elasticsearch.retryDelayMs,
    });
    targetStreams.push(elasticTargetStream);
  }

  if (config.target.file.enabled) {
    fileTargetStream = new FileTargetStream({
      filePath: config.target.file.filePath,
      dirPath: config.target.file.dirPath,
      format: config.target.file.format,
      gzip: config.target.file.gzip,
    });
    targetStreams.push(fileTargetStream);
  }

  if (targetStreams.length === 0) {
    throw new Error('Pipeline error: No valid target stream configured');
  }

  const compositeTarget = targetStreams.length === 1
    ? targetStreams[0]
    : new MultiWritableStream(targetStreams);

  return {
    sourceStream,
    transformStream,
    compositeTarget,
    elasticTargetStream,
    fileTargetStream,
  };
}

module.exports = {
  createPipeline,
};
