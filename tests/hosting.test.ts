import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { predict, type HeroModel } from '../src/model.ts';
import handler from '../api/index.ts';
test('hosted adapter forwards routes and accepts platform-parsed JSON without exposing model artifacts',async t=>{
  const teamA=[1,2,3,4,5,6],teamB=[7,8,9,10,11,12];
  process.env.MODEL_JSON=JSON.stringify({kind:'hero-logistic-v1',regularization:0.01,weights:Object.fromEntries([...teamA,...teamB].map(id=>[id,0])),counts:Object.fromEntries([...teamA,...teamB].map(id=>[id,100]))});
  process.env.HEROES_JSON=JSON.stringify([...teamA,...teamB].map(id=>({id,name:`Hero ${id}`})));
  const server=createServer((req,res)=>{
    if(req.method==='POST') Object.assign(req,{body:{teamA,teamB}});
    handler(req,res);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const address=server.address(); if(!address||typeof address==='string')throw new Error();
  const base=`http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/api/index?route=health`)).status,200);
  const response=await fetch(`${base}/api/index?route=predict`,{method:'POST',headers:{'Content-Type':'application/json'}});
  assert.equal(response.status,200);assert.equal((await response.json()).teamAWinProbability,0.5);
  assert.equal((await fetch(`${base}/api/index?route=../models/baseline.json`)).status,404);
});

test('hosted compressed models preserve scores and reject corrupt or oversized payloads',async()=>{
  const teamA=[1,2,3,4,5,6],teamB=[7,8,9,10,11,12];
  const model:HeroModel={kind:'hero-logistic-v1',regularization:.001,
    weights:Object.fromEntries([...teamA,...teamB].map(id=>[id,id/100])),counts:Object.fromEntries([...teamA,...teamB].map(id=>[id,100]))};
  const encoded='gzip:'+gzipSync(JSON.stringify(model)).toString('base64');
  process.env.HEROES_JSON=JSON.stringify([...teamA,...teamB].map(id=>({id,name:`Hero ${id}`})));
  for(const [i,value] of [encoded,encoded.slice(0,encoded.length/2),'gzip:invalid','gzip:'+gzipSync('x'.repeat(1048577)).toString('base64')].entries()) {
    process.env.MODEL_JSON=value;
    const {default:freshHandler}=await import(new URL(`../api/index.ts?compressed=${i}`,import.meta.url).href);
    const server=createServer((req,res)=>{Object.assign(req,{body:{teamA,teamB}});freshHandler(req,res);});
    await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
    try {
      const address=server.address();if(!address||typeof address==='string')throw new Error();
      const base=`http://127.0.0.1:${address.port}`;
      const response=await fetch(base+'/api/index?route=predict',{method:'POST',headers:{'content-type':'application/json'}});
      assert.equal(response.status,i===0?200:503);
      const result=await response.json();
      if(i===0) {
        assert.equal(result.teamAWinProbability,predict(model,{teamA,teamB}));
        const health=await(await fetch(base+'/api/index?route=health')).json();
        assert.equal(health.modelVersion,createHash('sha256').update(JSON.stringify(model)).digest('hex').slice(0,12));
      } else assert.deepEqual(result,{error:'Prediction service unavailable. Retry later.'});
    } finally {await new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r());});}
  }
});
