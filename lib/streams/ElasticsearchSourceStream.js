const { Readable } = require('stream');

/**
 * Readable stream that reads documents from Elasticsearch or OpenSearch
 * using cursor-based pagination (Scroll or search_after) with native backpressure.
 */
class ElasticsearchSourceStream extends Readable {
  /**
   * @param {Object} options
   * @param {Object} options.client - Connected Elasticsearch or OpenSearch client
   * @param {string} options.index - Source index name
   * @param {Object} [options.query] - Elasticsearch Query DSL (default: { match_all: {} })
   * @param {number} [options.batchSize=500] - Number of documents per batch
   * @param {string} [options.cursorMode='scroll'] - 'scroll' or 'search_after'
   * @param {string} [options.scrollTime='2m'] - Keep-alive time for scroll context
   * @param {Array} [options.sort] - Sort criteria for search_after (default: ['_shard_doc'])
   * @param {Array<string>} [options.sourceFields] - Specific fields to include from _source
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 1000 });

    if (!options.client) {
      throw new Error('ElasticsearchSourceStream requires a client instance');
    }
    if (!options.index) {
      throw new Error('ElasticsearchSourceStream requires a source index name');
    }

    this.client = options.client;
    this.index = options.index;
    this.query = options.query || { match_all: {} };
    this.batchSize = options.batchSize || 500;
    this.cursorMode = options.cursorMode || 'scroll';
    this.scrollTime = options.scrollTime || '2m';
    this.sort = options.sort || (this.cursorMode === 'search_after' ? ['_shard_doc'] : ['_doc']);
    this.sourceFields = options.sourceFields;

    this._scroll_id = null;
    this._search_after = null;
    this._docsBuffer = [];
    this._isFetching = false;
    this._exhausted = false;
    this._totalHits = null;
    this._emittedCount = 0;
    this._batchesFetched = 0;
  }

  get totalHits() {
    return this._totalHits;
  }

  get emittedCount() {
    return this._emittedCount;
  }

  async _read() {
    // If we have items in our buffer, push them first
    if (this._flushBuffer()) {
      return;
    }

    // If source is already exhausted, end stream
    if (this._exhausted) {
      this.push(null);
      return;
    }

    // If already waiting for an Elasticsearch response, wait
    if (this._isFetching) {
      return;
    }

    this._isFetching = true;

    try {
      const hits = await this._fetchNextBatch();
      this._isFetching = false;

      if (!hits || hits.length === 0) {
        this._exhausted = true;
        await this._cleanup();
        this.push(null);
        return;
      }

      this._docsBuffer.push(...hits);
      this._flushBuffer();
    } catch (err) {
      this._isFetching = false;
      await this._cleanup();
      this.destroy(err);
    }
  }

  /**
   * Pushes buffered documents to downstream consumers.
   * @returns {boolean} true if buffer was paused by backpressure
   */
  _flushBuffer() {
    while (this._docsBuffer.length > 0) {
      const doc = this._docsBuffer.shift();
      this._emittedCount++;
      const canContinue = this.push(doc);

      // Backpressure triggered: downstream consumer buffer is full
      if (!canContinue) {
        return true;
      }
    }
    return false;
  }

  /**
   * Fetches the next batch of documents using scroll or search_after.
   * @returns {Promise<Array>}
   */
  async _fetchNextBatch() {
    this._batchesFetched++;

    if (this.cursorMode === 'scroll') {
      return this._fetchScrollBatch();
    } else {
      return this._fetchSearchAfterBatch();
    }
  }

  /**
   * Scroll-based cursor fetching.
   * @returns {Promise<Array>}
   */
  async _fetchScrollBatch() {
    let response;

    if (!this._scroll_id) {
      // First page of scroll
      const searchParams = {
        index: this.index,
        scroll: this.scrollTime,
        size: this.batchSize,
        query: this.query,
        sort: this.sort,
      };

      if (this.sourceFields) {
        searchParams._source = this.sourceFields;
      }

      response = await this.client.search(searchParams);
      const body = response.body || response;
      this._scroll_id = body._scroll_id;

      const total = body.hits?.total;
      this._totalHits = typeof total === 'object' ? total.value : total;
      this.emit('totalHits', this._totalHits);

      return body.hits?.hits || [];
    } else {
      // Subsequent scroll pages
      response = await this.client.scroll({
        scroll_id: this._scroll_id,
        scroll: this.scrollTime,
      });

      const body = response.body || response;
      this._scroll_id = body._scroll_id;

      return body.hits?.hits || [];
    }
  }

  /**
   * search_after cursor fetching.
   * @returns {Promise<Array>}
   */
  async _fetchSearchAfterBatch() {
    const searchParams = {
      index: this.index,
      size: this.batchSize,
      query: this.query,
      sort: this.sort,
    };

    if (this._search_after) {
      searchParams.search_after = this._search_after;
    }
    if (this.sourceFields) {
      searchParams._source = this.sourceFields;
    }

    const response = await this.client.search(searchParams);
    const body = response.body || response;

    if (this._totalHits === null) {
      const total = body.hits?.total;
      this._totalHits = typeof total === 'object' ? total.value : total;
      this.emit('totalHits', this._totalHits);
    }

    const hits = body.hits?.hits || [];
    if (hits.length > 0) {
      const lastHit = hits[hits.length - 1];
      this._search_after = lastHit.sort;
    }

    return hits;
  }

  /**
   * Cleans up cursor contexts on the server to prevent memory leaks.
   */
  async _cleanup() {
    if (this._scroll_id) {
      const scrollId = this._scroll_id;
      this._scroll_id = null;
      try {
        await this.client.clearScroll({ scroll_id: scrollId });
      } catch (_) {
        // Ignore errors during clearScroll cleanup
      }
    }
  }

  async _destroy(err, callback) {
    try {
      await this._cleanup();
    } finally {
      callback(err);
    }
  }
}

module.exports = { ElasticsearchSourceStream };
