import assert from 'node:assert/strict';
import test from 'node:test';
import type { Composition } from '../src/composition.ts';

test('composition contract contains only the two teams of hero IDs', () => {
  const input: Composition = { teamA: [1, 2], teamB: [3, 4] };
  assert.deepEqual(Object.keys(input).sort(), ['teamA', 'teamB']);
  // @ts-expect-error Player histories must not be part of the predictor contract.
  const invalid: Composition = { teamA: [1], teamB: [2], playerWinRate: 0.8 };
  void invalid;
});
