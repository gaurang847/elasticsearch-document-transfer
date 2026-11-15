const { Transform } = require('stream');

/**
 * Transform stream that sanitizes, enriches, or reshapes documents
 * between source and target Elasticsearch / File destinations.
 */
class DocumentTransformStream extends Transform {
  /**
   * @param {Object} options
   * @param {string} [options.targetIndex] - Target index name override
   * @param {Function} [options.customId] - Function (hit, counter) => customId
   * @param {boolean} [options.stripType=true] - Remove legacy _type (for ES 7.x/8.x/OpenSearch)
   * @param {Function} [options.transform] - Custom document transformer/filter function
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 1000 });

    this.targetIndex = options.targetIndex;
    this.customId = typeof options.customId === 'function' ? options.customId : null;
    this.stripType = options.stripType !== false;
    this.customTransform = typeof options.transform === 'function' ? options.transform : null;

    this.processedCount = 0;
    this.skippedCount = 0;
  }

  async _transform(hit, encoding, callback) {
    try {
      this.processedCount++;

      // Determine ID (preserves original _id by default, or uses custom generator)
      let docId = this.customId ? this.customId(hit, this.processedCount) : hit._id;

      // Determine target index
      const targetIndex = this.targetIndex || hit._index;

      // Extract and clone source
      let source = hit._source ? { ...hit._source } : {};

      // If user supplied a custom transform/filter function
      if (this.customTransform) {
        const transformed = await this.customTransform(
          {
            _id: docId,
            _index: targetIndex,
            _source: source,
            _original: hit,
          },
          this.processedCount
        );

        // If returned null/false, filter document out
        if (!transformed) {
          this.skippedCount++;
          callback();
          return;
        }

        docId = transformed._id !== undefined ? transformed._id : docId;
        source = transformed._source !== undefined ? transformed._source : transformed;
      }

      const normalizedDoc = {
        index: targetIndex,
        id: docId,
        source,
      };

      if (!this.stripType && hit._type) {
        normalizedDoc.type = hit._type;
      }

      this.push(normalizedDoc);
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = { DocumentTransformStream };
