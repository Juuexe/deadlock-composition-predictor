import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTreeModel, predictTree } from '../src/nonlinear.ts';

const model = { kind: 'composition-boosted-trees-v1', heroes: Array.from({ length: 12 }, (_, i) => i + 1), learningRate: 0.1,
  trees: [[{ feature: 0, threshold: 0, left: 1, right: 2, value: 0 },
    { feature: -2, threshold: -2, left: -1, right: -1, value: -2 },
    { feature: -2, threshold: -2, left: -1, right: -1, value: 2 }]] };
const composition = { teamA: [1, 2, 3, 4, 5, 6], teamB: [7, 8, 9, 10, 11, 12] };

test('exported trees preserve conditional scores, hero order and team-swap symmetry', () => {
  const parsed = parseTreeModel(model);
  const p = predictTree(parsed, composition);
  assert.ok(Math.abs(p - 1 / (1 + Math.exp(-0.2))) < 1e-12);
  assert.equal(predictTree(parsed, { ...composition, teamA: [...composition.teamA].reverse() }), p);
  assert.ok(Math.abs(p + predictTree(parsed, { teamA: composition.teamB, teamB: composition.teamA }) - 1) < 1e-12);
  assert.throws(() => predictTree(parsed, { ...composition, teamA: [13, 2, 3, 4, 5, 6] }), /unsupported/);
});

test('tree parser rejects cycles, invalid features and nonfinite coefficients', () => {
  assert.throws(() => parseTreeModel({ ...model, learningRate: NaN }));
  assert.throws(() => parseTreeModel({ ...model, trees: [[{ ...model.trees[0][0], left: 0 }, ...model.trees[0].slice(1)]] }));
  assert.throws(() => parseTreeModel({ ...model, trees: [[{ ...model.trees[0][0], feature: 99 }, ...model.trees[0].slice(1)]] }));
});
