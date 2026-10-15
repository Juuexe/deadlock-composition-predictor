import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadPlan, loadPartition } from './research-files.ts';
import { calibrate, evaluate, trainModel, predict } from './model.ts';
import { parseTreeModel, predictTree, type TreeModel } from './nonlinear.ts';
import { saveJson } from './files.ts';

const plan = await loadPlan();
const directory = `${plan.directory}/nonlinear`;
await mkdir(directory, { recursive: true });
const destination = `${directory}/candidate.json`;
try { await access(destination); throw new Error('Nonlinear candidate already frozen; do not retune this experiment.'); }
catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
const train = await loadPartition(plan, 'train');
const validation = await loadPartition(plan, 'validation');
const calibration = await loadPartition(plan, 'calibration');
// Reliability evaluation remains strictly later than every development partition.
const snapshot = JSON.parse(await readFile('data/reliability/snapshot.json', 'utf8'));
if (typeof snapshot.frozenAt !== 'string' || !Number.isFinite(Date.parse(snapshot.frozenAt))
  || [...train, ...validation, ...calibration].some(row => row.startedAt >= snapshot.frozenAt)) throw new Error('Development data overlaps the reserved reliability period.');
const ids = [...train, ...validation, ...calibration].map(row => row.matchId);
if (new Set(ids).size !== ids.length) throw new Error('Development partitions overlap.');
let baseline = trainModel(train, 0.001);
const supported = validation.filter(row => [...row.teamA, ...row.teamB].every(hero => Object.hasOwn(baseline.weights, hero)));
const calibrationRows = calibration.filter(row => [...row.teamA, ...row.teamB].every(hero => Object.hasOwn(baseline.weights, hero)));
if (supported.length < 200 || supported.length / validation.length < 0.95
  || calibrationRows.length < 200 || calibrationRows.length / calibration.length < 0.95) throw new Error('Insufficient development coverage.');
let baselineScore = evaluate(supported, row => predict(baseline, row));
for (const lambda of [0.01, 0.1]) {
  const candidate = trainModel(train, lambda);
  const score = evaluate(supported, row => predict(candidate, row));
  if (score.logLoss < baselineScore.logLoss) { baseline = candidate; baselineScore = score; }
}
await writeFile(`${directory}/input.json`, JSON.stringify({ train, validation: supported }), { flag: 'wx' });
console.log(`Training four fixed boosted-tree candidates on ${train.length} matches; final test remains closed.`);
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
await promisify(execFile)(python, ['research/train_trees.py', `${directory}/input.json`, `${directory}/trees.json`], { timeout: 300000 });
const output: unknown = JSON.parse(await readFile(`${directory}/trees.json`, 'utf8'));
if (!output || typeof output !== 'object' || !('candidates' in output) || !Array.isArray(output.candidates) || output.candidates.length !== 4) throw new Error('Invalid trainer output.');
let model: TreeModel | undefined;
let best: ReturnType<typeof evaluate> | undefined;
const comparisons = [];
for (const entry of output.candidates) {
  const candidate = parseTreeModel(entry.model);
  if (!Array.isArray(entry.validationProbabilities) || entry.validationProbabilities.length !== supported.length) throw new Error('Invalid Python probabilities.');
  // Every exported prediction must agree with scikit-learn before selection.
  for (let i = 0; i < supported.length; i++) {
    const p = entry.validationProbabilities[i];
    if (!Number.isFinite(p) || Math.abs(p - predictTree(candidate, supported[i])) > 1e-10) throw new Error('Python/Node tree scoring mismatch.');
  }
  const score = evaluate(supported, row => predictTree(candidate, row));
  comparisons.push({ depth: entry.depth, rounds: entry.rounds, validation: score });
  if (!best || score.logLoss < best.logLoss) { model = candidate; best = score; }
}
if (!model || !best) throw new Error('No tree candidate.');
const passedValidation = best.logLoss < baselineScore.logLoss && best.brierScore < baselineScore.brierScore;
const before = evaluate(calibrationRows, row => predictTree(model!, row));
let calibrationScore = before;
for (const temperature of [0.5, 0.75, 1, 1.25, 1.5, 2, 3]) {
  const candidate: TreeModel = { ...model, temperature };
  const score = evaluate(calibrationRows, row => predictTree(candidate, row));
  if (score.logLoss < calibrationScore.logLoss) { model = candidate; calibrationScore = score; }
}
baseline = calibrate(baseline, calibrationRows);
const frozenAt = new Date().toISOString();
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const frozen = { planId: plan.id, frozenAt, model, baseline, passedValidation,
  scoringCodeSha256: hash(await readFile('src/nonlinear.ts')), trainerSha256: hash(await readFile('research/train_trees.py')),
  baselineCodeSha256: hash(await readFile('src/model.ts')),
  inputSha256: hash(await readFile(`${directory}/input.json`)),
  promotionPolicy: 'Validation must beat the matched logistic baseline on log loss and Brier score. Then freeze and require a new independent later test; no automatic deployment from validation.' };
await writeFile(destination, JSON.stringify(frozen, null, 2) + '\n', { flag: 'wx' });
const report = { generatedAt: frozenAt, planId: plan.id, trainCount: train.length, validationCount: supported.length,
  validationCoverage: supported.length / validation.length, calibrationCount: calibrationRows.length,
  baselineValidation: baselineScore, treeValidation: best, comparisons, passedValidation,
  calibration: { before, after: calibrationScore, temperature: model!.temperature ?? 1 },
  baselineCalibration: evaluate(calibrationRows, row => predict(baseline, row)),
  sklearnVersion: 'sklearnVersion' in output ? output.sklearnVersion : null,
  status: passedValidation ? 'Candidate frozen; fresh independent final test still required.' : 'Rejected at validation; active predictor unchanged.',
  finalTest: 'NOT READ. Previous final-test labels are spent and cannot be reused.',
  limitations: 'Reused development partitions provide exploratory selection evidence only. Four fixed tree configurations, one short roster period, API availability sampling. The matched baseline trains only on the same earlier data; it is not the newer deployed model. No player features. No reliability matches used. Calibration does not establish future-day reliability.' };
await saveJson(`${directory}/report.json`, report);
await saveJson('docs/nonlinear-evaluation.json', report);
console.log(JSON.stringify({ status: report.status, train: train.length, validation: supported.length,
  baselineAccuracy: baselineScore.accuracy, treeAccuracy: best.accuracy,
  baselineLogLoss: baselineScore.logLoss, treeLogLoss: best.logLoss,
  baselineBrier: baselineScore.brierScore, treeBrier: best.brierScore, temperature: report.calibration.temperature }, null, 2));
