import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { getJson } from './api.ts';
import { normalizeMatch, type TrainingMatch } from './data.ts';
import { parseModel, laterMatches, type HeroModel } from './model.ts';
import { saveJson } from './files.ts';
import { parseAnnouncements } from './research.ts';
import { reliabilityReport, beforeAnnouncement } from './reliability.ts';

const directory = 'data/reliability';
await mkdir(directory, { recursive: true });
// An exclusive lock prevents overlapping collectors from dropping each other's batches.
const lock = `${directory}/running.lock`;
await writeFile(lock, '', { flag: 'wx' });
try {
  const codeSha256 = createHash('sha256').update(await readFile('src/model.ts')).digest('hex');
  type Snapshot = { frozenAt: string; codeSha256: string; model: HeroModel };
  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(await readFile(`${directory}/snapshot.json`, 'utf8'));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    const artifact = JSON.parse(await readFile('models/baseline.json', 'utf8'));
    snapshot = { frozenAt: new Date().toISOString(), codeSha256, model: parseModel(artifact.model) };
    await writeFile(`${directory}/snapshot.json`, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
  }
  const model = parseModel(snapshot.model);
  if (snapshot.codeSha256 !== codeSha256 || !Number.isFinite(Date.parse(snapshot.frozenAt))) throw new Error('Frozen scoring code changed or invalid snapshot; do not mix experiments.');
  type Window = { minimum: number; maximum: number; received: number; accepted: number; capped: boolean };
  let state: { rows: TrainingMatch[]; windows: Window[] } = { rows: [], windows: [] };
  try { state = JSON.parse(await readFile(`${directory}/matches.json`, 'utf8')); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  if (!Array.isArray(state.rows) || !Array.isArray(state.windows)) throw new Error('Invalid reliability dataset.');
  if (state.rows.length && laterMatches(state.rows, snapshot.frozenAt).length !== state.rows.length) throw new Error('Reliability data predates the freeze.');
  reliabilityReport(model, state.rows);
  if (state.windows.some((window, i) => !Number.isSafeInteger(window.minimum) || !Number.isSafeInteger(window.maximum)
    || window.maximum !== window.minimum + 3599 || window.minimum !== (i ? state.windows[i - 1].maximum + 1 : Math.floor(Date.parse(snapshot.frozenAt) / 1000) + 1))) throw new Error('Invalid sampling windows.');
  const announcements = parseAnnouncements(await getJson('https://api.deadlock-api.com/v2/patches'));
  const next = announcements.find(event => event.at > snapshot.frozenAt);
  const end = Math.min(Math.floor(Date.now() / 1000) - 7200, next ? Math.floor(Date.parse(next.at) / 1000) - 3600 : Infinity);
  let minimum = state.windows.at(-1)?.maximum !== undefined ? state.windows.at(-1)!.maximum + 1 : Math.floor(Date.parse(snapshot.frozenAt) / 1000) + 1;
  const seen = new Set(state.rows.map(row => row.matchId));
  for (let batch = 0; batch < 24 && minimum + 3599 <= end; batch++, minimum += 3600) {
    if (batch) await setTimeout(2200);
    const maximum = minimum + 3599;
    const url = new URL('https://api.deadlock-api.com/v1/matches/metadata');
    url.search = new URLSearchParams({ limit: '2500', game_mode: 'normal', match_mode: 'ranked,unranked',
      include_info: 'true', include_player_info: 'false', extra_player_columns: 'hero_id,team',
      order_by: 'match_id', order_direction: 'desc', min_unix_timestamp: String(minimum), max_unix_timestamp: String(maximum) }).toString();
    const raw = await getJson(url.href);
    if (!Array.isArray(raw)) throw new Error('Invalid match response.');
    const accepted: TrainingMatch[] = [];
    for (const value of raw) {
      const match = normalizeMatch(value);
      if (!match || !Number.isSafeInteger(value.duration_s) || value.duration_s <= 0 || value.duration_s > 7200) continue;
      const start = Date.parse(match.startedAt) / 1000;
      if (start < minimum || start > maximum || start + value.duration_s > end + 7200
        || (next && start + value.duration_s >= Date.parse(next.at) / 1000 - 3600)) continue;
      if (seen.has(match.matchId)) throw new Error('Duplicate reliability match ID returned by API.');
      seen.add(match.matchId); accepted.push(match);
    }
    state.rows.push(...accepted);
    state.windows.push({ minimum, maximum, received: raw.length, accepted: accepted.length, capped: raw.length === 2500 });
    await saveJson(`${directory}/matches.json`, state);
    console.log(`Saved ${accepted.length} fresh matches from ${new Date(minimum * 1000).toISOString()}.`);
  }
  const evaluationRows = beforeAnnouncement(state.rows, next?.at ?? null);
  const report = { generatedAt: new Date().toISOString(), frozenAt: snapshot.frozenAt, codeSha256,
    modelSha256: createHash('sha256').update(JSON.stringify(model)).digest('hex'), modelKind: model.kind,
    timeZone: 'America/Chicago', nextAnnouncement: next ?? null, windows: state.windows,
    ...reliabilityReport(model, evaluationRows),
    retainedMatches: state.rows.length, transitionExcluded: state.rows.length - evaluationRows.length,
    status: next ? 'Evaluation period ended at a gameplay announcement; frozen data retained.' : state.rows.length ? 'Evidence accumulating; no reliability certification.' : 'Waiting for fresh completed sampling windows after freeze.',
    limitations: 'Fixed 2500-match hourly availability samples; capped windows and delayed API ingestion can bias results. Daily and calibration Wilson intervals are approximate and assume independent matches. Ten-percentage-point calibration bins do not establish exact 58% calibration. Stop one hour before the next identified official gameplay announcement; deployment boundaries and unannounced updates remain unverified. Repeated checks are descriptive, not significance tests. These matches are evaluation-only; never use them to train or tune this predictor.' };
  await saveJson('docs/reliability-evaluation.json', report);
  console.log(JSON.stringify({ frozenAt: report.frozenAt, matches: report.total, days: report.days.length, status: report.status }, null, 2));
} finally { await rm(lock); }
