const { Writable } = require('stream');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Writable stream that streams documents to disk in NDJSON / Bulk format
 * with backpressure and optional gzip compression.
 */
class FileTargetStream extends Writable {
  /**
   * @param {Object} options
   * @param {string} options.filePath - Path to output file
   * @param {string} [options.dirPath] - Directory path (concatenated with filePath if both provided)
   * @param {string} [options.format='bulk'] - Output format: 'bulk', 'source', or 'document'
   * @param {boolean} [options.gzip] - Compress output using gzip (auto-detected if file ends with .gz)
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 1000 });

    if (!options.filePath) {
      throw new Error('FileTargetStream requires a filePath');
    }

    const rawPath = options.dirPath ? path.join(options.dirPath, options.filePath) : options.filePath;
    this.fullPath = path.resolve(process.cwd(), rawPath);
    this.format = options.format || 'bulk';
    this.gzip = options.gzip !== undefined ? Boolean(options.gzip) : this.fullPath.endsWith('.gz');

    this._writtenCount = 0;
    this._bytesWritten = 0;

    // Ensure output directory exists
    const dirname = path.dirname(this.fullPath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }

    // Setup streams
    this._fileStream = fs.createWriteStream(this.fullPath);

    if (this.gzip) {
      this._gzipStream = zlib.createGzip();
      this._gzipStream.pipe(this._fileStream);
      this._sink = this._gzipStream;
    } else {
      this._sink = this._fileStream;
    }

    // Forward stream errors
    this._sink.on('error', err => this.destroy(err));
    if (this._gzipStream) {
      this._fileStream.on('error', err => this.destroy(err));
    }
  }

  get writtenCount() {
    return this._writtenCount;
  }

  get filePath() {
    return this.fullPath;
  }

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

    // Default 'bulk' format
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

  _write(doc, encoding, callback) {
    const chunk = this._formatDocument(doc);
    this._writtenCount++;
    this._bytesWritten += Buffer.byteLength(chunk);

    const canContinue = this._sink.write(chunk, 'utf8');

    if (!canContinue) {
      this._sink.once('drain', callback);
    } else {
      callback();
    }
  }

  _final(callback) {
    if (this._gzipStream) {
      this._gzipStream.end();
      this._fileStream.once('finish', callback);
    } else {
      this._fileStream.end(callback);
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
