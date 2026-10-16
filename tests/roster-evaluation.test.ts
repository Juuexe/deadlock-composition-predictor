import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRoster, rosterPolicy } from '../src/roster-evaluation.ts';
import type { HeroModel } from '../src/model.ts';
import type { TrainingMatch } from '../src/data.ts';

const old: HeroModel = { kind:'hero-logistic-v1', regularization:.01,
  weights:Object.fromEntries(Array.from({length:12},(_,i)=>[i+1,0])),
  counts:Object.fromEntries(Array.from({length:12},(_,i)=>[i+1,1000])) };
const candidate: HeroModel = { ...old, weights:{...old.weights,1:1,13:1},counts:{...old.counts,13:1000} };
const rows: TrainingMatch[] = Array.from({length:1000},(_,i)=>({matchId:i+1,startedAt:new Date(1700000000000+i*1000).toISOString(),
  teamA:[i<500?1:13,2,3,4,5,6],teamB:[7,8,9,10,11,12],winner:'A'}));

test('roster gate compares shared matches and requires independent new-hero evidence',()=>{
  const report=evaluateRoster(candidate,old,rows);
  assert.equal(report.common.coverage,1);
  assert.equal(report.overall.coverage,1);
  assert.equal(report.common.candidate?.count,500);
  assert.equal(report.newHeroes[0].candidate?.count,500);
  assert.equal(report.passed,true);
  assert.equal(rosterPolicy.minimumMatches,500);
  assert.equal(evaluateRoster(candidate,old,rows.slice(0,999)).passed,false);
  const wrong=rows.map(r=>({...r,winner:'B' as const}));
  assert.equal(evaluateRoster(candidate,old,wrong).passed,false);
  const incomplete=rows.map((r,i)=>i<60?{...r,teamA:[99,2,3,4,5,6]}:r);
  assert.equal(evaluateRoster(candidate,old,incomplete).passed,false);
  const dropped={...candidate,weights:{...candidate.weights},counts:{...candidate.counts}};delete dropped.weights[12];delete dropped.counts[12];
  assert.throws(()=>evaluateRoster(dropped,old,rows),/retain/);
  assert.throws(()=>evaluateRoster(candidate,old,[...rows,rows[0]]),/Duplicate/);
});

import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

test('roster protocol freezes without reading the test and rejects changed or spent experiments',async t=>{
  const fixture=await mkdtemp(resolve('work/roster-protocol-'));
  t.after(()=>rm(fixture,{recursive:true,force:true}));
  const id=randomUUID(),directory=`data/research/${id}`;
  await mkdir(resolve(fixture,directory),{recursive:true});
  const partitions=Object.fromEntries(['train','validation','calibration','test'].map(k=>[k,{path:`${directory}/${k}.json`,count:500,sha256:'a'.repeat(64),first:rows[0].startedAt,last:rows.at(-1)!.startedAt}]));
  await writeFile(resolve(fixture,'data/research-current.json'),JSON.stringify({id,directory,currentPeriod:rows[0].startedAt,partitions}));
  const code=await readFile(new URL('../src/model.ts',import.meta.url));
  const candidatePath=resolve(fixture,directory,'candidate.json');
  const text=JSON.stringify({planId:id,model:candidate,incumbent:old,scoringCodeSha256:createHash('sha256').update(code).digest('hex')});
  await writeFile(candidatePath,text);
  const run=(...args:string[])=>execFileSync(process.execPath,[resolve('src/test-roster.ts'),...args],{cwd:fixture,stdio:'pipe'}).toString();
  assert.match(run('--freeze'),/NOT OPENED/);
  await assert.rejects(access(resolve(fixture,directory,'test-opened.json')));
  assert.throws(()=>run('--freeze'));
  await writeFile(candidatePath,text+' ');
  assert.throws(()=>run(),/protocol changed/);
  await writeFile(candidatePath,text);
  await writeFile(resolve(fixture,directory,'test-opened.json'),'{}');
  assert.throws(()=>run(),/already opened/);
});
