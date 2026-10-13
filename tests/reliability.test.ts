import test from 'node:test';
import assert from 'node:assert/strict';
import { reliabilityReport, wilson, beforeAnnouncement } from '../src/reliability.ts';
import type { HeroModel } from '../src/model.ts';
import type { TrainingMatch } from '../src/data.ts';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const model: HeroModel = { kind: 'hero-logistic-v1', regularization: 0.01,
  weights: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, i === 0 ? Math.log(0.58 / 0.42) : 0])),
  counts: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 100])) };
const row: TrainingMatch = { matchId: 1, startedAt: '2026-10-10T03:00:00.000Z',
  teamA: [1, 2, 3, 4, 5, 6], teamB: [7, 8, 9, 10, 11, 12], winner: 'A' };

test('daily reliability counts each match once and reports unsupported compositions', () => {
  const report = reliabilityReport(model, [row, { ...row, matchId: 2, startedAt: '2026-10-10T06:00:00.000Z', winner: 'B' },
    { ...row, matchId: 3, teamA: [13, 2, 3, 4, 5, 6] }]);
  assert.equal(report.coverage, 2 / 3);
  assert.equal(report.days.length, 2);
  assert.equal(report.overall!.accuracy, 0.5);
  assert.equal(report.overall!.calibration[0].count, 2);
  assert.ok(Math.abs(report.overall!.calibration[0].predicted - 0.58) < 1e-12);
  assert.equal(report.overall!.calibration[0].observed, 0.5);
  assert.throws(() => reliabilityReport(model, [row, row]), /Duplicate/);
});

test('empty reliability evidence remains pending and uncertainty is wide for small samples', () => {
  assert.equal(reliabilityReport(model, []).overall, null);
  assert.equal(wilson(0, 0), null);
  const interval = wilson(1, 1)!;
  assert.ok(interval.lower < 0.21);
  assert.ok(Math.abs(interval.upper - 1) < 1e-12);
});
test('late announcements exclude transition matches conservatively without deleting the dataset', () => {
  const boundary = '2026-10-10T07:00:00.000Z';
  const rows = [row, {...row, matchId:2, startedAt:'2026-10-10T04:00:00.000Z'}];
  assert.equal(beforeAnnouncement(rows, boundary).length, 1);
  assert.equal(rows.length, 2);
  assert.equal(beforeAnnouncement(rows, null).length, 2);
});

test('collector saves sanitized fresh windows, resumes without duplicates and rejects changed scoring code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'deadlock-reliability-'));
  try {
    for (const path of ['src', 'docs', 'data/reliability']) await mkdir(join(directory, path), { recursive: true });
    const code = await readFile('src/model.ts');
    await writeFile(join(directory, 'src/model.ts'), code);
    const frozenAt = '2026-10-10T00:00:00.000Z';
    await writeFile(join(directory, 'data/reliability/snapshot.json'), JSON.stringify({ frozenAt, model,
      codeSha256: createHash('sha256').update(code).digest('hex') }));
    const mock = join(directory, 'mock.mjs');
    await writeFile(mock, `Date.now = () => Date.parse('2026-10-10T03:00:00.000Z') + 1000;
      globalThis.fetch = async (input) => {
        const url = new URL(input);
        if (url.pathname === '/v2/patches') return new Response('[]');
        const start = Number(url.searchParams.get('min_unix_timestamp'));
        return Response.json([{ match_id: start, start_time: new Date(start * 1000).toISOString().slice(0, 19).replace('T', ' '),
          winning_team: 'Team0', match_outcome: 'TeamWin', game_mode: 'Normal', match_mode: 'Unranked', not_scored: false, duration_s: 1200,
          players: Array.from({ length: 12 }, (_, i) => ({ hero_id: i + 1, team: i < 6 ? 'Team0' : 'Team1', account_id: 999 })) }]);
      };`);
    const run = () => spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, resolve('src/check-reliability.ts')], { cwd: directory, encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const before = await readFile(join(directory, 'data/reliability/matches.json'), 'utf8');
    const state = JSON.parse(before);
    assert.equal(state.rows.length, 1);
    assert.equal(state.windows.length, 1);
    assert.ok(!before.includes('account_id'));
    assert.ok(state.rows[0].startedAt > frozenAt);
    assert.equal(run().status, 0);
    assert.equal(await readFile(join(directory, 'data/reliability/matches.json'), 'utf8'), before);
    await writeFile(join(directory, 'src/model.ts'), 'changed');
    const changed = run();
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /Frozen scoring code changed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
