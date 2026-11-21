// Trusted contacts, stored only on this phone (SQLite). No server sync and no
// automatic messaging: the user chooses when to text them.

import { randomUUID } from 'expo-crypto';

import { createStore } from '@/lib/store';

import { journeysDb as db } from './journeys';
import { normalizePhone, validateContact, type Relationship } from './smsText';

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
  relationship: Relationship;
  createdAt: string;
}

db.execSync(`
  CREATE TABLE IF NOT EXISTS trusted_contacts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relationship TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const MAX_CONTACTS = 10;

function load(): TrustedContact[] {
  return db
    .getAllSync<{ id: string; name: string; phone: string; relationship: Relationship; created_at: string }>(
      'SELECT * FROM trusted_contacts ORDER BY created_at',
    )
    .map((r) => ({ id: r.id, name: r.name, phone: r.phone, relationship: r.relationship, createdAt: r.created_at }));
}

export const contactsStore = createStore<TrustedContact[]>(load());
const refresh = () => contactsStore.set(load());

/** Returns an error message, or null on success. */
export function addContact(input: { name: string; phone: string; relationship: Relationship }): string | null {
  const problem = validateContact(input);
  if (problem) return problem;
  const phone = normalizePhone(input.phone)!;
  const existing = contactsStore.get();
  if (existing.length >= MAX_CONTACTS) return `You can add up to ${MAX_CONTACTS} trusted contacts.`;
  if (existing.some((c) => c.phone === phone)) return 'This number is already in your trusted contacts.';
  db.runSync(
    'INSERT INTO trusted_contacts (id, name, phone, relationship, created_at) VALUES (?, ?, ?, ?, ?)',
    randomUUID(), input.name.trim(), phone, input.relationship, new Date().toISOString(),
  );
  refresh();
  return null;
}

export function removeContact(id: string) {
  db.runSync('DELETE FROM trusted_contacts WHERE id = ?', id);
  refresh();
}
