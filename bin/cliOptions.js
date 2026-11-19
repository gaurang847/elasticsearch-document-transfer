/**
 * @typedef {Object} CliOptionDefinition
 * @property {string} flags - Option flag signature (e.g. '-c, --config <path>')
 * @property {string} description - Option description for help menu
 * @property {string|number|boolean} [defaultValue] - Default value if not specified
 * @property {Function} [coerce] - Coercion function (e.g. parseInt)
 */

/**
 * @typedef {Object} ParsedCliFlags
 * @property {string} [config] - Path to config file
 * @property {string} [sourceNode] - Source cluster URL
 * @property {string} [sourceIndex] - Source index name
 * @property {string} [targetNode] - Target cluster URL
 * @property {string} [targetIndex] - Target index name
 * @property {string} [targetFile] - Output file path
 * @property {'scroll'|'search_after'} [cursorMode] - Traversal cursor mode
 * @property {number} [batchSize] - Batch size
 * @property {boolean} [silent] - Suppress terminal output
 */

/**
 * Modular CLI option definitions for elasticsearch-document-transfer.
 * @type {CliOptionDefinition[]}
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
