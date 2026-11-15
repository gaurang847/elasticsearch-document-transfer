const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFile, rm } = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const { ElasticsearchSourceStream } = require('../lib/streams/ElasticsearchSourceStream');
const { DocumentTransformStream } = require('../lib/streams/DocumentTransformStream');
const { ElasticsearchTargetStream } = require('../lib/streams/ElasticsearchTargetStream');
const { FileTargetStream } = require('../lib/streams/FileTargetStream');
const { MultiWritableStream } = require('../lib/streams/MultiWritableStream');

const TMP_DIR = path.join(__dirname, 'tmp_pipeline');

describe('Full Pipeline Integration', () => {
  afterEach(async () => {
    try {
      await rm(TMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  test('streams from source through transform to multiple targets with backpressure', async () => {
    // 1. Mock Source with 10 documents in 2 batches
    let page = 0;
    const mockSourceClient = {
      async search() {
        return {
          _scroll_id: 'token-abc',
          hits: {
            total: { value: 10 },
            hits: Array.from({ length: 5 }, (_, i) => ({
              _id: `doc-${i + 1}`,
              _index: 'src_idx',
              _type: '_doc',
              _source: { value: i + 1 },
            })),
          },
        };
      },
      async scroll() {
        page++;
        if (page === 1) {
          return {
            _scroll_id: 'token-abc',
            hits: {
              total: { value: 10 },
              hits: Array.from({ length: 5 }, (_, i) => ({
                _id: `doc-${i + 6}`,
                _index: 'src_idx',
                _type: '_doc',
                _source: { value: i + 6 },
              })),
            },
          };
        }
        return { _scroll_id: 'token-abc', hits: { total: { value: 10 }, hits: [] } };
      },
      async clearScroll() {
        return { acknowledged: true };
      },
    };

    // 2. Mock Target ES Client
    const targetIndexed = [];
    const mockTargetClient = {
      async bulk(params) {
        const ops = params.operations;
        for (let i = 0; i < ops.length; i += 2) {
          targetIndexed.push({
            header: ops[i],
            body: ops[i + 1],
          });
        }
        return { errors: false, items: [] };
      },
    };

    const sourceStream = new ElasticsearchSourceStream({
      client: mockSourceClient,
      index: 'src_idx',
      batchSize: 5,
    });

    const transformStream = new DocumentTransformStream({
      targetIndex: 'tgt_idx',
      transform: doc => {
        doc._source.doubled = doc._source.value * 2;
        return doc;
      },
    });

    const elasticTarget = new ElasticsearchTargetStream({
      client: mockTargetClient,
      batchSize: 4,
    });

    const filePath = path.join(TMP_DIR, 'pipeline_output.ndjson');
    const fileTarget = new FileTargetStream({
      filePath,
      format: 'bulk',
    });

    const multiTarget = new MultiWritableStream([elasticTarget, fileTarget]);

    // Run pipeline
    await pipeline(sourceStream, transformStream, multiTarget);

    // Verify Elasticsearch target received all 10 documents
    assert.equal(targetIndexed.length, 10);
    assert.equal(targetIndexed[0].header.index._index, 'tgt_idx');
    assert.equal(targetIndexed[0].header.index._id, 'doc-1');
    assert.equal(targetIndexed[0].body.doubled, 2);
    assert.equal(targetIndexed[9].body.doubled, 20);

    // Verify File target received all 10 documents
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 20); // 10 action lines + 10 source lines
  });
});
