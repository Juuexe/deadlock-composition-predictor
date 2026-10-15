import type { Composition } from './composition.ts';

export type TrainingMatch = Composition & {
  matchId: number;
  startedAt: string;
  winner: 'A' | 'B';
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeMatch(value: unknown): TrainingMatch | null {
  if (!record(value) || !Number.isSafeInteger(value.match_id) || Number(value.match_id) <= 0
    || value.game_mode !== 'Normal' || !['Ranked', 'Unranked'].includes(String(value.match_mode))
    || value.match_outcome !== 'TeamWin' || value.not_scored !== false
    || !['Team0', 'Team1'].includes(String(value.winning_team))
    || typeof value.start_time !== 'string' || !Array.isArray(value.players)) return null;
  // The API's ClickHouse DateTime field is an unzoned UTC string.
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.start_time)) return null;
  const timestamp = new Date(value.start_time.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(timestamp.getTime())
    || timestamp.toISOString().slice(0, 19) !== value.start_time.replace(' ', 'T')) return null;
  const teamA: number[] = [];
  const teamB: number[] = [];
  for (const player of value.players) {
    if (!record(player) || !Number.isSafeInteger(player.hero_id) || Number(player.hero_id) <= 0
      || (player.team !== 'Team0' && player.team !== 'Team1')) return null;
    (player.team === 'Team0' ? teamA : teamB).push(Number(player.hero_id));
  }
  if (teamA.length !== 6 || teamB.length !== 6 || new Set([...teamA, ...teamB]).size !== 12) return null;
  return {
    matchId: Number(value.match_id), startedAt: timestamp.toISOString(),
    teamA: teamA.sort((a, b) => a - b), teamB: teamB.sort((a, b) => a - b),
    winner: value.winning_team === 'Team0' ? 'A' : 'B',
  };
}
