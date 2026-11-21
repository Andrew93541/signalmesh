// Run: node apps/mobile/scripts/test-sos-status.mts
import assert from 'node:assert/strict';

import { describeStatus, statusSteps, type LocalStatus } from '../src/trackmate/sosStatus.ts';

const ALL: LocalStatus[] = ['QUEUED', 'CREATED', 'RELAYED', 'DELIVERED', 'ACKNOWLEDGED', 'RESOLVED'];
const t = (iso: string) => iso.slice(11, 16);

// Never claim more than the state proves.
for (const s of ALL) {
  const v = describeStatus(s);
  const text = (v.title + ' ' + v.body).toLowerCase();
  assert.ok(!text.includes('on the way'), `${s} promises rescue`);
  assert.ok(!text.includes('guarantee'), `${s} guarantees`);
  if (s === 'QUEUED' || s === 'CREATED' || s === 'RELAYED') {
    // The headline is the claim; bodies may say "hasn't reached … yet".
    assert.ok(!v.title.toLowerCase().includes('reached'), `${s} claims delivery`);
    assert.ok(!text.includes('acknowledged'), `${s} claims acknowledgement`);
    assert.notEqual(v.tone, 'success');
  }
  if (s === 'DELIVERED') assert.ok(!v.title.toLowerCase().includes('acknowledged'), 'DELIVERED claims ack');
}

// Queued copy depends on whether a send was attempted.
assert.match(describeStatus('QUEUED', { attempts: 0 }).body, /Sending now/);
assert.match(describeStatus('QUEUED', { attempts: 3 }).body, /keep trying/);
assert.match(describeStatus('ACKNOWLEDGED', { acknowledgedBy: 'Meera' }).body, /Meera/);
assert.equal(describeStatus('DELIVERED').tone, 'info');
assert.equal(describeStatus('ACKNOWLEDGED').tone, 'success');

// Steps: only what the phone knows.
const base = { createdAt: '2026-11-21T10:00:00Z', sentAt: null, acknowledgedBy: null, acknowledgedAt: null };
assert.deepEqual(statusSteps({ ...base, status: 'QUEUED' }, t).map((s) => s.done), [true, false, false, false]);
assert.deepEqual(statusSteps({ ...base, status: 'RELAYED', sentAt: '2026-11-21T10:00:05Z' }, t).map((s) => s.done), [true, true, false, false]);
assert.deepEqual(statusSteps({ ...base, status: 'DELIVERED', sentAt: '2026-11-21T10:00:05Z' }, t).map((s) => s.done), [true, true, true, false]);
const acked = statusSteps({ ...base, status: 'ACKNOWLEDGED', sentAt: '2026-11-21T10:00:05Z', acknowledgedBy: 'Meera', acknowledgedAt: '2026-11-21T10:02:00Z' }, t);
assert.deepEqual(acked.map((s) => s.done), [true, true, true, true]);
assert.equal(acked[3].detail, 'Meera · 10:02');
assert.equal(statusSteps({ ...base, status: 'QUEUED' }, t)[1].detail, 'Waiting for a connection');

console.log('sos-status: all checks passed');
