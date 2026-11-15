const { Writable } = require('node:stream');

/**
 * Composite writable stream that broadcasts chunks to multiple target streams
 * simultaneously while maintaining synchronized backpressure.
 */
class MultiWritableStream extends Writable {
  /**
   * @param {Writable[]} targets - Array of writable destination streams
   * @param {Object} [options] - Writable stream options
   * @param {number} [options.highWaterMark=1000] - Stream buffer threshold
   */
  constructor(targets, options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 1000 });

    if (!Array.isArray(targets) || targets.length === 0) {
      throw new Error('MultiWritableStream requires at least one target stream');
    }

    this.targets = targets;
  }

  /**
   * Writes a chunk to all target streams concurrently and waits for all of them
   * to resolve before releasing backpressure.
   * @param {any} chunk - Data item being written
   * @param {BufferEncoding} encoding - Character encoding
   * @param {Function} callback - Stream callback
   */
  _write(chunk, encoding, callback) {
    const writePromises = this.targets.map(
      target =>
        new Promise(resolve => {
          target.write(chunk, encoding, err => resolve(err || null));
        })
    );

    Promise.all(writePromises)
      .then(errors => {
        const firstError = errors.find(Boolean);
        callback(firstError || undefined);
      })
      .catch(callback);
  }

  /**
   * Concurrently ends all target streams.
   * @param {Function} callback - Stream callback
   */
  _final(callback) {
    const endPromises = this.targets.map(
      target =>
        new Promise(resolve => {
          target.end(err => resolve(err || null));
        })
    );

    Promise.all(endPromises)
      .then(errors => {
        const firstError = errors.find(Boolean);
        callback(firstError || undefined);
      })
      .catch(callback);
  }

  /**
   * Destroys all underlying target streams.
   * @param {Error|null} err - Error that triggered destruction
   * @param {Function} callback - Stream callback
   */
  _destroy(err, callback) {
    for (const target of this.targets) {
      target.destroy(err || undefined);
    }
    callback(err);
  }
}

module.exports = { MultiWritableStream };
