const { pipeline } = require('node:stream/promises');

const { createClient, pingClient } = require('./client/clientFactory');
const { createPipeline } = require('./pipeline/pipelineFactory');
const { transferMapping } = require('./mapping/mappingManager');
const { ProgressTracker } = require('./progress/progressTracker');
const { normalizeConfig, loadConfigFile } = require('./config');

/**
 * @typedef {Object} TransferSummary
 * @property {boolean} success - Whether the transfer completed successfully
 * @property {number} transferred - Total number of documents successfully transferred
 * @property {number} failed - Total number of documents that failed indexing
 * @property {number} durationMs - Elapsed execution time in milliseconds
 */

/**
 * Coordinates and executes the Elasticsearch/OpenSearch document transfer pipeline.
 * @param {import('./config').TransferConfig|string} [configOrPath] - Configuration object or file path
 * @returns {Promise<TransferSummary>} Transfer execution summary
 */
async function transfer(configOrPath = {}) {
  // 1. Resolve and normalize configuration
  let rawConfig;
  if (typeof configOrPath === 'string') {
    rawConfig = await loadConfigFile(configOrPath);
  } else if (!configOrPath || Object.keys(configOrPath).length === 0) {
    try {
      rawConfig = await loadConfigFile();
    } catch {
      rawConfig = configOrPath || {};
    }
  } else {
    rawConfig = configOrPath;
  }

  const config = normalizeConfig(rawConfig);
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
    console.log('');
  }

  // 2. Initialize and verify source client
  const sourceClient = await createClient(config.source);
  const sourcePing = await pingClient(sourceClient, 'Source');

  if (!config.silent) {
    console.log(`✓ Connected to Source: ${sourcePing.distribution} v${sourcePing.version} (${sourcePing.clusterName})`);
  }

  // 3. Initialize target client and sync mappings if needed
  let targetClient = null;
  if (config.target.elasticsearch.enabled) {
    targetClient = await createClient(config.target.elasticsearch);
    const targetPing = await pingClient(targetClient, 'Target');

    if (!config.silent) {
      console.log(`✓ Connected to Target: ${targetPing.distribution} v${targetPing.version} (${targetPing.clusterName})`);
    }

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

  // 4. Construct stream pipeline components
  const {
    sourceStream,
    transformStream,
    compositeTarget,
    elasticTargetStream,
    fileTargetStream,
  } = createPipeline({
    config,
    sourceClient,
    targetClient,
  });

  // 5. Connect progress tracker events
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
    sourceStream.on('data', () => {
      tracker.update({
        transferred: fileTargetStream.writtenCount,
        failed: 0,
      });
    });
  }

  tracker.start();

  // 6. Execute pipeline with native stream backpressure
  try {
    await pipeline(sourceStream, transformStream, compositeTarget);
  } finally {
    tracker.finish();
  }

  return {
    success: true,
    transferred: tracker.transferredCount,
    failed: tracker.failedCount,
    durationMs: Date.now() - startTime,
  };
}

module.exports = {
  transfer,
};
