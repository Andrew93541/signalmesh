// Run: node apps/mobile/scripts/test-alerts.mts
import assert from 'node:assert/strict';

import { alertFreshness, distanceM, formatDistance, mergePeerAck, parseAlert } from '../src/lib/alertFormat.ts';

const base = { created_at: '2026-11-22T10:00:00.000Z' };
assert.equal(alertFreshness({ ...base }), 'NONE');
assert.equal(alertFreshness({ ...base, latitude: 19, longitude: 73, location_recorded_at: '2026-11-22T09:59:30.000Z' }), 'CURRENT');
assert.equal(alertFreshness({ ...base, latitude: 19, longitude: 73, location_recorded_at: '2026-11-22T09:50:00.000Z' }), 'LAST_KNOWN'); // 10 min old
assert.equal(alertFreshness({ ...base, latitude: 19, longitude: 73, location_recorded_at: '2026-11-22T09:59:59.000Z', location_is_last_known: true }), 'LAST_KNOWN');
assert.equal(alertFreshness({ ...base, latitude: 19, longitude: 73 }), 'LAST_KNOWN'); // no capture time: never shown as live
assert.equal(alertFreshness({ ...base, latitude: 0, longitude: 0, location_recorded_at: '2026-11-22T10:00:00.000Z' }), 'CURRENT'); // 0,0 is a real coordinate

assert.equal(parseAlert(null), null);
assert.equal(parseAlert('not json'), null);
assert.equal(parseAlert('{"message_id":"SM-abc-123456","state":"ALERTING","received_at":"x"}')?.state, 'ALERTING');

const d = distanceM({ latitude: 19, longitude: 73 }, { latitude: 19.001, longitude: 73 });
assert.ok(Math.abs(d - 111.2) < 0.5);
assert.equal(formatDistance(d), '110 m away');
assert.equal(formatDistance(2345), '2.3 km away');

const a = { message_id: 'SM-x-000001', recipient_device_id: 'MOBILE_0DF5', recipient_name: 'Bina', recipient_user_id: null, acknowledged_at: 't1' };
const r1 = mergePeerAck([], a);
const r2 = mergePeerAck(r1.list, { ...a, acknowledged_at: 't2' }); // same device again over another relay
assert.equal(r1.added, true);
assert.equal(r2.added, false);
assert.equal(r2.list.length, 1);
console.log('alerts: all assertions passed');
