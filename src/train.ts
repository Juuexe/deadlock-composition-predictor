import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chronologicalSplit, evaluate, parseMatches, predict, trainModel, rosterCohort } from './model.ts';
import { saveJson } from './files.ts';

const input = await readFile('data/matches.json', 'utf8');
const rows = parseMatches(JSON.parse(input));
if (rows.length < 1000) throw new Error('Import at least 1000 matches before training the research baseline.');
const cohort = rosterCohort(rows);
if (cohort.rows.length < 1000) throw new Error('Fewer than 1000 matches since the newest observed hero; collect more before training.');
const split = chronologicalSplit(cohort.rows);
const summarize = (score: ReturnType<typeof evaluate>) => ({ count: score.count, logLoss: score.logLoss, brierScore: score.brierScore, accuracy: score.accuracy });
let model = trainModel(split.train, 0.001);
const validationRows = split.validation.filter(row => [...row.teamA, ...row.teamB].every(hero => Object.hasOwn(model.weights, hero)));
const testRows = split.test.filter(row => [...row.teamA, ...row.teamB].every(hero => Object.hasOwn(model.weights, hero)));
if (!validationRows.length || !testRows.length) throw new Error('No supported compositions in validation or test data.');
let validation = evaluate(validationRows, row => predict(model, row));
const candidates = [{ kind: model.kind, regularization: model.regularization, validation: summarize(validation) }];
for (const regularization of [0.01, 0.1]) {
  const candidate = trainModel(split.train, regularization);
  const score = evaluate(validationRows, row => predict(candidate, row));
  candidates.push({ kind: candidate.kind, regularization, validation: summarize(score) });
  if (score.logLoss < validation.logLoss) { model = candidate; validation = score; }
}
const heroBaseline = model;
const heroValidation = validation;
for (const regularization of [0.001, 0.01, 0.1]) {
  const candidate = trainModel(split.train, regularization, true);
  const score = evaluate(validationRows, row => predict(candidate, row));
  candidates.push({ kind: candidate.kind, regularization, validation: summarize(score) });
  if (score.logLoss < validation.logLoss && score.brierScore < validation.brierScore) { model = candidate; validation = score; }
}
const test = evaluate(testRows, row => predict(model, row));
const heroTest = evaluate(testRows, row => predict(heroBaseline, row));
const trainingWinRate = split.train.filter(row => row.winner === 'A').length / split.train.length;
const coinFlip = evaluate(testRows, () => 0.5);
const constant = evaluate(testRows, () => trainingWinRate);
const report = {
  generatedAt: new Date().toISOString(), datasetSha256: createHash('sha256').update(input).digest('hex'),
  status: 'experimental', modelKind: model.kind, regularization: model.regularization,
  cohort: { inputMatches: rows.length, usedMatches: cohort.rows.length, since: cohort.since,
    rule: 'Start at the latest first observation of any hero in this dataset. This is an observed roster boundary, not a verified patch date.' },
  features: model.kind === 'hero-pairs-logistic-v1' ? 'Signed hero presence, teammate pairs and antisymmetric opponent pairs. No player data or side intercept.' : 'Signed hero presence only. Pair candidates did not beat the simpler model on both validation scores.',
  selection: { rule: 'Tune on validation only. Promote pair terms only if both validation log loss and Brier score improve.', candidates, heroValidation: summarize(heroValidation), heroTest: summarize(heroTest) },
  split: Object.fromEntries(Object.entries(split).map(([name, part]) => [name, {
    count: part.length, first: part[0].startedAt, last: part.at(-1)!.startedAt,
  }])),
  validation, test, baselines: { coinFlip, trainingWinRate, constant },
  coverage: {
    validation: validationRows.length / split.validation.length,
    test: testRows.length / split.test.length,
    unsupportedHeroIds: [...new Set([...split.validation, ...split.test].flatMap(row => [...row.teamA, ...row.teamB]))].filter(hero => !Object.hasOwn(model.weights, hero)),
    policy: 'Abstain on unsupported heroes. Metrics and baselines use exactly the same supported holdout rows.',
  },
  beatsBaselines: test.logLoss < Math.min(coinFlip.logLoss, constant.logLoss)
    && test.brierScore < Math.min(coinFlip.brierScore, constant.brierScore),
  limitations: [
    'One batch per daily window is not a representative population sample.',
    'Patch boundaries and minor balance updates are unverified.',
    'Chronological holdout within one dataset is not independent prospective validation.',
    'The cohort rule was introduced after diagnostic runs exposed unsupported new heroes; this is exploratory evaluation.',
    'Hero strength associations may reflect who selects heroes; this model does not establish causation.',
    'Pair terms are associations rather than established mechanical synergy or causal counters.',
    'Pairs seen fewer than 20 times in training contribute zero; unobserved heroes still require abstention.',
    'No draft recommendation or live gameplay features yet.',
  ],
};
await mkdir('models', { recursive: true });
await saveJson('models/baseline.json', { model, report });
await saveJson('docs/baseline-evaluation.json', report);
console.log(JSON.stringify({
  training: split.train.length, validation: validationRows.length, test: testRows.length, coverage: report.coverage,
  selectedModel: model.kind, pairTerms: Object.keys(model.pairs ?? {}).length, heroBaselineTest: summarize(heroTest),
  accuracy: test.accuracy, logLoss: test.logLoss, brierScore: test.brierScore,
  coinFlipLogLoss: coinFlip.logLoss, constantLogLoss: constant.logLoss, beatsBaselines: report.beatsBaselines,
}, null, 2));
