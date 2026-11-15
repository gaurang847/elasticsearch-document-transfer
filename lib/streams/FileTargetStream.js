const { Writable } = require('node:stream');
const { createWriteStream } = require('node:fs');
const { mkdir } = require('node:fs/promises');
const { once } = require('node:events');
const path = require('node:path');
const zlib = require('node:zlib');

/**
 * Writable stream that streams documents to disk in NDJSON / Bulk format
 * with backpressure and optional gzip compression.
 */
class FileTargetStream extends Writable {
  /**
   * @param {import('../types').FileTargetStreamOptions} options - Stream configuration options
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 1000 });

    if (!options.filePath) {
      throw new Error('FileTargetStream requires a filePath');
    }

    const rawPath = options.dirPath ? path.join(options.dirPath, options.filePath) : options.filePath;
    this.fullPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
    this.format = options.format || 'bulk';
    this.gzip = options.gzip !== undefined ? Boolean(options.gzip) : this.fullPath.endsWith('.gz');

    this._writtenCount = 0;
    this._bytesWritten = 0;
    this._fileStream = null;
    this._gzipStream = null;
    this._sink = null;
  }

  /**
   * Asynchronously prepares directory and stream sinks before writing.
   * @param {Function} callback - Stream construct callback
   */
  async _construct(callback) {
    try {
      const dirname = path.dirname(this.fullPath);
      await mkdir(dirname, { recursive: true });

      this._fileStream = createWriteStream(this.fullPath);

      if (this.gzip) {
        this._gzipStream = zlib.createGzip();
        this._gzipStream.pipe(this._fileStream);
        this._sink = this._gzipStream;
      } else {
        this._sink = this._fileStream;
      }

      this._sink.on('error', err => this.destroy(err));
      if (this._gzipStream) {
        this._fileStream.on('error', err => this.destroy(err));
      }

      callback();
    } catch (err) {
      callback(err);
    }
  }

  get writtenCount() {
    return this._writtenCount;
  }

  get bytesWritten() {
    return this._bytesWritten;
  }

  get filePath() {
    return this.fullPath;
  }

  /**
   * Formats a normalized document object into an NDJSON string line.
   * @param {Object} doc - Document object
   * @returns {string} Formatted NDJSON line(s)
   */
  _formatDocument(doc) {
    if (this.format === 'source') {
      return `${JSON.stringify(doc.source || {})}\n`;
    }

    if (this.format === 'document') {
      return `${JSON.stringify({
        _index: doc.index,
        _id: doc.id,
        _source: doc.source || {},
      })}\n`;
    }

    // Default 'bulk' format matching Elasticsearch _bulk API expectations
    const actionHeader = {
      index: {
        _index: doc.index,
      },
    };
    if (doc.id !== undefined && doc.id !== null) {
      actionHeader.index._id = doc.id;
    }
    if (doc.type) {
      actionHeader.index._type = doc.type;
    }

    return `${JSON.stringify(actionHeader)}\n${JSON.stringify(doc.source || {})}\n`;
  }

  /**
   * Writes document to sink with promise-based drain backpressure.
   * @param {Object} doc - Document object
   * @param {BufferEncoding} encoding - Stream encoding
   * @param {Function} callback - Stream callback
   */
  async _write(doc, encoding, callback) {
    try {
      const chunk = this._formatDocument(doc);
      this._writtenCount++;
      this._bytesWritten += Buffer.byteLength(chunk);

      const canContinue = this._sink.write(chunk, 'utf8');

      if (!canContinue) {
        await once(this._sink, 'drain');
      }
      callback();
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Flushes and closes file and gzip streams.
   * @param {Function} callback - Stream callback
   */
  async _final(callback) {
    try {
      if (this._gzipStream) {
        this._gzipStream.end();
        await once(this._fileStream, 'finish');
      } else if (this._fileStream) {
        this._fileStream.end();
        await once(this._fileStream, 'finish');
      }
      callback();
    } catch (err) {
      callback(err);
    }
  }

  _destroy(err, callback) {
    if (this._gzipStream) {
      this._gzipStream.destroy();
    }
    if (this._fileStream) {
      this._fileStream.destroy();
    }
    callback(err);
  }
}

module.exports = { FileTargetStream };
