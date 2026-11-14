const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ElasticsearchTargetStream } = require('../lib/streams/ElasticsearchTargetStream');

describe('ElasticsearchTargetStream', () => {
  test('flushes batches when batchSize is reached and on stream end', async () => {
    const bulkCalls = [];
    const mockClient = {
      async bulk(params) {
        bulkCalls.push(params);
        return { errors: false, items: [] };
      },
    };

    const target = new ElasticsearchTargetStream({
      client: mockClient,
      batchSize: 2,
    });

    target.write({ index: 'dest', id: '1', source: { name: 'A' } });
    target.write({ index: 'dest', id: '2', source: { name: 'B' } });
    // Should flush first batch of 2
    assert.equal(bulkCalls.length, 1);

    target.write({ index: 'dest', id: '3', source: { name: 'C' } });
    target.end();

    await new Promise(resolve => target.on('finish', resolve));

    // Should flush remaining 1 on finish
    assert.equal(bulkCalls.length, 2);
    assert.equal(target.transferredCount, 3);
    assert.equal(target.failedCount, 0);

    // Verify operations format
    const firstCallOps = bulkCalls[0].operations;
    assert.deepEqual(firstCallOps[0], { index: { _index: 'dest', _id: '1' } });
    assert.deepEqual(firstCallOps[1], { name: 'A' });
    assert.deepEqual(firstCallOps[2], { index: { _index: 'dest', _id: '2' } });
    assert.deepEqual(firstCallOps[3], { name: 'B' });
  });

  test('reports failed items and calls onDocumentError', async () => {
    const failedDocs = [];
    const mockClient = {
      async bulk() {
        return {
          errors: true,
          items: [
            { index: { status: 200 } },
            { index: { status: 400, error: { type: 'mapper_parsing_exception', reason: 'failed' } } },
          ],
        };
      },
    };

    const target = new ElasticsearchTargetStream({
      client: mockClient,
      batchSize: 2,
      onDocumentError: (actionResult, doc) => {
        failedDocs.push({ actionResult, doc });
      },
    });

    target.write({ index: 'dest', id: '1', source: { a: 1 } });
    target.write({ index: 'dest', id: '2', source: { a: 'bad' } });
    target.end();

    await new Promise(resolve => target.on('finish', resolve));

    assert.equal(target.transferredCount, 1);
    assert.equal(target.failedCount, 1);
    assert.equal(failedDocs.length, 1);
    assert.equal(failedDocs[0].doc.id, '2');
  });
});
