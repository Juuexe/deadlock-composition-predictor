import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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
