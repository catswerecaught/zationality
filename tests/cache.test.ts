import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clearReportsAt } from '../server/cache.js';

test('清空记录只删除有效报告 JSON，并保留临时文件和其他文件', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zationality-clear-'));
  try {
    await Promise.all([
      writeFile(path.join(directory, '0123456789abcdef01234567.json'), '{}'),
      writeFile(path.join(directory, '0123456789abcdef01234568.json'), '{}'),
      writeFile(path.join(directory, '0123456789abcdef01234567.json.tmp'), '{}'),
      writeFile(path.join(directory, 'notes.txt'), 'keep'),
    ]);
    assert.equal(await clearReportsAt(directory), 2);
    assert.deepEqual((await readdir(directory)).sort(), ['0123456789abcdef01234567.json.tmp', 'notes.txt']);
    assert.equal(await clearReportsAt(directory), 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
