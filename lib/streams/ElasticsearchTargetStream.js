const { Writable } = require('stream');

/**
 * Writable stream that batches incoming documents and indexes them
 * into Elasticsearch or OpenSearch via the Bulk API with backpressure and error inspection.
 */
class ElasticsearchTargetStream extends Writable {
  /**
   * @param {Object} options
   * @param {Object} options.client - Target Elasticsearch or OpenSearch client
   * @param {number} [options.batchSize=500] - Bulk batch size
   * @param {string} [options.action='index'] - Bulk action: 'index', 'create', 'update'
   * @param {number} [options.maxRetries=3] - Number of retries for network/transient failures
   * @param {number} [options.retryDelayMs=1000] - Base delay for exponential backoff
   * @param {Function} [options.onDocumentError] - Callback for document-level bulk indexing errors
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 1000 });

    if (!options.client) {
      throw new Error('ElasticsearchTargetStream requires a client instance');
    }

    this.client = options.client;
    this.batchSize = options.batchSize || 500;
    this.action = options.action || 'index';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelayMs = options.retryDelayMs || 1000;
    this.onDocumentError = options.onDocumentError;

    this._batch = [];
    this._transferredCount = 0;
    this._failedCount = 0;
  }

  get transferredCount() {
    return this._transferredCount;
  }

  get failedCount() {
    return this._failedCount;
  }

  async _write(doc, encoding, callback) {
    this._batch.push(doc);

    if (this._batch.length >= this.batchSize) {
      try {
        await this._flushBatch();
        callback();
      } catch (err) {
        callback(err);
      }
    } else {
      callback();
    }
  }

  async _final(callback) {
    try {
      if (this._batch.length > 0) {
        await this._flushBatch();
      }
      callback();
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Flushes current batch to Elasticsearch/OpenSearch.
   */
  async _flushBatch() {
    if (this._batch.length === 0) return;

    const currentBatch = this._batch;
    this._batch = [];

    const operations = [];
    for (const doc of currentBatch) {
      const actionHeader = {
        _index: doc.index,
      };

      if (doc.id !== undefined && doc.id !== null) {
        actionHeader._id = doc.id;
      }
      if (doc.type) {
        actionHeader._type = doc.type;
      }

      operations.push({ [this.action]: actionHeader });
      operations.push(doc.source || {});
    }

    let attempt = 0;
    let response;

    while (attempt <= this.maxRetries) {
      try {
        // Pass both operations and body to support both @elastic/elasticsearch and @opensearch-project/opensearch
        response = await this.client.bulk({
          operations,
          body: operations,
        });
        break;
      } catch (err) {
        attempt++;
        if (attempt > this.maxRetries) {
          throw new Error(`Bulk indexing failed after ${this.maxRetries} retries: ${err.message}`);
        }
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const body = response.body || response;
    let batchFailed = 0;
    let batchSuccess = 0;

    if (body.errors && Array.isArray(body.items)) {
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i];
        const actionResult = item[this.action] || item.index || item.create || item.update;

        if (actionResult && actionResult.error) {
          batchFailed++;
          this._failedCount++;
          if (typeof this.onDocumentError === 'function') {
            this.onDocumentError(actionResult, currentBatch[i]);
          }
        } else {
          batchSuccess++;
          this._transferredCount++;
        }
      }
    } else {
      batchSuccess = currentBatch.length;
      this._transferredCount += batchSuccess;
    }

    this.emit('batch', {
      batchCount: currentBatch.length,
      successCount: batchSuccess,
      failedCount: batchFailed,
      totalTransferred: this._transferredCount,
      totalFailed: this._failedCount,
    });
  }
}

module.exports = { ElasticsearchTargetStream };
