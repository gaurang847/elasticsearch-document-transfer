/**
 * Centralized Type Definitions for elasticsearch-document-transfer
 */

/**
 * @typedef {Object} ClientAuthConfig
 * @property {string} [username] - Basic auth username
 * @property {string} [password] - Basic auth password
 * @property {string} [apiKey] - API key string or encoded token
 * @property {string} [bearer] - Bearer token
 */

/**
 * @typedef {Object} ClientTlsConfig
 * @property {boolean} [rejectUnauthorized] - Whether to reject unauthorized SSL/TLS certificates
 * @property {string|Buffer} [ca] - Certificate Authority path or certificate content
 * @property {string|Buffer} [cert] - Client certificate path or content
 * @property {string|Buffer} [key] - Client private key path or content
 */

/**
 * @typedef {Object} EndpointConfig
 * @property {string|string[]} node - Elasticsearch or OpenSearch cluster URL(s)
 * @property {'elasticsearch'|'opensearch'} [type='elasticsearch'] - Target client engine
 * @property {ClientAuthConfig} [auth] - Authentication options
 * @property {string} [username] - Direct basic auth username
 * @property {string} [password] - Direct basic auth password
 * @property {string} [apiKey] - Direct API key
 * @property {ClientTlsConfig} [tls] - TLS/SSL options
 * @property {Record<string, string>} [headers] - Custom HTTP request headers
 * @property {number} [requestTimeout=60000] - Request timeout in milliseconds
 * @property {number} [maxRetries=3] - Maximum retry attempts
 */

/**
 * @typedef {Object} ClusterPingResult
 * @property {boolean} connected - Connection status
 * @property {string} label - Human-readable label (e.g. 'Source')
 * @property {string} version - Cluster version number (e.g. '8.13.4')
 * @property {string} clusterName - Name of the cluster
 * @property {string} distribution - Engine distribution ('elasticsearch' or 'opensearch')
 * @property {Object} raw - Raw info object returned from server
 */

/**
 * @typedef {Object} SourceConfig
 * @property {string|string[]} node - Elasticsearch or OpenSearch cluster URL(s)
 * @property {'elasticsearch'|'opensearch'} [type='elasticsearch'] - Engine type
 * @property {string} index - Source index name
 * @property {Object} [query={ match_all: {} }] - Elasticsearch Query DSL
 * @property {number} [batchSize=500] - Hits per page
 * @property {'scroll'|'search_after'} [cursorMode='scroll'] - Traversal cursor mode
 * @property {string} [scrollTime='2m'] - Scroll context timeout
 * @property {Array} [sort] - Custom sort criteria
 * @property {Array<string>} [sourceFields] - Specific fields to include from source
 * @property {ClientAuthConfig} [auth] - Authentication options
 * @property {string} [username] - Direct basic auth username
 * @property {string} [password] - Direct basic auth password
 * @property {string} [apiKey] - Direct API key
 * @property {ClientTlsConfig} [tls] - TLS/SSL options
 * @property {Record<string, string>} [headers] - Custom HTTP headers
 */

/**
 * @typedef {Object} TargetElasticsearchConfig
 * @property {boolean} [enabled=false] - Whether Elasticsearch target is active
 * @property {string|string[]} [node] - Target cluster URL(s)
 * @property {'elasticsearch'|'opensearch'} [type='elasticsearch'] - Target engine type
 * @property {string} [index] - Target index name
 * @property {number} [batchSize=500] - Bulk batch size
 * @property {boolean} [importMapping=false] - Whether to replicate index mappings
 * @property {'index'|'create'|'update'} [action='index'] - Bulk action
 * @property {number} [maxRetries=3] - Maximum retry attempts
 * @property {number} [retryDelayMs=1000] - Base delay between retries
 * @property {ClientAuthConfig} [auth] - Authentication options
 * @property {string} [username] - Direct basic auth username
 * @property {string} [password] - Direct basic auth password
 * @property {string} [apiKey] - Direct API key
 * @property {ClientTlsConfig} [tls] - TLS/SSL options
 * @property {Record<string, string>} [headers] - Custom HTTP headers
 */

/**
 * @typedef {'bulk'|'source'|'document'} FileOutputFormat
 */

/**
 * @typedef {Object} TargetFileConfig
 * @property {boolean} [enabled=false] - Whether file target is active
 * @property {string} [filePath='output/data.ndjson'] - Output file path
 * @property {string} [dirPath] - Optional directory path
 * @property {FileOutputFormat} [format='bulk'] - Line format
 * @property {boolean} [gzip] - Force gzip compression
 */

/**
 * @typedef {Object} TargetConfig
 * @property {TargetElasticsearchConfig} [elasticsearch] - Target Elasticsearch settings
 * @property {TargetFileConfig} [file] - Target file settings
 */

/**
 * @typedef {Object} TransformedDocument
 * @property {string} [_id] - Document ID
 * @property {string} [_index] - Index name
 * @property {Object} _source - Document data
 * @property {Object} [_original] - Original hit object
 */

/**
 * @typedef {Object} TransformConfig
 * @property {(doc: TransformedDocument, count: number) => TransformedDocument|null|Promise<TransformedDocument|null>} [fn] - Custom transformer/filter
 * @property {(hit: Object, count: number) => string} [customId] - Custom ID generator
 */

/**
 * @typedef {Object} TransferConfig
 * @property {SourceConfig} source - Source configuration
 * @property {TargetConfig} target - Target configurations
 * @property {TransformConfig} [transform] - Optional document transformation
 * @property {boolean} [silent=false] - Suppress console output
 */

/**
 * @typedef {Object} TransferSummary
 * @property {boolean} success - Whether the transfer completed successfully
 * @property {number} transferred - Total number of documents successfully transferred
 * @property {number} failed - Total number of documents that failed indexing
 * @property {number} durationMs - Elapsed execution time in milliseconds
 */

/**
 * @typedef {Object} PipelineComponents
 * @property {import('./streams/ElasticsearchSourceStream').ElasticsearchSourceStream} sourceStream - Readable source stream
 * @property {import('./streams/DocumentTransformStream').DocumentTransformStream} transformStream - Transform stream
 * @property {import('node:stream').Writable} compositeTarget - Writable target or composite multi-writable
 * @property {import('./streams/ElasticsearchTargetStream').ElasticsearchTargetStream|null} elasticTargetStream - Elasticsearch writable stream (if enabled)
 * @property {import('./streams/FileTargetStream').FileTargetStream|null} fileTargetStream - File writable stream (if enabled)
 */

module.exports = {};
