import { mkdir } from 'node:fs/promises';
import { normalizeMatch } from './data.ts';
import { saveJson } from './files.ts';

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Deadlock API returned HTTP ${response.status}; retry later if rate limited.`);
  return response.json();
}

const limit = Number(process.argv[2] ?? 1000);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('Match limit must be an integer from 1 to 10000.');
const days = Number(process.argv[3] ?? 1);
if (!Number.isSafeInteger(days) || days < 1 || days > 14) throw new Error('Days must be an integer from 1 to 14.');
const heroes = await getJson('https://api.deadlock-api.com/v1/assets/heroes?only_active=true');
if (!Array.isArray(heroes) || !heroes.length) throw new Error('Invalid or empty hero catalog.');
const catalog = heroes.map((hero: unknown) => {
  if (!hero || typeof hero !== 'object' || !('id' in hero) || !('name' in hero)
    || !Number.isSafeInteger(hero.id) || Number(hero.id) <= 0 || typeof hero.name !== 'string') throw new Error('Invalid hero catalog entry.');
  return { id: hero.id, name: hero.name };
});
const url = new URL('https://api.deadlock-api.com/v1/matches/metadata');
url.search = new URLSearchParams({
  limit: String(limit), game_mode: 'normal', match_mode: 'ranked,unranked',
  include_info: 'true', include_player_info: 'false', extra_player_columns: 'hero_id,team',
  order_by: 'match_id', order_direction: 'desc',
}).toString();
const matches = [];
let received = 0;
const windows = [];
const end = Math.floor(Date.now() / 1000) - 3600;
// shortcut: the latest batch in each daily window is a bounded research sample; use the data lake for population coverage.
for (let day = 0; day < days; day++) {
  const maximum = end - day * 86400;
  url.searchParams.set('min_unix_timestamp', String(maximum - 86400 + 1));
  url.searchParams.set('max_unix_timestamp', String(maximum));
  const raw = await getJson(url.href);
  if (!Array.isArray(raw)) throw new Error('Invalid match response.');
  const accepted = raw.map(normalizeMatch).filter(match => match !== null);
  if (!accepted.length) throw new Error(`No usable matches in daily window ${day + 1}; existing files preserved.`);
  received += raw.length;
  matches.push(...accepted);
  windows.push({ minimum: maximum - 86400 + 1, maximum, received: raw.length, accepted: accepted.length });
  console.log(`Window ${day + 1}/${days}: ${accepted.length} valid matches.`);
}
if (!matches.length) throw new Error('No usable completed 6v6 matches; existing files preserved.');
if (new Set(matches.map(match => match.matchId)).size !== matches.length) throw new Error('Duplicate match IDs in response.');
await mkdir('data', { recursive: true });
await saveJson('data/heroes.json', catalog);
await saveJson('data/matches.json', matches);
await saveJson('data/import-summary.json', {
  fetchedAt: new Date().toISOString(), source: url.origin + url.pathname,
  received, accepted: matches.length, rejected: received - matches.length, windows,
  heroCount: catalog.length,
});
console.log(`Saved ${matches.length} composition-only matches and ${catalog.length} heroes; rejected ${received - matches.length}.`);
