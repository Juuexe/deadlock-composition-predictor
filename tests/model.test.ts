import assert from 'node:assert/strict';
import test from 'node:test';
import { trainModel, predict, evaluate, chronologicalSplit, rosterCohort, parseModel, parseMatches, pairTerms, laterMatches, calibrate } from '../src/model.ts';
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

test('synergy pairs are unordered and opponent terms reverse sign when teams swap', () => {
  const terms = pairTerms({ teamA, teamB });
  assert.equal(terms.length, 66);
  assert.deepEqual(terms.find(([key]) => key === 's:1:2'), ['s:1:2', 1]);
  assert.deepEqual(terms.find(([key]) => key === 's:7:8'), ['s:7:8', -1]);
  assert.deepEqual(terms.find(([key]) => key === 'c:1:7'), ['c:1:7', 1]);
  const reversed = new Map(pairTerms({ teamA: teamB, teamB: teamA }));
  for (const [key, sign] of terms) assert.equal(reversed.get(key), -sign);
  assert.deepEqual(pairTerms({ teamA: [...teamA].reverse(), teamB }), terms);
});

test('pair models round trip, learn pair weights, and reject corrupt pair artifacts', () => {
  const model = trainModel(rows, 0.01, true);
  assert.equal(model.kind, 'hero-pairs-logistic-v1');
  assert.ok(Object.keys(model.pairs ?? {}).some(key => key.startsWith('s:')));
  assert.ok(Object.keys(model.pairs ?? {}).some(key => key.startsWith('c:')));
  assert.deepEqual(parseModel(JSON.parse(JSON.stringify(model))), model);
  assert.ok(predict(model, { teamA, teamB }) > 0.8);
  assert.ok(Math.abs(predict(model, { teamA, teamB }) + predict(model, { teamA: teamB, teamB: teamA }) - 1) < 1e-12);
  assert.throws(() => parseModel({ ...model, pairs: { 's:2:1': 0.1 }, pairCounts: { 's:2:1': 30 } }));
  assert.throws(() => parseModel({ ...model, pairCounts: {} }));
  const rare = trainModel(rows.slice(0, 10), 0.01, true);
  assert.equal(Object.keys(rare.pairs ?? {}).length, 0);
});

test('prediction actually applies synergy and matchup coefficients independently of hero strength', () => {
  const model = parseModel({
    kind: 'hero-pairs-logistic-v1', regularization: 0.01,
    weights: Object.fromEntries([...teamA, ...teamB].map(hero => [hero, 0])),
    counts: Object.fromEntries([...teamA, ...teamB].map(hero => [hero, 30])),
    pairs: { 's:1:2': 0.4, 'c:1:7': 0.2 }, pairCounts: { 's:1:2': 30, 'c:1:7': 30 },
  });
  assert.ok(Math.abs(predict(model, { teamA, teamB }) - 1 / (1 + Math.exp(-0.6))) < 1e-12);
  assert.ok(Math.abs(predict(model, { teamA: teamB, teamB: teamA }) - 1 / (1 + Math.exp(0.6))) < 1e-12);
});

test('prospective evaluation excludes matches at or before the saved model time', () => {
  assert.deepEqual(laterMatches(rows, rows[49].startedAt), rows.slice(50));
  assert.equal(laterMatches(rows, rows.at(-1)!.startedAt).length, 0);
  assert.throws(() => laterMatches(rows, 'bad'));
  assert.throws(() => laterMatches([...rows, rows[0]], rows[49].startedAt));
});

test('temperature calibration reduces overconfidence without breaking team symmetry', () => {
  const model = trainModel(rows, 0.001);
  const calibration = rows.map((row, i) => ({ ...row, winner: i % 5 === 0 ? (row.winner === 'A' ? 'B' : 'A') as 'A' | 'B' : row.winner }));
  const calibrated = calibrate(model, calibration);
  assert.ok(evaluate(calibration, row => predict(calibrated, row)).logLoss < evaluate(calibration, row => predict(model, row)).logLoss);
  assert.ok(Math.abs(predict(calibrated, { teamA, teamB }) + predict(calibrated, { teamA: teamB, teamB: teamA }) - 1) < 1e-12);
  assert.throws(() => parseModel({ ...model, temperature: 0 }));
});
