import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustProbability } from '../src/calibration.ts';

test('calibration preserves ties, team swaps and ordering while compressing stronger confidence', () => {
  const curve = { slope: 1, compression: 0.1 };
  assert.equal(adjustProbability(0.5, curve), 0.5);
  assert.ok(adjustProbability(0.8, curve) < 0.8);
  assert.ok(adjustProbability(0.8, curve) > adjustProbability(0.6, curve));
  assert.ok(Math.abs(adjustProbability(0.8, curve) + adjustProbability(0.2, curve) - 1) < 1e-12);
  assert.throws(() => adjustProbability(0.6, { slope: -1, compression: 0 }));
  assert.throws(() => adjustProbability(NaN, curve));
});
