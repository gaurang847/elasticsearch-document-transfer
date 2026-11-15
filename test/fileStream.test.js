const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFile, rm } = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { FileTargetStream } = require('../lib/streams/FileTargetStream');

const TMP_DIR = path.join(__dirname, 'tmp_filestream');

describe('FileTargetStream', () => {
  afterEach(async () => {
    try {
      await rm(TMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  test('writes bulk formatted NDJSON', async () => {
    const filePath = path.join(TMP_DIR, 'out.ndjson');
    const stream = new FileTargetStream({ filePath, format: 'bulk' });

    stream.write({ index: 'idx', id: '1', source: { title: 'First' } });
    stream.write({ index: 'idx', id: '2', source: { title: 'Second' } });
    stream.end();

    await new Promise(resolve => stream.on('finish', resolve));

    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    assert.equal(lines.length, 4);
    assert.deepEqual(JSON.parse(lines[0]), { index: { _index: 'idx', _id: '1' } });
    assert.deepEqual(JSON.parse(lines[1]), { title: 'First' });
    assert.deepEqual(JSON.parse(lines[2]), { index: { _index: 'idx', _id: '2' } });
    assert.deepEqual(JSON.parse(lines[3]), { title: 'Second' });
    assert.equal(stream.writtenCount, 2);
  });

  test('writes gzip compressed NDJSON when file ends in .gz', async () => {
    const filePath = path.join(TMP_DIR, 'out.ndjson.gz');
    const stream = new FileTargetStream({ filePath, format: 'source' });

    stream.write({ index: 'idx', id: '1', source: { msg: 'Compressed hello' } });
    stream.end();

    await new Promise(resolve => stream.on('finish', resolve));

    const rawGz = await readFile(filePath);
    const decompressed = zlib.gunzipSync(rawGz).toString('utf-8');
    const lines = decompressed.trim().split('\n');

    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), { msg: 'Compressed hello' });
  });
});
