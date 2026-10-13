import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseModel } from './model.ts';
import { saveJson } from './files.ts';

await mkdir('models/releases',{recursive:true});
const current=JSON.parse(await readFile('models/baseline.json','utf8'));
const model=parseModel(current.model);
const id=createHash('sha256').update(JSON.stringify(model)).digest('hex').slice(0,12);
try { await writeFile(`models/releases/${id}.json`,JSON.stringify(current,null,2)+'\n',{flag:'wx'}); }
catch(error) { if(!(error instanceof Error&&'code'in error&&error.code==='EEXIST'))throw error; }
const archived=JSON.parse(await readFile(`models/releases/${id}.json`,'utf8'));
if(createHash('sha256').update(JSON.stringify(parseModel(archived.model))).digest('hex').slice(0,12)!==id) throw new Error('Existing archive integrity mismatch; active model preserved.');
const target=process.argv[2];
if(target) {
  if(!/^[a-f0-9]{12}$/.test(target))throw new Error('Use an archived 12-character model version.');
  const artifact=JSON.parse(await readFile(`models/releases/${target}.json`,'utf8'));
  const replacement=parseModel(artifact.model);
  if(createHash('sha256').update(JSON.stringify(replacement)).digest('hex').slice(0,12)!==target)throw new Error('Archived model integrity mismatch.');
  await saveJson('models/baseline.json',artifact);
  console.log(`Restored ${target}. Restart the app; the old reliability snapshot remains unchanged.`);
} else console.log(`Archived active version ${id}. Model unchanged.`);
