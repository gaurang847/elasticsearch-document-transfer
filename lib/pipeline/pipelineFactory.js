const { ElasticsearchSourceStream } = require('../streams/ElasticsearchSourceStream');
const { DocumentTransformStream } = require('../streams/DocumentTransformStream');
const { ElasticsearchTargetStream } = require('../streams/ElasticsearchTargetStream');
const { FileTargetStream } = require('../streams/FileTargetStream');
const { MultiWritableStream } = require('../streams/MultiWritableStream');

/**
 * Creates and connects stream pipeline components according to configuration.
 * @param {Object} options
 * @param {import('../types').TransferConfig} options.config - Normalized transfer configuration
 * @param {import('@elastic/elasticsearch').Client|import('@opensearch-project/opensearch').Client} options.sourceClient - Connected source client
 * @param {import('@elastic/elasticsearch').Client|import('@opensearch-project/opensearch').Client|null} [options.targetClient] - Connected target client
 * @returns {import('../types').PipelineComponents}
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
