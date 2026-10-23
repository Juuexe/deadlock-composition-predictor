import { parseMatches } from './model.ts';
import type { TrainingMatch } from './data.ts';

export type Announcement = { at: string; title: string; link: string };
export type ResearchRow = { match: TrainingMatch; completedAt: string };

export function parseAnnouncements(value: unknown): Announcement[] {
  if (!Array.isArray(value)) throw new Error('Invalid announcement feed.');
  const result: Announcement[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || entry.source !== 'steam') continue;
    if (typeof entry.title !== 'string' || typeof entry.content !== 'string' || typeof entry.pub_date !== 'string'
      || typeof entry.link !== 'string' || !/^https:\/\/store\.steampowered\.com\/news\/app\/1422450\/view\/\d+$/.test(entry.link)
      || !Number.isFinite(Date.parse(entry.pub_date))) throw new Error('Invalid official Steam announcement.');
    if (!/update/i.test(entry.title) && !/available(?: in-game| to play)? now|now joins us|joining us today|(?:massive|major) (?:visual )?update/i.test(entry.content)) continue;
    const at = new Date(entry.pub_date).toISOString();
    if (!result.some(item => item.at === at)) result.push({ at, title: entry.title.trim(), link: entry.link });
  }
  return result.sort((a, b) => a.at.localeCompare(b.at));
}

export function makeWindows(events: Announcement[], end: number) {
  if (!events.length || !Number.isSafeInteger(end)) throw new Error('No valid sampling period.');
  const recent = events.filter(event => Date.parse(event.at) / 1000 < end).slice(-4);
  const windows: { period: string; minimum: number; maximum: number }[] = [];
  for (let i = 0; i < recent.length; i++) {
    const first = Date.parse(recent[i].at) / 1000 + 3600;
    const last = i + 1 < recent.length ? Date.parse(recent[i + 1].at) / 1000 - 3600 - 1 : end;
    const stride = i === recent.length - 1 ? 3600 : 21600;
    for (let minimum = first; minimum + 1800 <= last; minimum += stride) {
      windows.push({ period: recent[i].at, minimum, maximum: Math.min(last, minimum + 3599) });
    }
  }
  return windows;
}

export function parseResearchRows(value: unknown): ResearchRow[] {
  if (!Array.isArray(value) || !value.length) throw new Error('No research matches.');
  for (const row of value) {
    if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'completedAt,match'
      || typeof row.completedAt !== 'string' || !Number.isFinite(Date.parse(row.completedAt))
      || new Date(row.completedAt).toISOString() !== row.completedAt) throw new Error('Invalid research row.');
    const match = parseMatches([row.match])[0];
    const duration = Date.parse(row.completedAt) - Date.parse(match.startedAt);
    if (duration <= 0 || duration > 7200000) throw new Error('Invalid completion time.');
  }
  if (new Set(value.map(row => row.match.matchId)).size !== value.length) throw new Error('Duplicate research match IDs.');
  return value as ResearchRow[];
}

export function splitResearch(input: ResearchRow[]) {
  const rows = [...parseResearchRows(input)].sort((a, b) => a.match.startedAt.localeCompare(b.match.startedAt));
  const start = Date.parse(rows[0].match.startedAt), end = Date.parse(rows.at(-1)!.match.startedAt);
  const cutoffs = [0.5, 0.7, 0.85].map(fraction => new Date(start + (end - start) * fraction).toISOString());
  const parts = [
    rows.filter(row => row.match.startedAt < cutoffs[0]),
    rows.filter(row => row.match.startedAt >= cutoffs[0] && row.match.startedAt < cutoffs[1]),
    rows.filter(row => row.match.startedAt >= cutoffs[1] && row.match.startedAt < cutoffs[2]),
    rows.filter(row => row.match.startedAt >= cutoffs[2]),
  ];
  let purged = 0;
  for (let i = 0; i < 3; i++) {
    const before = parts[i].length;
    parts[i] = parts[i].filter(row => row.completedAt < cutoffs[i]);
    purged += before - parts[i].length;
  }
  if (parts.some(part => !part.length)) throw new Error('Period is too short for four purged time splits; collect more matches.');
  return { train: parts[0], validation: parts[1], calibration: parts[2], test: parts[3], purged, cutoffs };
}
