import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { normalizeMatch } from './data.ts';

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Deadlock API returned HTTP ${response.status}; retry later if rate limited.`);
  return response.json();
}

async function saveJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

const limit = Number(process.argv[2] ?? 1000);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('Match limit must be an integer from 1 to 10000.');
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
const raw = await getJson(url.href);
if (!Array.isArray(raw)) throw new Error('Invalid match response.');
// shortcut: one recent batch is a pipeline smoke test; use the data lake for representative training history.
const matches = raw.map(normalizeMatch).filter(match => match !== null);
if (!matches.length) throw new Error('No usable completed 6v6 matches; existing files preserved.');
if (new Set(matches.map(match => match.matchId)).size !== matches.length) throw new Error('Duplicate match IDs in response.');
await mkdir('data', { recursive: true });
await saveJson('data/heroes.json', catalog);
await saveJson('data/matches.json', matches);
await saveJson('data/import-summary.json', {
  fetchedAt: new Date().toISOString(), source: url.href,
  received: raw.length, accepted: matches.length, rejected: raw.length - matches.length,
  heroCount: catalog.length,
});
console.log(`Saved ${matches.length} composition-only matches and ${catalog.length} heroes; rejected ${raw.length - matches.length}.`);
