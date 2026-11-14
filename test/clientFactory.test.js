const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeNode, createClient } = require('../lib/client/clientFactory');

describe('ClientFactory', () => {
  test('normalizeNode prepends http:// when protocol is missing', () => {
    assert.equal(normalizeNode({ host: 'localhost:9200' }), 'http://localhost:9200');
    assert.equal(normalizeNode('10.0.0.1:9200'), 'http://10.0.0.1:9200');
  });

  test('normalizeNode preserves https://', () => {
    assert.equal(normalizeNode({ host: 'https://es.example.com:9200' }), 'https://es.example.com:9200');
    assert.equal(normalizeNode({ node: 'https://es.example.com' }), 'https://es.example.com');
  });

  test('normalizeNode supports array of nodes', () => {
    const nodes = normalizeNode({ host: ['node1:9200', 'https://node2:9200'] });
    assert.deepEqual(nodes, ['http://node1:9200', 'https://node2:9200']);
  });

  test('createClient instantiates Elasticsearch client by default', () => {
    const client = createClient({ node: 'http://localhost:9200' });
    assert.ok(client);
    assert.equal(typeof client.search, 'function');
    assert.equal(typeof client.bulk, 'function');
  });

  test('createClient instantiates OpenSearch client when requested', () => {
    const client = createClient({ node: 'http://localhost:9200', type: 'opensearch' });
    assert.ok(client);
    assert.equal(typeof client.search, 'function');
    assert.equal(typeof client.bulk, 'function');
  });
});
