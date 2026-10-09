import { readFile } from 'node:fs/promises';
import { createApp } from './server.ts';
import { parseModel } from './model.ts';

const artifact: unknown = JSON.parse(await readFile('models/baseline.json', 'utf8'));
if (!artifact || typeof artifact !== 'object' || !('model' in artifact)) throw new Error('Run npm run train first.');
const model = parseModel(artifact.model);
const catalog: unknown = JSON.parse(await readFile('data/heroes.json', 'utf8'));
if (!Array.isArray(catalog) || !catalog.length || catalog.some(hero => !hero || typeof hero !== 'object'
  || !Number.isSafeInteger(hero.id) || hero.id <= 0 || typeof hero.name !== 'string')) throw new Error('Invalid hero catalog. Run npm run import:data first.');
const heroes = catalog.map(hero => ({ id: Number(hero.id), name: String(hero.name) }));
const server = createApp(model, heroes);
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(3000, '127.0.0.1', () => console.log('Deadlock composition lab: http://127.0.0.1:3000'));
