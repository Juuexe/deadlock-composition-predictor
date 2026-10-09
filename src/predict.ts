import { readFile } from 'node:fs/promises';
import { parseModel, predict, validateComposition } from './model.ts';

if (process.argv.length !== 4) throw new Error('Usage: npm run predict -- "1,2,3,4,5,6" "7,8,9,10,11,12" (six hero IDs per team).');
const composition = { teamA: process.argv[2].split(',').map(Number), teamB: process.argv[3].split(',').map(Number) };
validateComposition(composition);
const artifact: unknown = JSON.parse(await readFile('models/baseline.json', 'utf8'));
if (!artifact || typeof artifact !== 'object' || !('model' in artifact)) throw new Error('Invalid model artifact. Run npm run train first.');
const model = parseModel(artifact.model);
const probability = predict(model, composition);
console.log(JSON.stringify({
  status: 'experimental',
  teamAWinProbability: probability, teamBWinProbability: 1 - probability,
  favoredTeam: probability === 0.5 ? 'even' : probability > 0.5 ? 'A' : 'B',
  heroSupport: [...composition.teamA, ...composition.teamB].map(heroId => ({ heroId, trainingAppearances: model.counts[heroId] })),
  limitations: 'Hero-strength baseline only. Short exploratory holdout; accuracy and calibration are not established for future matches. No synergy or counter terms yet.',
}, null, 2));
