import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadPlan, loadPartition } from './research-files.ts';
import { trainModel, parseModel, predict, evaluate } from './model.ts';
import { adjustProbability, type CalibrationCurve } from './calibration.ts';
import { saveJson } from './files.ts';

const directory = 'data/calibration-experiment';
await mkdir(directory, { recursive: true });
try { await access(`${directory}/candidate.json`); throw new Error('Calibration candidate already frozen; do not overwrite or retune.'); }
catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
const plan = await loadPlan();
const train = await loadPartition(plan, 'train');
const fit = await loadPartition(plan, 'validation');
const selection = await loadPartition(plan, 'calibration');
const reliability = JSON.parse(await readFile('data/reliability/snapshot.json', 'utf8'));
if ([...train, ...fit, ...selection].some(row => row.startedAt >= reliability.frozenAt)) throw new Error('Development overlaps reliability period.');
if (new Set([...train, ...fit, ...selection].map(row => row.matchId)).size !== train.length + fit.length + selection.length) throw new Error('Development partitions overlap.');
// Fixed historical base avoids fitting calibration to predictions from a model trained on these labels.
const base = trainModel(train, 0.01);
for (const rows of [fit, selection]) if (rows.some(row => [...row.teamA, ...row.teamB].some(id => !Object.hasOwn(base.weights, id)))) throw new Error('Unsupported development hero.');
const score = (rows: typeof fit, curve: CalibrationCurve) => evaluate(rows, row => adjustProbability(predict(base, row), curve));
const identity = { slope: 1, compression: 0 };
let temperature = identity, flexible = identity;
for (const slope of [0.75, 1, 1.25]) {
  const curve = { slope, compression: 0 };
  if (score(fit, curve).logLoss < score(fit, temperature).logLoss) temperature = curve;
  for (const compression of [0.1, 0.25]) {
    const curve = { slope, compression };
    if (score(fit, curve).logLoss < score(fit, flexible).logLoss) flexible = curve;
  }
}
const comparisons = [identity, temperature, flexible].map(curve => ({ curve, fit: score(fit, curve), selection: score(selection, curve) }));
let selected = comparisons[0];
for (const candidate of comparisons.slice(1)) if (candidate.selection.logLoss < selected.selection.logLoss
  && candidate.selection.brierScore < selected.selection.brierScore) selected = candidate;
const incumbent = parseModel(JSON.parse(await readFile('models/baseline.json', 'utf8')).model);
const frozenAt = new Date().toISOString();
const scoringCodeSha256 = createHash('sha256').update(await readFile('src/model.ts')).update(await readFile('src/calibration.ts')).digest('hex');
const candidate = { frozenAt, planId: plan.id, base, curve: selected.curve, incumbent, scoringCodeSha256,
  testProtocol: { minimumMatches: 5000, minimumCoverage: 0.95, minimumHours: 24,
    cutoff: frozenAt, rule: 'Only matches starting strictly after this freeze; no retuning. Lower log loss and Brier score than frozen incumbent required. Evaluation-only future reliability rows may be scored, never fitted.' } };
await writeFile(`${directory}/candidate.json`, JSON.stringify(candidate, null, 2) + '\n', { flag: 'wx' });
const report = { frozenAt, planId: plan.id, trainCount: train.length, fitCount: fit.length, selectionCount: selection.length,
  selected: selected.curve, comparisons, status: 'Frozen for future-only comparison; not deployed.',
  limitations: 'Previously used development partitions are exploratory, not an independent performance test. No spent final test or reliability label was used for fitting. The base is trained on historical training only, distinct from the newer incumbent. Fresh 24-hour comparison is required; gains are not established.' };
await saveJson('docs/calibration-experiment.json', report);
console.log(JSON.stringify({ ...report, comparisons: comparisons.map(item => ({ curve: item.curve, logLoss: item.selection.logLoss, brier: item.selection.brierScore })) }, null, 2));
