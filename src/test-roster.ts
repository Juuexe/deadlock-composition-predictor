import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadPlan, loadPartition, claimTest } from './research-files.ts';
import { parseModel } from './model.ts';
import { evaluateRoster, rosterPolicy } from './roster-evaluation.ts';
import { saveJson } from './files.ts';
import { getJson } from './api.ts';
import { parseAnnouncements } from './research.ts';

const plan=await loadPlan();
const text=await readFile(`${plan.directory}/candidate.json`,'utf8');
const candidate=JSON.parse(text);
const model=parseModel(candidate.model),incumbent=parseModel(candidate.incumbent);
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const modelCode=await readFile(new URL('./model.ts',import.meta.url));
if(candidate.planId!==plan.id||candidate.scoringCodeSha256!==hash(modelCode))throw new Error('Frozen candidate or scoring code changed.');
const scoringHash=hash(Buffer.concat([modelCode,await readFile(new URL('./roster-evaluation.ts',import.meta.url)),await readFile(new URL('./test-roster.ts',import.meta.url))]));
const identity={planId:plan.id,candidateSha256:hash(text),scoringHash,partitions:plan.partitions,policy:rosterPolicy};
const path=`${plan.directory}/roster-protocol.json`;
try { await access(`${plan.directory}/test-opened.json`); throw new Error('Final test already opened. Do not reuse this experiment.'); }
catch(error) { if(!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error; }
if(process.argv[2]==='--freeze') {
  await writeFile(path,JSON.stringify({frozenAt:new Date().toISOString(),...identity},null,2)+'\n',{flag:'wx'});
  console.log('Roster protocol frozen. Final test NOT OPENED; public model unchanged.');
} else {
  if(process.argv[2])throw new Error('Use --freeze once, then run without arguments.');
  const {frozenAt,...protocol}=JSON.parse(await readFile(path,'utf8'));
  if(typeof frozenAt!=='string'||!Number.isFinite(Date.parse(frozenAt))||JSON.stringify(protocol)!==JSON.stringify(identity))throw new Error('Roster protocol changed. Test NOT OPENED; do not change a frozen experiment.');
  const boundary=parseAnnouncements(await getJson('https://api.deadlock-api.com/v2/patches')).find(event=>event.at>plan.currentPeriod
    &&Date.parse(event.at)-3600000<=Date.parse(plan.partitions.test.last)+7200000);
  if(boundary)throw new Error(`Gameplay announcement interrupts the test: ${boundary.title}. Test NOT OPENED.`);
  await claimTest(plan,identity.candidateSha256);
  const rows=await loadPartition(plan,'test');
  const report={generatedAt:new Date().toISOString(),planId:plan.id,announcementPeriod:plan.currentPeriod,
    candidateSha256:identity.candidateSha256,modelVersion:hash(JSON.stringify(model)).slice(0,12),
    incumbentVersion:hash(JSON.stringify(incumbent)).slice(0,12),scoringHash,
    ...evaluateRoster(model,incumbent,rows),deployed:false,
    limitations:'Single-use chronological holdout; point-estimate gates, API-capped availability sampling and announcement-time proxies. No future-day reliability certification. New-hero comparison is against 50/50 because the incumbent abstains. Test labels are spent; no tuning or repeated selection.'};
  await saveJson(`${plan.directory}/roster-result.json`,report);
  await saveJson('docs/roster-evaluation.json',report);
  console.log(JSON.stringify({passed:report.passed,modelVersion:report.modelVersion,overall:report.overall.candidate,
    common:report.common,newHeroes:report.newHeroes,deployed:false},null,2));
}
