import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMatch } from '../src/data.ts';

const match = {
  match_id: 123, start_time: '2026-10-09 12:00:00',
  winning_team: 'Team0', match_outcome: 'TeamWin',
  match_mode: 'Unranked', game_mode: 'Normal', not_scored: false,
  players: Array.from({ length: 12 }, (_, i) => ({
    hero_id: i + 1, team: i < 6 ? 'Team0' : 'Team1', account_id: 999,
  })),
};

test('retains compositions and outcome but drops all player data', () => {
  assert.deepEqual(normalizeMatch(match), {
    matchId: 123, startedAt: '2026-10-09T12:00:00.000Z',
    teamA: [1, 2, 3, 4, 5, 6], teamB: [7, 8, 9, 10, 11, 12], winner: 'A',
  });
  assert.equal(normalizeMatch({ ...match, winning_team: 'Team1' })?.winner, 'B');
});

test('excludes invalid or unsuitable matches', () => {
  for (const patch of [
    { winning_team: null }, { match_outcome: 'Unknown' }, { not_scored: true },
    { game_mode: 'StreetBrawl' }, { match_mode: 'PrivateLobby' },
    { start_time: 'invalid' }, { start_time: '2026-02-30 12:00:00' }, { match_id: -1 },
    { players: match.players.slice(1) },
    { players: match.players.map(p => ({ ...p, hero_id: 1 })) },
    { players: match.players.map(p => ({ ...p, team: 'Team0' })) },
  ]) assert.equal(normalizeMatch({ ...match, ...patch }), null);
  for (const input of [null, [], {}, 'bad']) assert.equal(normalizeMatch(input), null);
});

test('hero order does not change the saved composition', () => {
  assert.deepEqual(normalizeMatch({ ...match, players: [...match.players].reverse() }), normalizeMatch(match));
});
