// Run: node apps/mobile/scripts/test-analytics.mts
import assert from 'node:assert/strict';

import { fmtDistance, fmtDuration, goalProgress, gpsByDay, sourceName, weekEnding } from '../src/lib/activityFormat.ts';

const end = new Date(2026, 10, 22, 12);
assert.deepEqual(weekEnding(end), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);

const j = (start: Date, km: number, min: number, status = 'COMPLETED', activeSince: string | null = null) =>
  ({ startedAt: start.toISOString(), elapsedMs: min * 60000, distanceM: km * 1000, title: 't', status, activeSince });
const days = gpsByDay([j(new Date(2026, 10, 21, 7), 5.2, 150), j(new Date(2026, 10, 21, 16), 1, 30), j(new Date(2026, 10, 20, 9), 3, 60),
  { startedAt: null, elapsedMs: 0, distanceM: 0, title: 'planned', status: 'PLANNED' }], ['2026-11-20', '2026-11-21', '2026-11-22']);
assert.deepEqual(days.map((d) => [d.date, d.treks, d.distance_m, d.duration_ms / 60000]),
  [['2026-11-20', 1, 3000, 60], ['2026-11-21', 2, 6200, 180], ['2026-11-22', 0, 0, 0]]);
// An active trek adds the running segment
const now = new Date(2026, 10, 22, 10).getTime();
const act = gpsByDay([j(new Date(2026, 10, 22, 9), 1, 10, 'ACTIVE', new Date(2026, 10, 22, 9, 30).toISOString())], ['2026-11-22'], now);
assert.equal(act[0].duration_ms / 60000, 40);

assert.equal(fmtDistance(null), '—');
assert.equal(fmtDistance(850), '850 m');
assert.equal(fmtDistance(6200), '6.20 km');
assert.equal(fmtDuration(45 * 60000), '45 min');
assert.equal(fmtDuration(150 * 60000), '2 h 30 min');
assert.equal(goalProgress(null, 8000), 0);
assert.equal(goalProgress(4000, 8000), 0.5);
assert.equal(goalProgress(12000, 8000), 1);
assert.equal(sourceName('com.sec.android.app.shealth'), 'Samsung Health');
console.log('analytics: all assertions passed');
