import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAnnouncements, makeWindows, splitResearch } from '../src/research.ts';
import type { TrainingMatch } from '../src/data.ts';

test('uses official Steam gameplay announcements, not stale forum publication timestamps', () => {
  const feed = [
    { source: 'steam', title: 'New hero', content: 'A hero is available in-game now!', pub_date: '2026-10-09T21:00:04Z', link: 'https://store.steampowered.com/news/app/1422450/view/1' },
    { source: 'steam', title: 'Minor Update', content: 'Balance changes', pub_date: '2026-10-05T23:05:32Z', link: 'https://store.steampowered.com/news/app/1422450/view/2' },
    { source: 'forum', title: '09-29-2026', pub_date: '2026-10-05T23:00:12Z', link: 'https://forums.playdeadlock.com/threads/old/' },
    { source: 'steam', title: 'Community showcase', content: 'Look at this art', pub_date: '2026-10-08T20:00:00Z', link: 'https://store.steampowered.com/news/app/1422450/view/3' },
  ];
  const announcements = parseAnnouncements(feed);
  assert.equal(announcements.length, 2);
  assert.equal(announcements[0].title, 'Minor Update');
  assert.equal(parseAnnouncements([{ ...feed[0], content: 'The hero is available to play now!' }]).length, 1);
  assert.throws(() => parseAnnouncements([{ ...feed[0], link: 'https://evil.example/news' }]));
});

test('sampling windows cover different times and stay within buffered announcement periods', () => {
  const events = parseAnnouncements([
    { source: 'steam', title: 'Update', content: '', pub_date: '2026-10-05T00:00:00Z', link: 'https://store.steampowered.com/news/app/1422450/view/1' },
    { source: 'steam', title: 'Update', content: '', pub_date: '2026-10-07T00:00:00Z', link: 'https://store.steampowered.com/news/app/1422450/view/2' },
  ]);
  const windows = makeWindows(events, Date.parse('2026-10-09T00:00:00Z') / 1000);
  assert.ok(windows.length > 4);
  assert.ok(windows.every(window => window.maximum >= window.minimum));
  assert.ok(windows.every(window => window.minimum >= Date.parse(window.period) / 1000 + 3600));
  const old = windows.filter(window => window.period === events[0].at);
  assert.ok(old.every(window => window.maximum < Date.parse(events[1].at) / 1000 - 3600));
});

test('four chronological splits purge overlapping match completion times', () => {
  const rows = Array.from({ length: 100 }, (_, i) => {
    const match: TrainingMatch = { matchId: i + 1, startedAt: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
      teamA: [1, 2, 3, 4, 5, 6], teamB: [7, 8, 9, 10, 11, 12], winner: 'A' };
    return { match, completedAt: new Date(Date.parse(match.startedAt) + 2 * 3600000).toISOString() };
  });
  const split = splitResearch(rows);
  for (const [earlier, later] of [[split.train, split.validation], [split.validation, split.calibration], [split.calibration, split.test]]) {
    assert.ok(earlier.every(row => row.completedAt < later[0].match.startedAt));
  }
  assert.ok(split.purged > 0);
  assert.throws(() => splitResearch([...rows, rows[0]]));
});
