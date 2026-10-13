import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from '../src/draft.ts';
import type { HeroModel } from '../src/model.ts';
const model: HeroModel = {kind:'hero-logistic-v1',regularization:0.01,
  weights:Object.fromEntries(Array.from({length:14},(_,i)=>[i+1,i===12?1:0])),
  counts:Object.fromEntries(Array.from({length:14},(_,i)=>[i+1,100]))};
test('partial draft recommends distinct supported heroes with deterministic completion estimates', () => {
  const input = {teamA:[1,2,3,4,5],teamB:[6,7,8,9,10,11]};
  const rows = recommend(model,input);
  assert.equal(rows[0].heroId,13);
  assert.equal(rows.length,3);
  assert.deepEqual(rows,recommend(model,input));
  assert.ok(rows.every(row=>row.probability>0&&row.probability<1));
  assert.throws(()=>recommend(model,{...input,teamA:[1,1]}));
  assert.throws(()=>recommend(model,{...input,teamA:[1,2,3,4,5,12]}));
  assert.throws(()=>recommend(model,{...input,teamA:[999]}));
});
