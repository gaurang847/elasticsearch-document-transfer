#!/usr/bin/env node

const { Command } = require('commander');
const { cliOptions } = require('./cliOptions');
const { transfer } = require('../lib/transfer');
const { loadConfigFile } = require('../lib/config');
const pkg = require('../package.json');

/**
 * Merges CLI flags over file-based configuration.
 * @param {import('../lib/types').TransferConfig} baseConfig - Loaded configuration object
 * @param {import('./cliOptions').ParsedCliFlags} cliFlags - Parsed CLI options from Commander
 * @returns {import('../lib/types').TransferConfig} Combined configuration
 */
function mergeCliOverrides(baseConfig, cliFlags) {
  const merged = { ...baseConfig };

  if (cliFlags.sourceNode || cliFlags.sourceIndex || cliFlags.cursorMode || cliFlags.batchSize) {
    merged.source = merged.source || {};
    if (cliFlags.sourceNode) merged.source.node = cliFlags.sourceNode;
    if (cliFlags.sourceIndex) merged.source.index = cliFlags.sourceIndex;
    if (cliFlags.cursorMode) merged.source.cursorMode = cliFlags.cursorMode;
    if (cliFlags.batchSize) merged.source.batchSize = cliFlags.batchSize;
  }

  if (cliFlags.targetNode || cliFlags.targetIndex) {
    merged.target = merged.target || {};
    merged.target.elasticsearch = merged.target.elasticsearch || {};
    merged.target.elasticsearch.enabled = true;
    if (cliFlags.targetNode) merged.target.elasticsearch.node = cliFlags.targetNode;
    if (cliFlags.targetIndex) merged.target.elasticsearch.index = cliFlags.targetIndex;
  }

  if (cliFlags.targetFile) {
    merged.target = merged.target || {};
    merged.target.file = merged.target.file || {};
    merged.target.file.enabled = true;
    merged.target.file.filePath = cliFlags.targetFile;
  }

  if (cliFlags.silent) {
    merged.silent = true;
  }

  return merged;
}

const program = new Command();

program
  .name('elasticsearch-document-transfer')
  .description('Stream documents between Elasticsearch/OpenSearch clusters or backup to NDJSON files')
  .version(pkg.version, '-v, --version', 'Output the current version');

// Register modular options
for (const opt of cliOptions) {
  if (opt.coerce) {
    program.option(opt.flags, opt.description, opt.coerce, opt.defaultValue);
  } else {
    program.option(opt.flags, opt.description, opt.defaultValue);
  }
}

program.action(async options => {
  let config = {};

  try {
    config = await loadConfigFile(options.config);
  } catch (err) {
    // If no config file found but CLI flags provide required source info, continue
    if (!options.sourceIndex) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  const finalConfig = mergeCliOverrides(config, options);

  try {
    await transfer(finalConfig);
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Transfer failed: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
});

program.parse(process.argv);
