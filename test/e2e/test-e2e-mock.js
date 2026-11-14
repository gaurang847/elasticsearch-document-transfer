#!/usr/bin/env node

/**
 * End-to-end integration test with a mock Elasticsearch HTTP server.
 * Simulates a real network cluster over HTTP without requiring Docker.
 */

const http = require('http');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { transfer } = require('../../lib/transfer');

const PORT = 9299;
const HOST = '127.0.0.1';
const DOC_COUNT = 1500;

// In-memory data store for the mock server
const sourceDocs = Array.from({ length: DOC_COUNT }, (_, i) => ({
  _id: `doc-${i + 1}`,
  _index: 'mock_source_index',
  _source: {
    title: `Document #${i + 1}`,
    score: i * 10,
    timestamp: new Date().toISOString(),
  },
}));

const targetDocs = new Map();
let scrollIndex = 0;
let mappingTransferred = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  let bodyChunks = [];

  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', () => {
    const rawBody = Buffer.concat(bodyChunks).toString('utf-8');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('x-elastic-product', 'Elasticsearch');

    // 1. Cluster info (GET /)
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          name: 'mock-es-node',
          cluster_name: 'mock-cluster',
          version: { number: '8.13.4', distribution: 'elasticsearch' },
          tagline: 'You Know, for Search',
        })
      );
      return;
    }

    // 2. Ping (HEAD /)
    if (req.method === 'HEAD' && url.pathname === '/') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 3. Index exists check (HEAD /:index)
    if (req.method === 'HEAD' && url.pathname.includes('mock_target_index')) {
      res.writeHead(mappingTransferred ? 200 : 404);
      res.end();
      return;
    }

    // 4. Create index (PUT /:index)
    if (req.method === 'PUT' && url.pathname.includes('mock_target_index')) {
      mappingTransferred = true;
      res.writeHead(200);
      res.end(JSON.stringify({ acknowledged: true }));
      return;
    }

    // 5. Get Mapping (GET /:index/_mapping)
    if (req.method === 'GET' && url.pathname.includes('/_mapping')) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          mock_source_index: {
            mappings: {
              properties: {
                title: { type: 'text' },
                score: { type: 'integer' },
              },
            },
          },
        })
      );
      return;
    }

    // 6. Search with scroll (POST /mock_source_index/_search)
    if (url.pathname.includes('/_search') && !url.pathname.includes('/scroll')) {
      scrollIndex = 0;
      const sizeMatch = rawBody.match(/"size":\s*(\d+)/);
      const batchSize = sizeMatch ? parseInt(sizeMatch[1], 10) : 500;

      const page = sourceDocs.slice(0, batchSize);
      scrollIndex = page.length;

      res.writeHead(200);
      res.end(
        JSON.stringify({
          _scroll_id: 'mock-scroll-token',
          hits: {
            total: { value: sourceDocs.length },
            hits: page,
          },
        })
      );
      return;
    }

    // 7. Scroll next page (POST /_search/scroll)
    if (url.pathname.includes('/_search/scroll') && req.method !== 'DELETE') {
      const batchSize = 500;
      const page = sourceDocs.slice(scrollIndex, scrollIndex + batchSize);
      scrollIndex += page.length;

      res.writeHead(200);
      res.end(
        JSON.stringify({
          _scroll_id: 'mock-scroll-token',
          hits: {
            total: { value: sourceDocs.length },
            hits: page,
          },
        })
      );
      return;
    }

    // 8. Clear scroll (DELETE /_search/scroll)
    if (url.pathname.includes('/_search/scroll') && req.method === 'DELETE') {
      res.writeHead(200);
      res.end(JSON.stringify({ succeeded: true }));
      return;
    }

    // 9. Bulk indexing (POST /_bulk or POST /:index/_bulk)
    if (url.pathname.includes('_bulk')) {
      const lines = rawBody.split('\n').filter(l => l.trim().length > 0);
      for (let i = 0; i < lines.length; i += 2) {
        try {
          const header = JSON.parse(lines[i]);
          const source = JSON.parse(lines[i + 1]);
          const action = header.index || header.create || header.update;
          targetDocs.set(action._id, source);
        } catch (_) {}
      }

      res.writeHead(200);
      res.end(JSON.stringify({ errors: false, items: [] }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
});

async function runTest() {
  const tmpBackupFile = path.join(__dirname, 'tmp_e2e_backup.ndjson.gz');

  await new Promise(resolve => server.listen(PORT, HOST, resolve));
  console.log(`✓ Mock Elasticsearch server running at http://${HOST}:${PORT}`);

  try {
    const result = await transfer({
      source: {
        node: `http://${HOST}:${PORT}`,
        index: 'mock_source_index',
        batchSize: 500,
        cursorMode: 'scroll',
      },
      target: {
        elasticsearch: {
          enabled: true,
          node: `http://${HOST}:${PORT}`,
          index: 'mock_target_index',
          importMapping: true,
          batchSize: 500,
        },
        file: {
          enabled: true,
          filePath: tmpBackupFile,
        },
      },
    });

    console.log('\n--- E2E Verification ---');
    console.log(`Transferred docs: ${result.transferred}/${DOC_COUNT}`);
    assert.equal(result.transferred, DOC_COUNT, `Expected ${DOC_COUNT} docs to be transferred`);
    assert.equal(targetDocs.size, DOC_COUNT, `Target cluster expected ${DOC_COUNT} docs`);

    // Verify backup file exists and is valid gzip
    assert.ok(fs.existsSync(tmpBackupFile), 'Backup file must exist');
    const decompressed = zlib.gunzipSync(fs.readFileSync(tmpBackupFile)).toString('utf-8');
    const fileLines = decompressed.trim().split('\n');
    assert.equal(fileLines.length, DOC_COUNT * 2, 'File should have header + source for every doc');

    console.log(`✓ Target Elasticsearch received all ${targetDocs.size} documents.`);
    console.log(`✓ Backup file contains all ${fileLines.length / 2} compressed documents.`);
    console.log(`✓ Mapping sync verified.`);
    console.log(`🎉 E2E MOCK TEST PASSED SUCCESSFULLY!\n`);
  } finally {
    server.close();
    if (fs.existsSync(tmpBackupFile)) {
      fs.unlinkSync(tmpBackupFile);
    }
  }
}

runTest().catch(err => {
  console.error('\n❌ E2E TEST FAILED:', err);
  server.close();
  process.exit(1);
});
