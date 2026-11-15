const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createClient, buildTlsConfig } = require('../lib/client/clientFactory');

describe('ClientFactory', () => {
  test('createClient throws if node is missing', async () => {
    await assert.rejects(
      () => createClient({}),
      /Endpoint configuration error: "node" URL is required/
    );
  });

  test('createClient instantiates Elasticsearch client by default', async () => {
    const client = await createClient({ node: 'http://localhost:9200' });
    assert.ok(client);
    assert.equal(typeof client.search, 'function');
    assert.equal(typeof client.bulk, 'function');
  });

  test('createClient instantiates OpenSearch client when requested', async () => {
    const client = await createClient({ node: 'http://localhost:9200', type: 'opensearch' });
    assert.ok(client);
    assert.equal(typeof client.search, 'function');
    assert.equal(typeof client.bulk, 'function');
  });

  test('buildTlsConfig processes boolean rejectUnauthorized', async () => {
    const tls = await buildTlsConfig({ node: 'https://localhost:9200', tls: { rejectUnauthorized: false } });
    assert.equal(tls.rejectUnauthorized, false);
  });
});
