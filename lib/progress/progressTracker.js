/**
 * Terminal and CI progress reporter with throughput and duration metrics.
 */
class ProgressTracker {
  /**
   * @param {Object} options
   * @param {string} [options.label='Transfer']
   * @param {boolean} [options.silent=false]
   */
  constructor(options = {}) {
    this.label = options.label || 'Transfer';
    this.silent = Boolean(options.silent);

    this.totalHits = null;
    this.transferredCount = 0;
    this.failedCount = 0;
    this.startTime = Date.now();
    this.lastRenderTime = 0;
    this.isTTY = Boolean(process.stdout.isTTY);

    this._interval = null;
  }

  start() {
    if (this.silent) return;

    this.startTime = Date.now();
    this._interval = setInterval(() => this.render(), 1000);
  }

  setTotal(total) {
    if (typeof total === 'number' && !isNaN(total)) {
      this.totalHits = total;
    }
  }

  update({ transferred, failed }) {
    if (typeof transferred === 'number') {
      this.transferredCount = transferred;
    }
    if (typeof failed === 'number') {
      this.failedCount = failed;
    }
  }

  render(isFinal = false) {
    if (this.silent) return;

    const elapsedMs = Math.max(1, Date.now() - this.startTime);
    const elapsedSec = (elapsedMs / 1000).toFixed(1);
    const rate = Math.round((this.transferredCount / elapsedMs) * 1000);

    let progressStr = `${this.label}: ${this.transferredCount.toLocaleString()} docs`;

    if (this.totalHits !== null && this.totalHits > 0) {
      const pct = Math.min(100, Math.round((this.transferredCount / this.totalHits) * 100));
      progressStr += ` / ${this.totalHits.toLocaleString()} (${pct}%)`;
    }

    progressStr += ` | ${rate.toLocaleString()} docs/sec | ${elapsedSec}s`;

    if (this.failedCount > 0) {
      progressStr += ` | ${this.failedCount.toLocaleString()} failed`;
    }

    if (this.isTTY) {
      process.stdout.write(`\r${progressStr.padEnd(80)}`);
      if (isFinal) {
        process.stdout.write('\n');
      }
    } else if (isFinal || Date.now() - this.lastRenderTime >= 5000) {
      console.log(progressStr);
      this.lastRenderTime = Date.now();
    }
  }

  finish() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }

    if (this.silent) return;

    this.render(true);

    const elapsedSec = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const avgRate = Math.round((this.transferredCount / Math.max(0.001, elapsedSec)));

    console.log('\n--- Transfer Summary ---');
    console.log(`Status:      Completed`);
    console.log(`Transferred: ${this.transferredCount.toLocaleString()} docs`);
    if (this.failedCount > 0) {
      console.log(`Failed:      ${this.failedCount.toLocaleString()} docs`);
    }
    console.log(`Duration:    ${elapsedSec}s`);
    console.log(`Throughput:  ${avgRate.toLocaleString()} docs/sec`);
    console.log('------------------------\n');
  }
}

module.exports = { ProgressTracker };
