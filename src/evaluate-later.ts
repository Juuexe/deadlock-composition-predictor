import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseModel, parseMatches, predict, evaluate, laterMatches } from './model.ts';
import { saveJson } from './files.ts';

const artifact: unknown = JSON.parse(await readFile('models/prior-baseline.json', 'utf8'));
if (!artifact || typeof artifact !== 'object' || !('model' in artifact) || !('report' in artifact)
  || !artifact.report || typeof artifact.report !== 'object' || !('generatedAt' in artifact.report)
  || typeof artifact.report.generatedAt !== 'string' || !Number.isFinite(Date.parse(artifact.report.generatedAt))) throw new Error('Invalid frozen model metadata.');
const model = parseModel(artifact.model);
const frozenAt = new Date(artifact.report.generatedAt).toISOString();
const input = await readFile('data/matches.json', 'utf8');
const rows = laterMatches(parseMatches(JSON.parse(input)), frozenAt);
if (!rows.length) throw new Error('No matches started after the frozen model was saved.');
const supported = rows.filter(row => [...row.teamA, ...row.teamB].every(hero => Object.hasOwn(model.weights, hero)));
if (!supported.length) throw new Error('No supported later compositions.');
const score = evaluate(supported, row => predict(model, row));
const coinFlip = evaluate(supported, () => 0.5);
const report = {
  generatedAt: new Date().toISOString(), frozenAt, frozenModelKind: model.kind,
  datasetSha256: createHash('sha256').update(input).digest('hex'),
  first: supported.map(row => row.startedAt).sort()[0], last: supported.map(row => row.startedAt).sort().at(-1),
  totalLaterMatches: rows.length, coverage: supported.length / rows.length, score, coinFlip,
  limitations: 'This evaluates the saved prior model only, without refitting on these matches. Available API matches are not a population sample; patches and calibration remain unverified. It is not prospective validation of the newly trained pair candidate.',
};
await saveJson('docs/prospective-evaluation.json', report);
console.log(JSON.stringify({ matches: score.count, coverage: report.coverage, accuracy: score.accuracy, logLoss: score.logLoss, brierScore: score.brierScore, coinFlipLogLoss: coinFlip.logLoss }, null, 2));
