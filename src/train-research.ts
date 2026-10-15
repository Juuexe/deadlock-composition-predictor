import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadPlan, loadPartition } from './research-files.ts';
import { calibrate, evaluate, parseModel, predict, trainModel } from './model.ts';

const plan = await loadPlan();
const destination = `${plan.directory}/candidate.json`;
try { await access(destination); throw new Error('Candidate already frozen. Prepare a new experiment instead of retuning this one.'); }
catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
const train = await loadPartition(plan, 'train');
const validation = await loadPartition(plan, 'validation');
const summary = (score: ReturnType<typeof evaluate>) => ({ count: score.count, accuracy: score.accuracy, logLoss: score.logLoss, brierScore: score.brierScore });
let model = trainModel(train, 0.001);
const supported = validation.filter(row => [...row.teamA, ...row.teamB].every(hero => Object.hasOwn(model.weights, hero)));
if (supported.length < 200 || supported.length / validation.length < 0.95) throw new Error('Validation coverage is insufficient; collect more data.');
let best = evaluate(supported, row => predict(model, row));
const comparisons = [{ kind: model.kind, regularization: 0.001, validation: summary(best) }];
for (const interactions of [false, true]) for (const regularization of [0.001, 0.01, 0.1]) {
  if (!interactions && regularization === 0.001) continue;
  const candidate = trainModel(train, regularization, interactions);
  const score = evaluate(supported, row => predict(candidate, row));
  comparisons.push({ kind: candidate.kind, regularization, validation: summary(score) });
  if (score.logLoss < best.logLoss && (!interactions || score.brierScore < best.brierScore)) { model = candidate; best = score; }
  console.log(`Compared ${candidate.kind}, regularization ${regularization}.`);
}
const calibration = await loadPartition(plan, 'calibration');
const calibrationRows = calibration.filter(row => [...row.teamA, ...row.teamB].every(hero => Object.hasOwn(model.weights, hero)));
if (calibrationRows.length < 200 || calibrationRows.length / calibration.length < 0.95) throw new Error('Calibration coverage is insufficient.');
const uncalibrated = model;
model = calibrate(model, calibrationRows);
const incumbentArtifact: unknown = JSON.parse(await readFile('models/baseline.json', 'utf8'));
if (!incumbentArtifact || typeof incumbentArtifact !== 'object' || !('model' in incumbentArtifact)) throw new Error('Invalid incumbent model.');
const frozen = {
  planId: plan.id, frozenAt: new Date().toISOString(), model, incumbent: parseModel(incumbentArtifact.model),
  scoringCodeSha256: createHash('sha256').update(await readFile('src/model.ts')).digest('hex'),
  trainingWinRate: train.filter(row => row.winner === 'A').length / train.length,
  comparisons, validation: summary(best), calibration: {
    count: calibrationRows.length, temperature: model.temperature,
    before: summary(evaluate(calibrationRows, row => predict(uncalibrated, row))),
    after: summary(evaluate(calibrationRows, row => predict(model, row))),
  },
  protocol: 'No final-test file was read during training, selection or calibration.',
  promotionPolicy: 'At least 500 supported final-test matches, 95% common coverage, and lower log loss and Brier score than both the frozen incumbent and 50/50. No retuning after test opening.',
};
await writeFile(destination, JSON.stringify(frozen, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ selected: model.kind, temperature: model.temperature, train: train.length, validation: supported.length, calibration: calibrationRows.length, finalTest: 'NOT OPENED' }, null, 2));
