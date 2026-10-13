import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
test('rollback verifies version integrity and archives the displaced model',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'deadlock-release-'));
 try {
  await mkdir(join(directory,'models'));
  const model={kind:'hero-logistic-v1',regularization:0.01,weights:{1:0},counts:{1:100}};
  const id=createHash('sha256').update(JSON.stringify(model)).digest('hex').slice(0,12);
  const path=join(directory,'models/baseline.json'); await writeFile(path,JSON.stringify({model}));
  const run=(args:string[]=[])=>spawnSync(process.execPath,[resolve('src/release-model.ts'),...args],{cwd:directory,encoding:'utf8'});
  assert.equal(run().status,0);
  const second={...model,weights:{1:0.1}};await writeFile(path,JSON.stringify({model:second}));
  assert.equal(run([id]).status,0); assert.deepEqual(JSON.parse(await readFile(path,'utf8')).model,model);
  assert.notEqual(run(['../private']).status,0);
  await writeFile(join(directory,`models/releases/${id}.json`),JSON.stringify({model:second}));
  assert.notEqual(run([id]).status,0);assert.deepEqual(JSON.parse(await readFile(path,'utf8')).model,model);
 }finally{await rm(directory,{recursive:true,force:true});}
});
