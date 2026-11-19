const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { normalizeConfig, loadConfigFile } = require('../lib/config');

describe('Config Normalizer', () => {
  test('normalizes modern config correctly', () => {
    const raw = {
      source: {
        node: 'http://localhost:9200',
        index: 'source_idx',
        batchSize: 250,
      },
      target: {
        elasticsearch: {
          enabled: true,
          node: 'http://localhost:9201',
          index: 'target_idx',
        },
      },
    };

    const cfg = normalizeConfig(raw);
    assert.equal(cfg.source.node, 'http://localhost:9200');
    assert.equal(cfg.source.index, 'source_idx');
    assert.equal(cfg.source.batchSize, 250);
    assert.equal(cfg.target.elasticsearch.enabled, true);
    assert.equal(cfg.target.elasticsearch.node, 'http://localhost:9201');
    assert.equal(cfg.target.file.enabled, false);
  });

  test('throws error if source.node is missing', () => {
    assert.throws(
      () => normalizeConfig({ source: { index: 'my_idx' }, target: { file: { filePath: 'out.ndjson' } } }),
      /source\.node.*required/
    );
  });

  test('throws error if source.index is missing', () => {
    assert.throws(
      () => normalizeConfig({ source: { node: 'http://localhost:9200' }, target: { file: { filePath: 'out.ndjson' } } }),
      /source\.index.*required/
    );
  });

  test('throws error if neither elasticsearch nor file target is enabled', () => {
    assert.throws(
      () => normalizeConfig({
        source: { node: 'http://localhost:9200', index: 'my_idx' },
        target: { elasticsearch: { enabled: false }, file: { enabled: false } },
      }),
      /Both targets are disabled/
    );
  });

  test('throws error if both targets are explicitly disabled even with node/filePath provided', () => {
    assert.throws(
      () => normalizeConfig({
        source: { node: 'http://localhost:9200', index: 'my_idx' },
        target: {
          elasticsearch: { enabled: false, node: 'http://localhost:9200' },
          file: { enabled: false, filePath: 'out.ndjson' },
        },
      }),
      /Both targets are disabled/
    );
  });

  test('loadConfigFile loads sample config asynchronously using promises', async () => {
    const samplePath = path.resolve(__dirname, '../config-sample.json');
    const loaded = await loadConfigFile(samplePath);
    assert.ok(loaded);
    assert.equal(loaded.source.index, 'my_source_index');
  });

  test('loadConfigFile rejects if custom path does not exist', async () => {
    await assert.rejects(
      () => loadConfigFile('/non/existent/path/config.json'),
      /Configuration file not found/
    );
  });
});
