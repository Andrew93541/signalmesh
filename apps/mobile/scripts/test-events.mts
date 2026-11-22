// Run: node apps/mobile/scripts/test-events.mts
import assert from 'node:assert/strict';

import { discoverQuery, formatDuration, formatPrice, seatsText } from '../src/trackmate/eventFormat.ts';

const now = new Date(2026, 10, 22, 9, 0); // 22 Nov 2026 local
assert.equal(discoverQuery({}, now), '');
assert.equal(discoverQuery({ q: '  sunrise ', category: 'TREK', difficulty: 'EASY', hasSeats: true }, now),
  '?q=sunrise&category=TREK&difficulty=EASY&has_seats=true');
assert.equal(discoverQuery({ date: 'WEEK' }, now), '?date_from=2026-11-22&date_to=2026-11-29');
assert.equal(discoverQuery({ date: 'MONTH', location: 'Lonavala' }, now), '?location=Lonavala&date_from=2026-11-22&date_to=2026-12-22');
assert.equal(discoverQuery({ date: 'ANY', q: '   ' }, now), '');

assert.equal(formatPrice(0, 'INR'), 'Free');
assert.equal(formatPrice(149900, 'INR'), '₹1,499');
assert.equal(formatPrice(250, 'USD'), '$2.50');

assert.equal(formatDuration(null), null);
assert.equal(formatDuration(45), '45 min');
assert.equal(formatDuration(150), '2 h 30 min');
assert.equal(formatDuration(720), '12 h');
assert.equal(formatDuration(1440 * 2), '2 days');
assert.equal(formatDuration(1440 + 180), '1 d 3 h');

assert.equal(seatsText({ participant_limit: null, seats_available: null }), 'Open group');
assert.equal(seatsText({ participant_limit: 20, seats_available: 0 }), 'Full');
assert.equal(seatsText({ participant_limit: 20, seats_available: 12 }), '12 of 20 seats left');
console.log('events: all assertions passed');
