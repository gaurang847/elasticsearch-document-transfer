const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('../lib/config');

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
    assert.equal(cfg.target.elasticsearch.node, 'http://localhost:9210'.replace('9210', '9201'));
    assert.equal(cfg.target.file.enabled, false);
  });

  test('normalizes legacy v1 config format with options', () => {
    const legacyConfig = {
      source: {
        host: 'localhost:9200',
        index: 'old_source',
        type: '_doc',
      },
      target: {
        host: 'localhost:9205',
        index: 'old_target',
        dirPath: 'backup/',
        filePath: 'data.json',
        useDocCountAsId: true,
      },
    };

    const legacyOptions = {
      produce: { batch_size: 150 },
      consume: { batch_size: 75, byFile: true, byElastic: true },
      elasticsearch: { scroll_time: '30s' },
    };

    const cfg = normalizeConfig(legacyConfig, legacyOptions);
    assert.equal(cfg.source.index, 'old_source');
    assert.equal(cfg.source.batchSize, 150);
    assert.equal(cfg.source.scrollTime, '30s');
    assert.equal(cfg.target.elasticsearch.enabled, true);
    assert.equal(cfg.target.elasticsearch.batchSize, 75);
    assert.equal(cfg.target.elasticsearch.useDocCountAsId, true);
    assert.equal(cfg.target.file.enabled, true);
  });

  test('throws error if source.index is missing', () => {
    assert.throws(
      () => normalizeConfig({ source: { node: 'http://localhost:9200' } }),
      /source\.index is required/
    );
  });

  test('throws error if neither elasticsearch nor file target is enabled', () => {
    assert.throws(
      () => normalizeConfig({
        source: { node: 'http://localhost:9200', index: 'my_idx' },
        target: { elasticsearch: { enabled: false }, file: { enabled: false } },
      }),
      /At least one target/
    );
  });
});
