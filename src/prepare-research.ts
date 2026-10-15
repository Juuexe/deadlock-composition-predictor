import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { normalizeMatch } from './data.ts';
import { getJson } from './api.ts';
import { saveJson } from './files.ts';
import { makeWindows, parseAnnouncements, splitResearch, type ResearchRow } from './research.ts';
import { parseMatches } from './model.ts';
import { parsePlan } from './research-files.ts';

const announcements = parseAnnouncements(await getJson('https://api.deadlock-api.com/v2/patches'));
const end = Math.floor(Date.now() / 1000) - 900;
const evaluationIds = new Set<number>();
try {
  const reliability = JSON.parse(await readFile('data/reliability/matches.json', 'utf8'));
  for (const row of parseMatches(reliability.rows)) evaluationIds.add(row.matchId);
} catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
let unseenSince = '';
for (const path of ['data/matches.json', 'data/prior-sample.json', 'data/history-14days.json']) {
  try {
    const rows = parseMatches(JSON.parse(await readFile(path, 'utf8')));
    const last = rows.map(row => row.startedAt).sort().at(-1)!;
    if (last > unseenSince) unseenSince = last;
  } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
}
try {
  const previous = parsePlan(JSON.parse(await readFile('data/research-current.json', 'utf8')));
  if (previous.partitions.test.last > unseenSince) unseenSince = previous.partitions.test.last;
} catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
const windows = makeWindows(announcements, end);
if (!windows.length) throw new Error('No sufficiently old announcement periods to sample.');
const id = randomUUID();
const directory = `data/research/${id}`;
await mkdir(directory, { recursive: true });
const periods = new Map<string, ResearchRow[]>();
const seen = new Set<number>();
const summaries = [];
const limit = 2500;
for (let i = 0; i < windows.length; i++) {
  if (i) await setTimeout(2200);
  const window = windows[i];
  const url = new URL('https://api.deadlock-api.com/v1/matches/metadata');
  url.search = new URLSearchParams({
    limit: String(limit), game_mode: 'normal', match_mode: 'ranked,unranked',
    include_info: 'true', include_player_info: 'false', extra_player_columns: 'hero_id,team',
    order_by: 'match_id', order_direction: 'desc',
    min_unix_timestamp: String(window.minimum), max_unix_timestamp: String(window.maximum),
  }).toString();
  const raw = await getJson(url.href);
  if (!Array.isArray(raw)) throw new Error('Invalid match response.');
  const next = announcements.find(item => item.at > window.period);
  const periodEnd = next ? Math.min(end, Date.parse(next.at) / 1000 - 3600) : end;
  const accepted: ResearchRow[] = [];
  for (const value of raw) {
    const match = normalizeMatch(value);
    if (match && evaluationIds.has(match.matchId)) continue;
    if (!match || !value || typeof value !== 'object' || !('duration_s' in value)
      || !Number.isSafeInteger(value.duration_s) || Number(value.duration_s) <= 0 || Number(value.duration_s) > 7200) continue;
    const start = Date.parse(match.startedAt) / 1000;
    const finish = start + Number(value.duration_s);
    if (start < window.minimum || start > window.maximum || finish > periodEnd) continue;
    if (seen.has(match.matchId)) throw new Error('Duplicate match ID across sampling windows.');
    seen.add(match.matchId);
    accepted.push({ match, completedAt: new Date(finish * 1000).toISOString() });
  }
  const rows = periods.get(window.period) ?? [];
  rows.push(...accepted); periods.set(window.period, rows);
  summaries.push({ ...window, received: raw.length, accepted: accepted.length, capped: raw.length === limit });
  console.log(`Window ${i + 1}/${windows.length}: ${accepted.length} valid matches (${window.period}).`);
}
const periodSummaries = [];
for (const [at, rows] of periods) {
  const path = `${directory}/period-${at.replace(/\D/g, '')}.json`;
  await saveJson(path, rows);
  periodSummaries.push({ ...announcements.find(item => item.at === at)!, count: rows.length, path });
}
const current = [...periods.entries()].sort(([a], [b]) => a.localeCompare(b)).at(-1)!;
const split = splitResearch(current[1]);
const previouslySeenTest = split.test.length;
split.test = split.test.filter(row => row.match.startedAt > unseenSince);
if (split.train.length < 1000 || split.validation.length < 200 || split.calibration.length < 200 || split.test.length < 500) throw new Error('Current period lacks enough purged training/validation/calibration/test data. Sampling files preserved; active plan unchanged.');
const partitions = {} as Record<string, { path: string; count: number; sha256: string; first: string; last: string }>;
for (const name of ['train', 'validation', 'calibration', 'test'] as const) {
  const rows = split[name];
  const content = JSON.stringify(rows, null, 2) + '\n';
  const path = `${directory}/${name}.json`;
  await writeFile(path, content, { flag: 'wx' });
  partitions[name] = { path, count: rows.length, sha256: createHash('sha256').update(content).digest('hex'), first: rows[0].match.startedAt, last: rows.at(-1)!.match.startedAt };
}
const plan = {
  id, preparedAt: new Date().toISOString(), directory, currentPeriod: current[0], periods: periodSummaries,
  boundaryStatus: 'Official announcement-time proxies; exact match build/deployment versions are unavailable.',
  bufferSeconds: 3600, perWindowLimit: limit, windows: summaries,
  sampling: 'One-hour windows: every six hours in three older periods, hourly in the newest period. Capped windows are not a complete population census.',
  protocol: 'Time-based 50/20/15/15 splits; purge earlier matches not finished before the next cutoff. Validation selects the model, calibration selects temperature, final test is opened once after both are frozen.',
  partitions, purged: split.purged, cutoffs: split.cutoffs,
  testFreshness: { unseenSince, excluded: previouslySeenTest - split.test.length,
    rule: 'Final test starts strictly after legacy imported samples and every previously prepared final-test window.' },
};
await writeFile(`${directory}/plan.json`, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
await saveJson('data/research-current.json', plan);
await saveJson('docs/research-plan.json', plan);
console.log(JSON.stringify({ id, totalMatches: seen.size, periods: periodSummaries.map(({ title, count }) => ({ title, count })), partitions, purged: split.purged }, null, 2));
