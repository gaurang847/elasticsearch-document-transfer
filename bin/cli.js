#!/usr/bin/env node

const { parseArgs } = require('util');
const path = require('path');
const { transfer } = require('../lib/transfer');
const { loadConfigFile } = require('../lib/config');
const pkg = require('../package.json');

const helpText = `
elasticsearch-document-transfer v${pkg.version}
Stream documents between Elasticsearch / OpenSearch clusters or backup to NDJSON files.

USAGE:
  npx elasticsearch-document-transfer [options]
  node index.js [options]

OPTIONS:
  -c, --config <path>         Path to config.json or config.js file
      --source-node <url>     Source cluster URL (e.g. http://localhost:9200)
      --source-index <name>   Source index name
      --target-node <url>     Target cluster URL
      --target-index <name>   Target index name
      --target-file <path>    Output file path (NDJSON/JSONL, supports .gz)
      --cursor-mode <mode>    'scroll' (default) or 'search_after'
      --batch-size <number>   Batch size for fetching and bulk indexing
      --silent                Suppress progress output
  -v, --version               Show version number
  -h, --help                  Show this help message

EXAMPLES:
  # Run using default config.json in current directory:
  npx elasticsearch-document-transfer

  # Specify a custom config file:
  npx elasticsearch-document-transfer --config ./prod-to-staging.json

  # Override source and target directly:
  npx elasticsearch-document-transfer --source-index users --target-file ./users_backup.ndjson.gz
`;

async function main() {
  const options = {
    config: { type: 'string', short: 'c' },
    'source-node': { type: 'string' },
    'source-index': { type: 'string' },
    'target-node': { type: 'string' },
    'target-index': { type: 'string' },
    'target-file': { type: 'string' },
    'cursor-mode': { type: 'string' },
    'batch-size': { type: 'string' },
    silent: { type: 'boolean' },
    version: { type: 'boolean', short: 'v' },
    help: { type: 'boolean', short: 'h' },
  };

  let parsed;
  try {
    parsed = parseArgs({ options, allowPositionals: true });
  } catch (err) {
    console.error(`Error: ${err.message}\n`);
    console.log(helpText);
    process.exit(1);
  }

  const { values } = parsed;

  if (values.help) {
    console.log(helpText);
    process.exit(0);
  }

  if (values.version) {
    console.log(`v${pkg.version}`);
    process.exit(0);
  }

  let baseConfig = {};
  try {
    baseConfig = loadConfigFile(values.config);
  } catch (err) {
    // If no config file found but CLI flags are passed, construct from flags
    if (!values['source-index']) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  // CLI flag overrides
  if (values['source-node']) {
    baseConfig.source = baseConfig.source || {};
    baseConfig.source.node = values['source-node'];
  }
  if (values['source-index']) {
    baseConfig.source = baseConfig.source || {};
    baseConfig.source.index = values['source-index'];
  }
  if (values['cursor-mode']) {
    baseConfig.source = baseConfig.source || {};
    baseConfig.source.cursorMode = values['cursor-mode'];
  }
  if (values['batch-size']) {
    const size = parseInt(values['batch-size'], 10);
    baseConfig.source = baseConfig.source || {};
    baseConfig.source.batchSize = size;
  }
  if (values['target-node']) {
    baseConfig.target = baseConfig.target || {};
    baseConfig.target.elasticsearch = baseConfig.target.elasticsearch || {};
    baseConfig.target.elasticsearch.node = values['target-node'];
    baseConfig.target.elasticsearch.enabled = true;
  }
  if (values['target-index']) {
    baseConfig.target = baseConfig.target || {};
    baseConfig.target.elasticsearch = baseConfig.target.elasticsearch || {};
    baseConfig.target.elasticsearch.index = values['target-index'];
    baseConfig.target.elasticsearch.enabled = true;
  }
  if (values['target-file']) {
    baseConfig.target = baseConfig.target || {};
    baseConfig.target.file = baseConfig.target.file || {};
    baseConfig.target.file.filePath = values['target-file'];
    baseConfig.target.file.enabled = true;
  }
  if (values.silent) {
    baseConfig.silent = true;
  }

  try {
    await transfer(baseConfig);
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Transfer failed: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
