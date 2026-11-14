const { pipeline } = require('stream/promises');
const { Writable } = require('stream');

const { createClient, pingClient } = require('./client/clientFactory');
const { ElasticsearchSourceStream } = require('./streams/ElasticsearchSourceStream');
const { ElasticsearchTargetStream } = require('./streams/ElasticsearchTargetStream');
const { FileTargetStream } = require('./streams/FileTargetStream');
const { DocumentTransformStream } = require('./streams/DocumentTransformStream');
const { transferMapping } = require('./mapping/mappingManager');
const { ProgressTracker } = require('./progress/progressTracker');
const { normalizeConfig, loadConfigFile } = require('./config');

/**
 * Composite writable stream to broadcast documents to multiple targets simultaneously
 * while preserving unified backpressure.
 */
class MultiWritableStream extends Writable {
  constructor(targets, options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 1000 });
    this.targets = targets;
  }

  _write(chunk, encoding, callback) {
    let pending = this.targets.length;
    let firstError = null;

    for (const target of this.targets) {
      target.write(chunk, encoding, err => {
        if (err && !firstError) firstError = err;
        pending--;
        if (pending === 0) {
          callback(firstError);
        }
      });
    }
  }

  _final(callback) {
    let pending = this.targets.length;
    let firstError = null;

    for (const target of this.targets) {
      target.end(err => {
        if (err && !firstError) firstError = err;
        pending--;
        if (pending === 0) {
          callback(firstError);
        }
      });
    }
  }

  _destroy(err, callback) {
    for (const target of this.targets) {
      target.destroy(err);
    }
    callback(err);
  }
}

/**
 * Executes a full document transfer pipeline.
 * @param {Object|string} [configOrPath] - Configuration object or file path
 * @param {Object} [legacyOptions] - Optional legacy options object (for backwards compatibility)
 * @returns {Promise<Object>} Transfer execution summary
 */
async function transfer(configOrPath = {}, legacyOptions = {}) {
  // 1. Resolve configuration
  let rawConfig;
  if (typeof configOrPath === 'string') {
    rawConfig = loadConfigFile(configOrPath);
  } else if (Object.keys(configOrPath).length === 0) {
    try {
      rawConfig = loadConfigFile();
    } catch (_) {
      rawConfig = configOrPath;
    }
  } else {
    rawConfig = configOrPath;
  }

  const config = normalizeConfig(rawConfig, legacyOptions);
  const startTime = Date.now();

  const tracker = new ProgressTracker({
    label: `Transferring [${config.source.index}]`,
    silent: config.silent,
  });

  if (!config.silent) {
    console.log(`\n🚀 Starting Elasticsearch Document Transfer`);
    console.log(`Source Index: ${config.source.index}`);
    if (config.target.elasticsearch.enabled) {
      console.log(`Target Index: ${config.target.elasticsearch.index}`);
    }
    if (config.target.file.enabled) {
      console.log(`Target File:  ${config.target.file.filePath}`);
    }
    console.log(``);
  }

  // 2. Initialize Clients
  const sourceClient = createClient(config.source);
  const sourcePing = await pingClient(sourceClient, 'Source');

  if (!config.silent) {
    console.log(`✓ Connected to Source: ${sourcePing.distribution} v${sourcePing.version} (${sourcePing.clusterName})`);
  }

  let targetClient = null;
  if (config.target.elasticsearch.enabled) {
    targetClient = createClient(config.target.elasticsearch);
    const targetPing = await pingClient(targetClient, 'Target');
    if (!config.silent) {
      console.log(`✓ Connected to Target: ${targetPing.distribution} v${targetPing.version} (${targetPing.clusterName})`);
    }

    // 3. Optional Mapping Transfer
    if (config.target.elasticsearch.importMapping) {
      if (!config.silent) {
        console.log(`Syncing index mapping from source to target...`);
      }
      await transferMapping({
        sourceClient,
        targetClient,
        sourceIndex: config.source.index,
        targetIndex: config.target.elasticsearch.index,
      });
      if (!config.silent) {
        console.log(`✓ Mapping synced successfully.`);
      }
    }
  }

  // 4. Instantiate Streams
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

  const targets = [];

  let elasticTargetStream = null;
  if (config.target.elasticsearch.enabled) {
    elasticTargetStream = new ElasticsearchTargetStream({
      client: targetClient,
      batchSize: config.target.elasticsearch.batchSize,
      action: config.target.elasticsearch.action,
      maxRetries: config.target.elasticsearch.maxRetries,
      retryDelayMs: config.target.elasticsearch.retryDelayMs,
    });
    targets.push(elasticTargetStream);
  }

  let fileTargetStream = null;
  if (config.target.file.enabled) {
    fileTargetStream = new FileTargetStream({
      filePath: config.target.file.filePath,
      dirPath: config.target.file.dirPath,
      format: config.target.file.format,
      gzip: config.target.file.gzip,
    });
    targets.push(fileTargetStream);
  }

  const compositeTarget = targets.length === 1 ? targets[0] : new MultiWritableStream(targets);

  // 5. Connect Tracker Events
  sourceStream.on('totalHits', total => {
    tracker.setTotal(total);
  });

  if (elasticTargetStream) {
    elasticTargetStream.on('batch', info => {
      tracker.update({
        transferred: info.totalTransferred,
        failed: info.totalFailed,
      });
    });
  } else if (fileTargetStream) {
    // When only file output is enabled
    sourceStream.on('data', () => {
      tracker.update({
        transferred: fileTargetStream.writtenCount,
        failed: 0,
      });
    });
  }

  tracker.start();

  // 6. Execute Pipeline with Backpressure
  try {
    await pipeline(sourceStream, transformStream, compositeTarget);
  } finally {
    tracker.finish();
  }

  const durationMs = Date.now() - startTime;
  return {
    success: true,
    transferred: tracker.transferredCount,
    failed: tracker.failedCount,
    durationMs,
  };
}

module.exports = {
  transfer,
  MultiWritableStream,
};
