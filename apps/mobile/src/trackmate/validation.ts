// Client-side checks that mirror the backend's rules (backend/trackmate_backend/models.py),
// so mistakes show instantly. The server still validates everything.
// Pure: tested with Node (scripts/test-validation.mts).

import { normalizePhone } from './smsText.ts';

const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]+\.[A-Za-z]{2,}$/;

export function emailError(email: string): string | null {
  const v = email.trim().toLowerCase();
  return v.length <= 254 && EMAIL_RE.test(v) ? null : 'Enter a valid email address.';
}

export function phoneError(phone: string): string | null {
  return normalizePhone(phone) ? null : 'Enter a phone number with 7 to 15 digits, including the country code.';
}

export function passwordError(password: string, email = ''): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 128) return 'Use at most 128 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  const name = email.split('@')[0]?.toLowerCase() ?? '';
  if (name.length >= 3 && password.toLowerCase().includes(name)) return "Don't include your email name in the password.";
  return null;
}

export function nameError(name: string): string | null {
  const v = name.trim();
  return v.length >= 2 && v.length <= 80 ? null : 'Enter your full name (2 to 80 characters).';
}

export interface RegistrationForm {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirm: string;
  contactName: string;
  contactPhone: string;
}

/** Field → message for every problem; empty object when valid. */
export function registrationErrors(f: RegistrationForm): Partial<Record<keyof RegistrationForm, string>> {
  const e: Partial<Record<keyof RegistrationForm, string>> = {};
  const set = (k: keyof RegistrationForm, m: string | null) => { if (m) e[k] = m; };
  set('fullName', nameError(f.fullName));
  set('phone', phoneError(f.phone));
  set('email', emailError(f.email));
  set('password', passwordError(f.password, f.email));
  if (!e.password && f.confirm !== f.password) e.confirm = "Passwords don't match.";
  set('contactName', nameError(f.contactName) && 'Enter your emergency contact’s name.');
  set('contactPhone', phoneError(f.contactPhone));
  const own = normalizePhone(f.phone);
  if (!e.contactPhone && own && own === normalizePhone(f.contactPhone)) e.contactPhone = 'Use someone else’s number, not your own.';
  return e;
}
