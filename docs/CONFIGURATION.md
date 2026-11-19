# Configuration Reference & Guide

This document provides a complete guide for all configuration options supported by `elasticsearch-document-transfer` in `config.json` or `config.js`.

---

## Table of Contents
* [Source Options (`source`)](#source-options)
* [Target Elasticsearch Options (`target.elasticsearch`)](#target-elasticsearch-options)
* [Target File Options (`target.file`)](#target-file-options)
  * [File Formats Explained (`bulk` vs `source` vs `document`)](#file-formats-explained)
* [Transform Hooks (`transform`)](#transform-hooks)
* [Rules of Thumb: Performance Tuning](#rules-of-thumb-performance-tuning)

---

## Source Options

Configures the source Elasticsearch or OpenSearch cluster from which documents are fetched.

```json
{
  "source": {
    "node": "http://localhost:9200",
    "type": "elasticsearch",
    "index": "my_source_index",
    "query": { "match_all": {} },
    "batchSize": 500,
    "cursorMode": "scroll",
    "scrollTime": "2m"
  }
}
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `node` | `string \| string[]` | **(required)** | URL or array of URLs of the source cluster (e.g. `http://localhost:9200` or `https://es.example.com:9200`). |
| `type` | `'elasticsearch' \| 'opensearch'` | `'elasticsearch'` | Client engine. Set to `'opensearch'` when connecting to Amazon OpenSearch Service or OpenSearch clusters. |
| `index` | `string` | **(required)** | Source index name to read from. |
| `query` | `object` | `{ match_all: {} }` | Elasticsearch Query DSL filter. Use this to transfer only a subset of documents (e.g. `{ "term": { "status": "active" } }`). |
| `batchSize` | `number` | `500` | Number of documents returned per scroll/search request. See [Rules of Thumb](#rules-of-thumb-performance-tuning). |
| `cursorMode` | `'scroll' \| 'search_after'` | `'scroll'` | Cursor pagination strategy. See [Rules of Thumb](#rules-of-thumb-performance-tuning). |
| `scrollTime` | `string` | `'2m'` | Keep-alive timeout for the scroll context on the cluster. The context is automatically freed via `clearScroll` on completion. |
| `sort` | `array` | `['_doc']` / `['_shard_doc']` | Custom sort order for document extraction. |
| `sourceFields` | `string[]` | `undefined` | Specific fields to include from `_source`. Omit to extract all fields. |
| `auth.apiKey` | `string` | `undefined` | Elastic API Key authentication token. |
| `auth.username` / `auth.password` | `string` | `undefined` | Basic authentication credentials. |
| `tls.rejectUnauthorized` | `boolean` | `true` | Set to `false` when connecting to clusters using self-signed development SSL certificates. |
| `tls.ca` | `string` | `undefined` | Path to custom CA certificate file or raw certificate PEM string. |
| `headers` | `object` | `undefined` | Custom HTTP headers sent with every request. |

---

## Target Elasticsearch Options

Configures writing documents into another Elasticsearch or OpenSearch cluster via the `_bulk` API.

```json
{
  "target": {
    "elasticsearch": {
      "enabled": true,
      "node": "http://localhost:9200",
      "index": "my_target_index",
      "batchSize": 500,
      "importMapping": true,
      "action": "index"
    }
  }
}
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` (if `node` given) | Set to `false` to disable writing to Elasticsearch (e.g. when backing up to file only). |
| `node` | `string \| string[]` | `source.node` | Target cluster URL(s). Defaults to the source node if transferring across indices on the same cluster. |
| `type` | `'elasticsearch' \| 'opensearch'` | `source.type` | Target cluster engine. |
| `index` | `string` | `source.index` | Target index name where documents will be inserted. |
| `batchSize` | `number` | `500` | Number of documents accumulated before sending a POST `_bulk` request. |
| `importMapping` | `boolean` | `false` | If `true`, automatically fetches source index mappings and custom analyzers, unwraps legacy types, and creates/updates the target index. |
| `action` | `'index' \| 'create' \| 'update'` | `'index'` | Bulk action type. `'index'` inserts or replaces; `'create'` fails if doc `_id` already exists. |
| `maxRetries` | `number` | `3` | Number of retry attempts on transient bulk network errors. |
| `retryDelayMs` | `number` | `1000` | Base delay for exponential backoff between retries. |

---

## Target File Options

Configures streaming documents directly to a local file.

```json
{
  "target": {
    "file": {
      "enabled": true,
      "filePath": "output/backup.ndjson.gz",
      "format": "bulk"
    }
  }
}
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` (if `filePath` given) | Set to `true` to enable streaming documents to disk. |
| `filePath` | `string` | `'output/data.ndjson'` | Output file path. If the path ends in `.gz`, gzip compression is automatically applied on the fly. |
| `dirPath` | `string` | `undefined` | Optional directory prefix. Directories are created recursively if they do not exist. |
| `format` | `'bulk' \| 'source' \| 'document'` | `'bulk'` | Output document structure per line. |
| `gzip` | `boolean` | auto | Explicitly toggle gzip compression (defaults to `true` if filename ends with `.gz`). |

---

### File Formats Explained

The `file.format` setting dictates how documents are structured in the output file:

#### 1. `'bulk'` (Default — Elasticsearch Bulk Format)
Generates alternating lines: an action header line followed by the source document line.
```json
{"index":{"_index":"target_test_index","_id":"item-1"}}
{"id":"item-1","title":"Product #1","price":1.5}
{"index":{"_index":"target_test_index","_id":"item-2"}}
{"id":"item-2","title":"Product #2","price":3.0}
```
* **Best used for:** Backups intended to be restored back into Elasticsearch or OpenSearch. You can directly ingest this file using `curl` or our script:
  ```bash
  curl -s -H "Content-Type: application/x-ndjson" -XPOST "http://localhost:9200/_bulk" --data-binary "@backup.ndjson"
  ```

#### 2. `'source'` (Clean JSON Lines / JSONL)
Outputs only the raw document data payload (`_source`), one JSON object per line. No Elasticsearch metadata headers.
```json
{"id":"item-1","title":"Product #1","price":1.5}
{"id":"item-2","title":"Product #2","price":3.0}
```
* **Best used for:** Data analysis, machine learning pipelines, or exporting data to Python / Pandas, Apache Spark, DuckDB, or Google BigQuery where Elasticsearch metadata (`{"index": ...}`) is unnecessary noise.

#### 3. `'document'` (Enveloped Document)
Outputs one complete JSON object per line containing the document ID, index name, and source payload.
```json
{"_index":"target_test_index","_id":"item-1","_source":{"id":"item-1","title":"Product #1","price":1.5}}
{"_index":"target_test_index","_id":"item-2","_source":{"id":"item-2","title":"Product #2","price":3.0}}
```
* **Best used for:** Long-term archival, auditing, or debugging where you want the original `_id` and `_index` preserved within each JSON line, but don't need the alternating `_bulk` action commands.

---

## Transform Hooks

Available in `config.js` or via the programmatic API:

```javascript
module.exports = {
  source: { /* ... */ },
  target: { /* ... */ },
  transform: {
    // Modify fields or filter documents on the fly
    fn: (doc, count) => {
      // Returning null or false filters the document out
      if (doc._source.isDeleted) return null;

      // Add or transform fields
      doc._source.transferredAt = new Date().toISOString();
      return doc;
    },

    // Custom ID generator (default preserves original source _id)
    customId: (hit, count) => {
      return `custom-prefix-${hit._id}`;
    }
  }
};
```

---

## Rules of Thumb: Performance Tuning

### Setting `batchSize`
* **Default (500):** Suitable for standard JSON documents (1KB to 10KB in size).
* **Decrease to 100–250:** If your documents have very large text fields, embedded base64 data, or large arrays (>50KB per doc). Keeps HTTP request bodies under the recommended 10MB limit.
* **Increase to 1,000–2,000:** If documents are tiny (<1KB each) and your target cluster has high ingestion capacity (e.g. multiple data nodes).
* **Elasticsearch Sweet Spot:** Target bulk payload sizes between **5MB and 15MB**.

### Choosing `cursorMode`
* **`scroll` (Recommended Default):**
  * Works uniformly across **all** Elasticsearch versions (ES 6.x, 7.x, 8.x, 9.x) and OpenSearch (1.x, 2.x).
  * Automatically sorts by `_doc` for the fastest extraction speed.
  * Our engine automatically calls `clearScroll` on completion to prevent memory leaks on your cluster.
* **`search_after`:**
  * Uses stateless pagination sorted by `_shard_doc`.
  * Best used when cluster administrators restrict long-running scroll contexts on heavily loaded production clusters.
