const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DocumentTransformStream } = require('../lib/streams/DocumentTransformStream');

describe('DocumentTransformStream', () => {
  test('strips _type and preserves _id by default', async () => {
    const stream = new DocumentTransformStream({ targetIndex: 'new_index' });
    const results = [];

    stream.on('data', doc => results.push(doc));

    const sampleHit = {
      _index: 'old_index',
      _id: 'doc-123',
      _type: '_doc',
      _source: { title: 'Test Document', count: 42 },
    };

    stream.write(sampleHit);
    stream.end();

    await new Promise(resolve => stream.on('finish', resolve));

    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      index: 'new_index',
      id: 'doc-123',
      source: { title: 'Test Document', count: 42 },
    });
    assert.equal(results[0].type, undefined);
  });

  test('generates custom ID when customId function is provided', async () => {
    const stream = new DocumentTransformStream({ customId: (hit, count) => `custom-${count}` });
    const results = [];

    stream.on('data', doc => results.push(doc));

    stream.write({ _index: 'idx', _id: 'orig-1', _source: { a: 1 } });
    stream.write({ _index: 'idx', _id: 'orig-2', _source: { a: 2 } });
    stream.end();

    await new Promise(resolve => stream.on('finish', resolve));

    assert.equal(results.length, 2);
    assert.equal(results[0].id, 'custom-1');
    assert.equal(results[1].id, 'custom-2');
  });

  test('supports custom transformer and document filtering', async () => {
    const stream = new DocumentTransformStream({
      transform: (doc, count) => {
        if (doc._source.deleted) return null; // Filter out
        doc._source.transformed = true;
        doc._source.seq = count;
        return doc;
      },
    });

    const results = [];
    stream.on('data', doc => results.push(doc));

    stream.write({ _index: 'idx', _id: '1', _source: { title: 'Keep', deleted: false } });
    stream.write({ _index: 'idx', _id: '2', _source: { title: 'Drop', deleted: true } });
    stream.write({ _index: 'idx', _id: '3', _source: { title: 'Keep 2', deleted: false } });
    stream.end();

    await new Promise(resolve => stream.on('finish', resolve));

    assert.equal(results.length, 2);
    assert.equal(results[0].id, '1');
    assert.equal(results[0].source.transformed, true);
    assert.equal(results[0].source.seq, 1);
    assert.equal(results[1].id, '3');
    assert.equal(results[1].source.transformed, true);
    assert.equal(results[1].source.seq, 3);
  });
});
