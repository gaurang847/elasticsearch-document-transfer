const { pipeline } = require('node:stream/promises');

const { createClient, pingClient } = require('./client/clientFactory');
const { createPipeline } = require('./pipeline/pipelineFactory');
const { transferMapping } = require('./mapping/mappingManager');
const { ProgressTracker } = require('./progress/progressTracker');
const { resolveConfig } = require('./config');

/**
 * Coordinates and executes the Elasticsearch/OpenSearch document transfer pipeline.
 * @param {import('./types').TransferConfig|string} [configOrPath] - Configuration object or file path
 * @returns {Promise<import('./types').TransferSummary>} Transfer execution summary
 */
async function transfer(configOrPath = {}) {
  const config = await resolveConfig(configOrPath);
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

  // 1. Initialize and verify source client
  const sourceClient = await createClient(config.source);
  const sourcePing = await pingClient(sourceClient, 'Source');

  if (!config.silent) {
    console.log(`✓ Connected to Source: ${sourcePing.distribution} v${sourcePing.version} (${sourcePing.clusterName})`);
  }

  // 2. Initialize target client and sync mappings if needed
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

  // 3. Construct stream pipeline components
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

  // 4. Connect progress tracker events
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

  // 5. Execute pipeline with native stream backpressure
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
