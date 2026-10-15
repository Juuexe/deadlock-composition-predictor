import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import test from 'node:test';
import { saveJson } from '../src/files.ts';

test('replaces valid JSON and preserves the old file when serialization fails', async () => {
  await mkdir('work', { recursive: true });
  const directory = await mkdtemp('work/save-test-');
  const path = `${directory}/test.json`;
  try {
    await saveJson(path, { value: 1 });
    await saveJson(path, { value: 2 });
    await assert.rejects(() => saveJson(path, { invalid: 1n }));
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { value: 2 });
    assert.deepEqual(await readdir(directory), ['test.json']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
