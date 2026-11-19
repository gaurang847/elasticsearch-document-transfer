const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ElasticsearchSourceStream } = require('../lib/streams/ElasticsearchSourceStream');

describe('ElasticsearchSourceStream', () => {
  test('scrolls through pages and cleans up scroll_id on finish', async () => {
    let scrollCleared = false;
    let searchCalled = false;
    let scrollCalls = 0;

    const mockClient = {
      async search(params) {
        searchCalled = true;
        assert.equal(params.index, 'test_index');
        assert.equal(params.size, 2);
        return {
          _scroll_id: 'scroll-token-123',
          hits: {
            total: { value: 3 },
            hits: [
              { _id: '1', _index: 'test_index', _source: { name: 'Item 1' } },
              { _id: '2', _index: 'test_index', _source: { name: 'Item 2' } },
            ],
          },
        };
      },
      async scroll(params) {
        scrollCalls++;
        assert.equal(params.scroll_id, 'scroll-token-123');
        if (scrollCalls === 1) {
          return {
            _scroll_id: 'scroll-token-123',
            hits: {
              total: { value: 3 },
              hits: [{ _id: '3', _index: 'test_index', _source: { name: 'Item 3' } }],
            },
          };
        }
        return {
          _scroll_id: 'scroll-token-123',
          hits: { total: { value: 3 }, hits: [] },
        };
      },
      async clearScroll(params) {
        scrollCleared = true;
        assert.equal(params.scroll_id, 'scroll-token-123');
        return { acknowledged: true };
      },
    };

    const stream = new ElasticsearchSourceStream({
      client: mockClient,
      index: 'test_index',
      batchSize: 2,
    });

    const received = [];
    let receivedTotal = null;

    stream.on('totalHits', total => {
      receivedTotal = total;
    });

    for await (const doc of stream) {
      received.push(doc);
    }

    assert.ok(searchCalled);
    assert.equal(scrollCalls, 2);
    assert.equal(received.length, 3);
    assert.equal(receivedTotal, 3);
    assert.equal(received[0]._id, '1');
    assert.equal(received[2]._id, '3');
    assert.ok(scrollCleared, 'Scroll context must be cleared to prevent memory leaks');
  });

  test('search_after cursor pagination', async () => {
    let searchCalls = 0;
    const mockClient = {
      async search(params) {
        searchCalls++;
        if (searchCalls === 1) {
          assert.equal(params.search_after, undefined);
          return {
            hits: {
              total: { value: 3 },
              hits: [
                { _id: '1', _index: 'idx', _source: { a: 1 }, sort: [100] },
                { _id: '2', _index: 'idx', _source: { a: 2 }, sort: [200] },
              ],
            },
          };
        } else if (searchCalls === 2) {
          assert.deepEqual(params.search_after, [200]);
          return {
            hits: {
              total: { value: 3 },
              hits: [{ _id: '3', _index: 'idx', _source: { a: 3 }, sort: [300] }],
            },
          };
        }
        return { hits: { total: { value: 3 }, hits: [] } };
      },
    };

    const stream = new ElasticsearchSourceStream({
      client: mockClient,
      index: 'idx',
      batchSize: 2,
      cursorMode: 'search_after',
    });

    const received = [];
    for await (const doc of stream) {
      received.push(doc);
    }

    assert.equal(received.length, 3);
    assert.equal(searchCalls, 3);
  });
});
