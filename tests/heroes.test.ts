import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHeroes } from '../src/heroes.ts';
test('hero catalog accepts approved portraits and rejects arbitrary remote URLs', () => {
  const portrait = 'https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/inferno_sm.webp';
  assert.deepEqual(parseHeroes([{id:1,name:'Infernus',portrait}]), [{id:1,name:'Infernus',portrait}]);
  assert.deepEqual(parseHeroes([{id:1,name:'Infernus'}]), [{id:1,name:'Infernus'}]);
  assert.throws(() => parseHeroes([{id:1,name:'Infernus',portrait:'https://evil.example/icon.png'}]));
  assert.throws(() => parseHeroes([{id:1,name:'A'},{id:1,name:'B'}]));
});
