# elasticsearch-document-transfer
[![npm version](https://badge.fury.io/js/elasticsearch-document-transfer.svg)](https://badge.fury.io/js/elasticsearch-document-transfer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, high-performance, stream-based data transfer and backup pipeline for **Elasticsearch (7.x, 8.x, 9.x)** and **OpenSearch (1.x, 2.x)**.

Stream documents between clusters, sync indices, or dump/restore data to NDJSON / JSONL files with native Node.js stream backpressure, zero buffer bloat, and automatic cursor cleanup.

---

## 📑 Table of Contents
* [Why This Project?](#-why-this-project)
* [Key Features](#-key-features)
* [Installation](#-installation)
* [Quick Start](#-quick-start)
  * [1. CLI with Config File](#1-using-cli-with-a-config-file)
  * [2. CLI with Flags](#2-using-cli-flags-quick-transfer)
  * [3. Programmatic API](#3-programmatic-api)
* [Configuration Reference](#️-configuration-reference)
* [Rules of Thumb (Batch Size & Cursor Mode)](#-rules-of-thumb-setting-batchsize-and-cursormode)
* [Testing](#-testing)
* [License](#-license)

---

## 🌟 Why This Project?

Elasticsearch indices are immutable when modifying existing field types (e.g. changing from `text` to `keyword`, altering analyzers). Re-indexing is mandatory.

While Elasticsearch offers native `_reindex` and snapshots, **a client-side stream pipeline is essential when**:
* **Direct cluster-to-cluster connection is blocked:** Clusters reside in separate VPCs, behind firewalls, or in isolated networks where destination cannot reach source directly.
* **No cluster admin privileges:** You cannot modify `elasticsearch.yml` to whitelist remote hosts (`reindex.remote.whitelist`) or configure S3 snapshot repositories.
* **Local development & offline backups:** You need to dump an index to a compressed `.ndjson.gz` file for local testing, CI fixtures, or Docker seeding.
* **Cross-version / OpenSearch migrations:** Moving data between Elasticsearch and OpenSearch, or across major versions where deprecated mapping types (`_type`) cause native reindexing to fail.

---

## 🚀 Key Features

* **True Stream Pipeline with Backpressure:** Powered by Node.js `stream.Readable`, `stream.Writable`, and `pipeline()`—never accumulates unbounded buffers in memory.
* **Modern Elasticsearch & OpenSearch Support:** Compatible with Elasticsearch 7.x, 8.x, 9.x, and OpenSearch 1.x / 2.x.
* **Cursor-Based Traversal:** Supports **Scroll** (with automatic `clearScroll` cleanup on completion/error) and **`search_after`**.
* **Dual Output Modes:** Stream directly to another Elasticsearch/OpenSearch cluster, to local NDJSON files, or both simultaneously.
* **Automatic Gzip Compression:** Just name your file `.ndjson.gz` or `.jsonl.gz`.
* **Mapping Sync & Sanitizer:** Automatically copies source index mappings and custom analyzers while unwrapping legacy `_type` constructs.
* **Dual Interface:** Use as a global/npx CLI command or import as a Node.js programmatic module.

---

## 📦 Installation

Install globally or as a project dependency:

```bash
# In your project
npm install elasticsearch-document-transfer

# Or run instantly with npx (no install needed!)
npx elasticsearch-document-transfer --help
```

---

## ⚡ Quick Start

### 1. Using CLI with a Config File

1. Create a `config.json` in your working directory (see [`config-sample.json`](file:///home/gaurang/projects/elasticsearch-document-transfer/config-sample.json)):

```json
{
  "source": {
    "node": "http://localhost:9200",
    "index": "my_source_index",
    "batchSize": 500
  },
  "target": {
    "elasticsearch": {
      "enabled": true,
      "node": "http://localhost:9200",
      "index": "my_target_index",
      "importMapping": true
    },
    "file": {
      "enabled": true,
      "filePath": "output/backup.ndjson.gz"
    }
  }
}
```

2. Run the transfer:

```bash
npx elasticsearch-document-transfer
# or if cloned locally:
node index.js
```

### 2. Using CLI Flags (Quick Transfer)

```bash
# Dump index to a compressed file
npx elasticsearch-document-transfer \
  --source-node http://localhost:9200 \
  --source-index users \
  --target-file ./users_backup.ndjson.gz

# Transfer from one cluster to another
npx elasticsearch-document-transfer \
  --source-node https://prod-es.internal:9200 \
  --source-index products \
  --target-node http://localhost:9200 \
  --target-index products_dev \
  --cursor-mode scroll
```

### 3. Programmatic API

```javascript
const { transfer } = require('elasticsearch-document-transfer');

async function run() {
  const result = await transfer({
    source: {
      node: 'https://prod-es.example.com:9200',
      index: 'orders',
      auth: { apiKey: process.env.ES_API_KEY },
      batchSize: 1000,
      cursorMode: 'scroll',
    },
    target: {
      elasticsearch: {
        enabled: true,
        node: 'http://localhost:9200',
        index: 'orders_copy',
        importMapping: true,
      },
      file: {
        enabled: true,
        filePath: './orders_backup.ndjson.gz',
      },
    },
    transform: {
      // Optional: modify or filter documents on the fly
      fn: (doc, count) => {
        if (doc._source.isTest) return null; // filter out test documents
        doc._source.migratedAt = new Date().toISOString();
        return doc;
      },
    },
  });

  console.log(`Transferred ${result.transferred} documents in ${result.durationMs}ms`);
}

run();
```

---

## 🛠️ Configuration Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `source.node` | `string \| string[]` | `'http://localhost:9200'` | Source cluster URL(s) |
| `source.type` | `'elasticsearch' \| 'opensearch'` | `'elasticsearch'` | Client engine |
| `source.index` | `string` | *(required)* | Source index name |
| `source.query` | `object` | `{ match_all: {} }` | Elasticsearch Query DSL filter |
| `source.batchSize` | `number` | `500` | Hits per page |
| `source.cursorMode` | `'scroll' \| 'search_after'` | `'scroll'` | Cursor pagination strategy (`'scroll'` or `'search_after'`) |
| `source.scrollTime` | `string` | `'2m'` | Keep-alive timeout for scroll context |
| `source.auth` | `object` | `undefined` | `{ apiKey }` or `{ username, password }` |
| `source.tls` | `object` | `undefined` | `{ rejectUnauthorized: false, ca: '...' }` |
| `target.elasticsearch.enabled` | `boolean` | `true` | Enable Elasticsearch bulk indexing |
| `target.elasticsearch.node` | `string` | `source.node` | Target cluster URL |
| `target.elasticsearch.index` | `string` | `source.index` | Target index name |
| `target.elasticsearch.batchSize` | `number` | `500` | Bulk batch size |
| `target.elasticsearch.importMapping`| `boolean` | `false` | Sync and sanitize mappings from source |
| `target.file.enabled` | `boolean` | `false` | Enable streaming to disk |
| `target.file.filePath` | `string` | `'output/data.ndjson'` | Output file path (`.gz` triggers gzip) |
| `target.file.format` | `'bulk' \| 'source' \| 'document'` | `'bulk'` | Output file format (`bulk`, `source`, `document`) |

> 📖 **Full Configuration Guide:** See [docs/CONFIGURATION.md](file:///home/gaurang/projects/elasticsearch-document-transfer/docs/CONFIGURATION.md) for deep-dive explanations of all parameters and file formats.

---

## 💡 Rules of Thumb: Setting `batchSize` and `cursorMode`

### Choosing `batchSize`
* **Default (`500`):** Ideal baseline for standard documents (1KB–10KB).
* **Decrease to `100`–`250`:** If documents contain large text blocks, nested objects, or base64 attachments (>50KB each). Prevents exceeding HTTP payload limits.
* **Increase to `1,000`–`2,000`:** If documents are tiny (<1KB) and target cluster has high write capacity.
* **Goal:** Aim for bulk payload batches between **5MB and 15MB** (Elasticsearch's recommended sweet spot).

### Choosing `cursorMode`
* **`scroll` (Recommended Universal Default):**
  * Works reliably across **all** Elasticsearch versions (6.x, 7.x, 8.x, 9.x) and OpenSearch (1.x, 2.x).
  * Automatically applies `_doc` sorting for optimal extraction throughput.
  * Scroll contexts are automatically cleared (`clearScroll`) on completion to avoid memory leaks.
* **`search_after`:**
  * Uses stateless pagination sorted by `_shard_doc`.
  * Recommended when cluster administrators restrict open scroll contexts on busy multi-tenant production clusters.

---

## 🧪 Testing

Run the automated test suite (uses Node.js built-in test runner):

```bash
npm test
```

---

## 📄 License

MIT © [Gaurang Pansare](https://github.com/masquerade817)
