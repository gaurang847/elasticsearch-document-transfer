const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeMapping, extractAnalysisSettings } = require('../lib/mapping/mappingManager');

describe('MappingManager', () => {
  test('unwraps legacy ES 5/6 typed mapping and strips deprecated fields', () => {
    const rawLegacy = {
      old_index: {
        mappings: {
          my_type: {
            _all: { enabled: false },
            _type: { default: 'my_type' },
            properties: {
              name: { type: 'text' },
              age: { type: 'integer' },
            },
          },
        },
      },
    };

    const sanitized = sanitizeMapping(rawLegacy, 'old_index');
    assert.deepEqual(sanitized, {
      properties: {
        name: { type: 'text' },
        age: { type: 'integer' },
      },
    });
    assert.equal(sanitized._all, undefined);
    assert.equal(sanitized._type, undefined);
  });

  test('extracts custom analysis settings', () => {
    const rawSettings = {
      my_index: {
        settings: {
          index: {
            number_of_shards: '1',
            analysis: {
              analyzer: {
                custom_autocomplete: {
                  tokenizer: 'standard',
                  filter: ['lowercase', 'edge_ngram'],
                },
              },
            },
          },
        },
      },
    };

    const extracted = extractAnalysisSettings(rawSettings, 'my_index');
    assert.ok(extracted.analysis);
    assert.ok(extracted.analysis.analyzer.custom_autocomplete);
  });
});
