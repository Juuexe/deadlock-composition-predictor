import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { trainModel } from '../src/model.ts';

test('new roster evidence is separately labeled, hash matched and sanitized',async()=>{
  const original=process.cwd(),fixture=await mkdtemp(resolve('work/roster-evidence-'));
  const teamA=[1,2,3,4,5,78],teamB=[7,8,9,10,11,12];
  const model=trainModel([{matchId:1,startedAt:'2026-01-01T00:00:00.000Z',teamA,teamB,winner:'A'}],.01);
  const hash=createHash('sha256').update(JSON.stringify(model)).digest('hex');
  const report={modelSha256:hash,generatedAt:'2026-01-02T00:00:00.000Z',frozenAt:'2026-01-01T20:00:00.000Z',
    coverage:1,overall:{count:1000,accuracy:.6,logLoss:.66,brierScore:.23},weights:{private:123}};
  await mkdir(resolve(fixture,'docs'));
  await writeFile(resolve(fixture,'docs/roster-release.json'),JSON.stringify(report));
  process.chdir(fixture);
  const server=createApp(model,[...teamA,...teamB].map(id=>({id,name:`Hero ${id}`})));
  try {
    await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
    const address=server.address();if(!address||typeof address==='string')throw Error();
    const base=`http://127.0.0.1:${address.port}`;
    const evidence=await(await fetch(base+'/api/evidence')).json();
    assert.equal(evidence.reliability,null);
    assert.equal(evidence.holdout.count,1000);
    assert.ok(!JSON.stringify(evidence).includes('weights'));
    assert.deepEqual(evidence.unsupportedHeroes,[]);
    const res=await fetch(base+'/api/predict',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({teamA,teamB})});
    assert.equal(res.status,200);
    const prediction=await res.json();assert.ok(prediction.heroSupport.some((h:{heroId:number})=>h.heroId===78));
    await writeFile(resolve(fixture,'docs/roster-release.json'),JSON.stringify({...report,modelSha256:'0'.repeat(64)}));
    assert.equal((await(await fetch(base+'/api/evidence')).json()).holdout,null);
  } finally {
    await new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r());});
    process.chdir(original);await rm(fixture,{recursive:true,force:true});
  }
});
