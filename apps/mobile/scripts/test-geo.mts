// Run: node apps/mobile/scripts/test-geo.mts
import assert from 'node:assert/strict';

import { distanceToCount, formatDistance, formatDuration, haversineM, type Fix } from '../src/trackmate/geo.ts';

const fix = (lat: number, lon: number, accuracy: number | null, at: number): Fix =>
  ({ latitude: lat, longitude: lon, accuracy, altitude: null, altitudeAccuracy: null, at });

// Haversine: 0.001° latitude ≈ 111.2 m
assert.ok(Math.abs(haversineM({ latitude: 19, longitude: 72 }, { latitude: 19.001, longitude: 72 }) - 111.2) < 0.5);

// First accurate fix becomes the anchor, adds nothing
assert.deepEqual(distanceToCount(null, fix(19, 72, 8, 0)), { add: 0, newAnchor: true });
// Inaccurate first fix is ignored entirely
assert.deepEqual(distanceToCount(null, fix(19, 72, 80, 0)), { add: 0, newAnchor: false });
// Missing accuracy is not trusted
assert.deepEqual(distanceToCount(null, fix(19, 72, null, 0)), { add: 0, newAnchor: false });

const a = fix(19, 72, 8, 0);
// Standing still: 3 m jitter within accuracy → not counted, anchor kept
assert.equal(distanceToCount(a, fix(19.000027, 72, 8, 5000)).add, 0);
// Walking 111 m in 80 s → counted
const walk = distanceToCount(a, fix(19.001, 72, 10, 80_000));
assert.ok(walk.add > 110 && walk.add < 112 && walk.newAnchor);
// GPS jump of 11 km in 5 s → rejected
assert.equal(distanceToCount(a, fix(19.1, 72, 10, 5000)).add, 0);
// Poor-accuracy fix far away → rejected
assert.equal(distanceToCount(a, fix(19.001, 72, 45, 80_000)).add, 0);

// Simulated walk with jitter: 10 steps of ~11 m every 10 s with ±2 m noise
let anchor: Fix | null = null; let total = 0;
for (let i = 0; i <= 10; i++) {
  const noise = (i % 2 ? 1 : -1) * 0.00001; // ~1 m
  const f = fix(19 + i * 0.0001 + noise, 72, 6, i * 10_000);
  const r = distanceToCount(anchor, f);
  total += r.add; if (r.newAnchor) anchor = f;
}
assert.ok(total > 95 && total < 115, `walk total ${total}`); // true path ≈ 111 m

assert.equal(formatDistance(842.4), '842 m');
assert.equal(formatDistance(1234), '1.23 km');
assert.equal(formatDuration(65_000), '1:05');
assert.equal(formatDuration(3_725_000), '1:02:05');
console.log('geo: all checks passed');
