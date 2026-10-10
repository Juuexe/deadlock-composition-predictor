import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadPlan, loadPartition, claimTest } from './research-files.ts';
import { evaluate, parseModel, predict } from './model.ts';
import { saveJson } from './files.ts';

const plan = await loadPlan();
const text = await readFile(`${plan.directory}/candidate.json`, 'utf8');
const frozen: unknown = JSON.parse(text);
if (!frozen || typeof frozen !== 'object' || !('planId' in frozen) || frozen.planId !== plan.id
  || !('model' in frozen) || !('incumbent' in frozen) || !('scoringCodeSha256' in frozen)
  || frozen.scoringCodeSha256 !== createHash('sha256').update(await readFile('src/model.ts')).digest('hex')) throw new Error('Candidate or scoring code changed; do not reuse this final test.');
const model = parseModel(frozen.model), incumbent = parseModel(frozen.incumbent);
await claimTest(plan, createHash('sha256').update(text).digest('hex'));
const rows = await loadPartition(plan, 'test');
const supported = rows.filter(row => [...row.teamA, ...row.teamB].every(hero => Object.hasOwn(model.weights, hero) && Object.hasOwn(incumbent.weights, hero)));
if (!supported.length) throw new Error('No common supported final-test rows. Test is now spent.');
const score = evaluate(supported, row => predict(model, row));
const old = evaluate(supported, row => predict(incumbent, row));
const coinFlip = evaluate(supported, () => 0.5);
const promoted = supported.length >= 500 && supported.length / rows.length >= 0.95
  && score.logLoss < Math.min(old.logLoss, coinFlip.logLoss) && score.brierScore < Math.min(old.brierScore, coinFlip.brierScore);
const report = {
  planId: plan.id, generatedAt: new Date().toISOString(), status: 'experimental', modelKind: model.kind,
  announcementPeriod: plan.currentPeriod, candidate: frozen, split: plan.partitions,
  test: score, incumbent: old, coinFlip, coverage: supported.length / rows.length, promoted,
  limitations: [
    'Announcement timestamps are proxies, not verified game build/deployment boundaries.',
    'Current-period data still spans hours; older periods are archived separately and are not pooled into this model.',
    'API-capped hourly samples are not a complete or random match population.',
    'Final-test labels are now spent. Do not tune or repeat model selection against these results.',
    'Lower probability losses do not alone establish calibration across future days or patches.',
  ],
};
await saveJson(`${plan.directory}/result.json`, report);
await saveJson('docs/research-evaluation.json', { ...report, candidate: {
  frozenAt: 'frozenAt' in frozen ? frozen.frozenAt : null,
  comparisons: 'comparisons' in frozen ? frozen.comparisons : null,
  calibration: 'calibration' in frozen ? frozen.calibration : null,
} });
if (promoted) {
  await saveJson('models/pre-research-baseline.json', { model: incumbent });
  await saveJson('models/baseline.json', { model, report: { ...report, candidate: undefined } });
}
console.log(JSON.stringify({ promoted, candidate: model.kind, temperature: model.temperature, matches: score.count, coverage: report.coverage, accuracy: score.accuracy, logLoss: score.logLoss, brierScore: score.brierScore, incumbentAccuracy: old.accuracy, incumbentLogLoss: old.logLoss }, null, 2));
