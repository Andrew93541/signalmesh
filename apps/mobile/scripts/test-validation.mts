// Run: node apps/mobile/scripts/test-validation.mts
import assert from 'node:assert/strict';

import { emailError, passwordError, phoneError, registrationErrors } from '../src/trackmate/validation.ts';

assert.equal(emailError('Ravi@Example.com'), null);
assert.ok(emailError('ravi@example'));
assert.ok(emailError('no spaces@x.com'));
assert.equal(phoneError('+91 98765 43210'), null);
assert.ok(phoneError('12345'));

// Same rules as the backend tests
assert.ok(passwordError('short1'));
assert.ok(passwordError('onlyletters-here'));
assert.ok(passwordError('ravi-is-12345', 'ravi@example.com'));
assert.equal(passwordError('trail-walker-2026', 'ravi@example.com'), null);

const good = {
  fullName: 'Ravi Kumar', phone: '+91 98765 43210', email: 'ravi@example.com',
  password: 'trail-walker-2026', confirm: 'trail-walker-2026',
  contactName: 'Asha Kumar', contactPhone: '+91 91234 56789',
};
assert.deepEqual(registrationErrors(good), {});
assert.deepEqual(Object.keys(registrationErrors({ ...good, confirm: 'other' })), ['confirm']);
assert.deepEqual(Object.keys(registrationErrors({ ...good, contactPhone: '+919876543210' })), ['contactPhone']); // own number
const all = registrationErrors({ fullName: '', phone: '', email: '', password: '', confirm: '', contactName: '', contactPhone: '' });
assert.deepEqual(Object.keys(all).sort(), ['contactName', 'contactPhone', 'email', 'fullName', 'password', 'phone']);

console.log('validation: all checks passed');
