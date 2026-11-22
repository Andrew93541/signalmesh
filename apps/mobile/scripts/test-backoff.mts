// Run: node apps/mobile/scripts/test-backoff.mts
import assert from 'node:assert/strict';

import { backoffDelay, isHttpsUrl } from '../src/lib/backoff.ts';

const mid = () => 0.5; // no jitter
assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, 3000, 60000, mid)), [3000, 6000, 12000, 24000, 48000, 60000, 60000]);
assert.equal(backoffDelay(1000, 3000, 60000, mid), 60000); // huge failure counts stay capped
assert.equal(backoffDelay(-3, 3000, 60000, mid), 3000);
// Jitter stays within ±20%
for (let i = 0; i < 1000; i++) {
  const d = backoffDelay(3);
  assert.ok(d >= 24000 * 0.8 && d <= 24000 * 1.2, String(d));
}
assert.equal(isHttpsUrl('https://gw.example.org'), true);
assert.equal(isHttpsUrl('  https://gw.example.org:8443/x '), true);
assert.equal(isHttpsUrl('http://gw.example.org'), false);
assert.equal(isHttpsUrl('https://'), false);
assert.equal(isHttpsUrl('gw.example.org'), false);
console.log('backoff: all assertions passed');

import { preferBuiltAddress } from '../src/lib/backoff.ts';
const B = 'https://gw.example.org';
assert.equal(preferBuiltAddress('', B), B);
assert.equal(preferBuiltAddress('http://127.0.0.1:8000', B), B); // USB-only address replaced
assert.equal(preferBuiltAddress('http://localhost:8100/', B), B);
assert.equal(preferBuiltAddress('http://192.168.43.1:8080', B), 'http://192.168.43.1:8080'); // user's own choice kept
assert.equal(preferBuiltAddress('https://mine.example.org', B), 'https://mine.example.org');
assert.equal(preferBuiltAddress('http://127.0.0.1:8000', ''), 'http://127.0.0.1:8000'); // no built address: unchanged
console.log('preferBuiltAddress: all assertions passed');
const T = 'https://new-tunnel-words.trycloudflare.com';
assert.equal(preferBuiltAddress('https://old-tunnel-words.trycloudflare.com', T), T); // dead quick tunnel replaced
assert.equal(preferBuiltAddress('https://gw.example.org', T), 'https://gw.example.org'); // real address kept
console.log('preferBuiltAddress (tunnels): all assertions passed');
