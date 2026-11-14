const { createClient, pingClient } = require('./lib/client/clientFactory');
const { transferMapping, sanitizeMapping } = require('./lib/mapping/mappingManager');
const { transfer } = require('./lib/transfer');

/**
 * Backward compatibility wrapper for legacy code expecting `new Elastic()`.
 */
class Elastic {
  constructor(config = {}, options = {}) {
    this.config = config;
    this.options = options;
    this.target = {
      doc_count: {
        file: 0,
        elastic: 0,
      },
    };
    this.batches = 0;
    this._scroll_id = null;
  }

  async init() {
    this.sourceClient = createClient(this.config.source || { host: 'localhost:9200' });
    await pingClient(this.sourceClient, 'source');

    if (this.config.target?.host || this.config.target?.node) {
      this.targetClient = createClient(this.config.target);
      await pingClient(this.targetClient, 'target');

      if (this.config.target?.importMappingFromSource || this.config.target?.importMapping) {
        await transferMapping({
          sourceClient: this.sourceClient,
          targetClient: this.targetClient,
          sourceIndex: this.config.source.index,
          targetIndex: this.config.target.index,
        });
      }
    }
  }

  async transferAll() {
    return transfer(this.config, this.options);
  }
}

module.exports = {
  Elastic,
};
