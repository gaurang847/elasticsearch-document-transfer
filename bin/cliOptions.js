/**
 * Modular CLI option definitions for elasticsearch-document-transfer.
 * @type {import('../lib/types').CliOptionDefinition[]}
 */
const cliOptions = [
  {
    flags: '-c, --config <path>',
    description: 'Path to config.json or config.js file',
  },
  {
    flags: '--source-node <url>',
    description: 'Source Elasticsearch/OpenSearch cluster URL (e.g. http://localhost:9200)',
  },
  {
    flags: '--source-index <name>',
    description: 'Source index name',
  },
  {
    flags: '--target-node <url>',
    description: 'Target Elasticsearch/OpenSearch cluster URL',
  },
  {
    flags: '--target-index <name>',
    description: 'Target index name',
  },
  {
    flags: '--target-file <path>',
    description: 'Output file path (NDJSON format; .gz extension enables gzip)',
  },
  {
    flags: '--cursor-mode <mode>',
    description: 'Cursor pagination strategy: "scroll" or "search_after"',
    defaultValue: 'scroll',
  },
  {
    flags: '--batch-size <number>',
    description: 'Batch size for document fetching and bulk indexing',
    coerce: value => parseInt(value, 10),
  },
  {
    flags: '--silent',
    description: 'Suppress interactive terminal progress output',
    defaultValue: false,
  },
];

module.exports = {
  cliOptions,
};
