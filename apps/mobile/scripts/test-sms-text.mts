// Run: node apps/mobile/scripts/test-sms-text.mts
import assert from 'node:assert/strict';

import { normalizePhone, smsUri, sosSmsText, validateContact } from '../src/trackmate/smsText.ts';

assert.equal(normalizePhone('+91 98765 43210'), '+919876543210');
assert.equal(normalizePhone('098765-43210'), '09876543210');
assert.equal(normalizePhone('12345'), null); // too short
assert.equal(normalizePhone('+1234567890123456'), null); // too long
assert.equal(normalizePhone('call me'), null);
assert.equal(normalizePhone('+919000000001test.trekker@example.com'), null); // found on device: letters must not be stripped
assert.equal(normalizePhone('+91 (98765) 432-10'), '+919876543210');

assert.equal(validateContact({ name: '', phone: '+919876543210' }), 'Enter a name.');
assert.match(validateContact({ name: 'Asha', phone: '12' })!, /7 to 15 digits/);
assert.equal(validateContact({ name: 'Asha', phone: '+91 98765 43210' }), null);

const t = (iso: string) => iso.slice(11, 16);
const withLoc = sosSmsText({ workerName: 'Ravi', category: 'MEDICAL', priority: 'HIGH', latitude: 19.0334141, longitude: 73.0638, createdAt: '2026-11-21T11:51:48Z' }, t);
assert.match(withLoc, /^SOS from Ravi: I need medical help\. Urgent\./);
assert.match(withLoc, /https:\/\/maps\.google\.com\/\?q=19\.03341,73\.06380/);
assert.match(withLoc, /Sent 11:51 from TrackMate/);

const noLoc = sosSmsText({ workerName: 'Ravi', category: 'GENERAL', priority: 'LOW', latitude: null, longitude: null, createdAt: '2026-11-21T11:51:48Z' }, t);
assert.match(noLoc, /no location/);
assert.ok(!noLoc.includes('maps.google'), 'must not invent a location');
for (const text of [withLoc, noLoc]) assert.ok(!/on the way|guarantee|rescued/i.test(text));

const uri = smsUri(['+919876543210', '+919812345678'], 'a b&c');
assert.equal(uri, 'sms:+919876543210,+919812345678?body=a%20b%26c');

console.log('sms-text: all checks passed');
