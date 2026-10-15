import { readFile } from 'node:fs/promises';
import { createApp } from './server.ts';
import { parseModel } from './model.ts';
import { parseHeroes } from './heroes.ts';

const artifact: unknown = JSON.parse(await readFile('models/baseline.json', 'utf8'));
if (!artifact || typeof artifact !== 'object' || !('model' in artifact)) throw new Error('Run npm run train first.');
const model = parseModel(artifact.model);
const catalog: unknown = JSON.parse(await readFile('data/heroes.json', 'utf8'));
const heroes = parseHeroes(catalog);
const server = createApp(model, heroes);
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(3000, '127.0.0.1', () => console.log('Deadlock composition lab: http://127.0.0.1:3000'));
