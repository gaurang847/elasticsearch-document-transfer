/**
 * Sample configuration for elasticsearch-document-transfer
 */
module.exports = {
  // Source configuration
  source: {
    // Cluster URL or array of URLs (can also use 'host')
    node: 'http://localhost:9200',

    // Client type: 'elasticsearch' (default) or 'opensearch'
    type: 'elasticsearch',

    // Source index name (required)
    index: 'my_source_index',

    // Query DSL to filter documents (default: match_all)
    query: {
      match_all: {},
    },

    // Batch size per scroll/search request
    batchSize: 500,

    // Cursor pagination mode: 'scroll' (default) or 'search_after'
    cursorMode: 'scroll',
    scrollTime: '2m',

    // Optional authentication:
    // auth: { apiKey: '...' }
    // auth: { username: 'elastic', password: 'changeme' }

    // Optional TLS options (e.g. self-signed certificates):
    // tls: { rejectUnauthorized: false }
  },

  // Target destinations: you can enable Elasticsearch, File, or both!
  target: {
    // 1. Elasticsearch Target
    elasticsearch: {
      enabled: true,
      node: 'http://localhost:9200',
      type: 'elasticsearch',
      index: 'my_target_index',
      batchSize: 500,

      // Automatically copy and adapt index mapping from source
      importMapping: true,

      // Optional authentication:
      // auth: { apiKey: '...' }
      // auth: { username: 'elastic', password: 'changeme' }
    },

    // 2. File Target (NDJSON / JSONL backup)
    file: {
      enabled: false,
      // File path (adding .gz will automatically compress with gzip)
      filePath: 'output/backup.ndjson.gz',
      // Format: 'bulk' (Elasticsearch bulk format), 'source', or 'document'
      format: 'bulk',
    },
  },

  // Optional document transform / filter hook
  transform: {
    // Custom transform function: return modified doc, or null to filter out
    // fn: (doc, count) => {
    //   if (doc._source.deleted) return null; // skip deleted docs
    //   doc._source.migratedAt = new Date().toISOString();
    //   return doc;
    // }
  },
};
