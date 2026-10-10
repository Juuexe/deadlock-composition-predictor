import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { claimTest, loadPartition, parsePlan } from '../src/research-files.ts';

test('checks partition integrity, confines paths and permits only one final-test opening', async () => {
  const id = randomUUID(), directory = `data/research/${id}`;
  await mkdir(directory, { recursive: true });
  const row = { match: { matchId: 1, startedAt: '2026-01-01T00:00:00.000Z', teamA: [1, 2, 3, 4, 5, 6], teamB: [7, 8, 9, 10, 11, 12], winner: 'A' }, completedAt: '2026-01-01T00:30:00.000Z' };
  const text = JSON.stringify([row]);
  const sha256 = createHash('sha256').update(text).digest('hex');
  const partitions = Object.fromEntries(['train', 'validation', 'calibration', 'test'].map(name => [name, { path: `${directory}/${name}.json`, count: 1, sha256, first: row.match.startedAt, last: row.match.startedAt }]));
  const plan = parsePlan({ id, directory, currentPeriod: row.match.startedAt, partitions });
  try {
    await writeFile(plan.partitions.test.path, text);
    assert.equal((await loadPartition(plan, 'test')).length, 1);
    await writeFile(plan.partitions.test.path, '[]');
    await assert.rejects(() => loadPartition(plan, 'test'), /changed/);
    assert.throws(() => parsePlan({ ...plan, directory: '../private' }));
    assert.throws(() => parsePlan({ ...plan, partitions: { ...partitions, test: { ...partitions.test, path: '.env' } } }));
    await claimTest(plan, sha256);
    await assert.rejects(() => claimTest(plan, sha256));
    assert.equal(JSON.parse(await readFile(`${directory}/test-opened.json`, 'utf8')).candidateSha256, sha256);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
