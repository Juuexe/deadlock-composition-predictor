import assert from 'node:assert/strict';
import test from 'node:test';
import { trainModel, predict, evaluate, chronologicalSplit, rosterCohort, parseModel, parseMatches } from '../src/model.ts';
import type { TrainingMatch } from '../src/data.ts';

const teamA = [1, 2, 3, 4, 5, 6];
const teamB = [7, 8, 9, 10, 11, 12];
const rows: TrainingMatch[] = Array.from({ length: 100 }, (_, i) => ({
  matchId: i + 1, startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  teamA: i % 2 ? teamB : teamA, teamB: i % 2 ? teamA : teamB,
  winner: i % 2 ? 'B' : 'A',
}));

test('learns an outcome signal and respects team swaps and hero ordering', () => {
  const model = trainModel(rows, 0.01);
  const probability = predict(model, { teamA, teamB });
  assert.ok(probability > 0.8 && probability < 1);
  assert.ok(Math.abs(probability + predict(model, { teamA: teamB, teamB: teamA }) - 1) < 1e-12);
  assert.equal(probability, predict(model, { teamA: [...teamA].reverse(), teamB }));
  assert.ok(evaluate(rows, row => predict(model, row)).logLoss < Math.log(2));
});

test('rejects missing, repeated and unseen heroes rather than treating them as neutral', () => {
  const model = trainModel(rows, 0.01);
  assert.throws(() => predict(model, { teamA: teamA.slice(1), teamB }));
  assert.throws(() => predict(model, { teamA, teamB: teamA }));
  assert.throws(() => predict(model, { teamA: [99, ...teamA.slice(1)], teamB }));
  assert.throws(() => trainModel([], 0.01));
});

test('splits chronologically with no shared timestamps or duplicate match IDs', () => {
  const split = chronologicalSplit([...rows].reverse());
  assert.ok(split.train.at(-1)!.startedAt < split.validation[0].startedAt);
  assert.ok(split.validation.at(-1)!.startedAt < split.test[0].startedAt);
  assert.equal(split.train.length + split.validation.length + split.test.length, rows.length);
  assert.throws(() => chronologicalSplit([...rows, rows[0]]));
  assert.throws(() => chronologicalSplit(rows.map(row => ({ ...row, startedAt: rows[0].startedAt }))));
});

test('a 50/50 baseline has known probability metrics', () => {
  const result = evaluate(rows, () => 0.5);
  assert.equal(result.brierScore, 0.25);
  assert.ok(Math.abs(result.logLoss - Math.log(2)) < 1e-12);
  assert.equal(result.calibration.reduce((n, bin) => n + bin.count, 0), rows.length);
  assert.throws(() => evaluate(rows, () => NaN));
});

test('roster cohort starts at the newest first observation without using outcomes', () => {
  const recent = rows.map((row, i) => i < 50 ? row : { ...row, teamA: [99, ...row.teamA.slice(1)] });
  const cohort = rosterCohort(recent);
  assert.equal(cohort.rows.length, 50);
  assert.equal(cohort.since, rows[50].startedAt);
  assert.equal(rosterCohort(recent.map(row => ({ ...row, winner: row.winner === 'A' ? 'B' : 'A' }))).since, cohort.since);
});

test('rejects corrupt model files and training files containing player data', () => {
  const model = trainModel(rows, 0.01);
  assert.deepEqual(parseModel(JSON.parse(JSON.stringify(model))), model);
  for (const value of [null, {}, { ...model, weights: {} }, { ...model, weights: { 1: 'bad' } },
    { ...model, counts: {} }, { ...model, regularization: -1 }]) assert.throws(() => parseModel(value));
  assert.throws(() => parseMatches([{ ...rows[0], accountId: 123 }]));
  assert.throws(() => parseMatches([{ ...rows[0], winner: 'unknown' }]));
});
