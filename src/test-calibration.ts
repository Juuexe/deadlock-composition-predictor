import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseMatches, parseModel, predict, evaluate } from './model.ts';
import { adjustProbability } from './calibration.ts';
import { saveJson } from './files.ts';

const directory = 'data/calibration-experiment';
try { await access(`${directory}/test-opened.json`); throw new Error('Calibration final test already opened; no retuning or repeat testing.'); }
catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
const text = await readFile(`${directory}/candidate.json`, 'utf8');
const candidate = JSON.parse(text);
const base = parseModel(candidate.base), incumbent = parseModel(candidate.incumbent);
adjustProbability(0.6, candidate.curve);
const codeHash = createHash('sha256').update(await readFile('src/model.ts')).update(await readFile('src/calibration.ts')).digest('hex');
if (candidate.scoringCodeSha256 !== codeHash || !Number.isFinite(Date.parse(candidate.frozenAt))) throw new Error('Candidate metadata or scoring code changed.');
const input = JSON.parse(await readFile('data/reliability/matches.json', 'utf8'));
const rows = parseMatches(input.rows).filter(row => row.startedAt > candidate.frozenAt
  && Date.parse(row.startedAt) < Date.parse(candidate.frozenAt) + 86400000);
const report = JSON.parse(await readFile('docs/reliability-evaluation.json', 'utf8'));
if (report.nextAnnouncement && Date.parse(report.nextAnnouncement.at) - 3600000 < Date.parse(candidate.frozenAt) + 86400000) throw new Error('Gameplay announcement interrupts this comparison; do not reset or pool periods.');
const end = Math.max(...input.windows.map((window: { maximum: number }) => window.maximum));
if (end * 1000 < Date.parse(candidate.frozenAt) + 86400000 || rows.length < 5000) {
  console.log('Waiting for the fixed 24-hour future test window and at least 5000 matches. Test NOT OPENED.');
} else {
  const supported = rows.filter(row => [...row.teamA, ...row.teamB].every(id => Object.hasOwn(base.weights, id) && Object.hasOwn(incumbent.weights, id)));
  if (supported.length / rows.length < 0.95) throw new Error('Insufficient common coverage. Test NOT OPENED.');
  await writeFile(`${directory}/test-opened.json`, JSON.stringify({ openedAt: new Date().toISOString(), candidateSha256: createHash('sha256').update(text).digest('hex') }), { flag: 'wx' });
  const score = evaluate(supported, row => adjustProbability(predict(base, row), candidate.curve));
  const old = evaluate(supported, row => predict(incumbent, row));
  const unadjusted = evaluate(supported, row => predict(base, row));
  const passed = score.logLoss < Math.min(old.logLoss, unadjusted.logLoss) && score.brierScore < Math.min(old.brierScore, unadjusted.brierScore);
  const result = { generatedAt: new Date().toISOString(), frozenAt: candidate.frozenAt,
    total: rows.length, coverage: supported.length / rows.length, candidate: score, incumbent: old, unadjusted,
    passed, deployed: false, status: 'Final test spent; no retuning. Passing permits deployment review, not automatic replacement.' };
  await saveJson(`${directory}/result.json`, result);
  await saveJson('docs/calibration-final-test.json', result);
  console.log(JSON.stringify(result, null, 2));
}
