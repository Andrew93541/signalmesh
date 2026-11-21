// Store-and-forward outbox. Every SOS is written to SQLite before any
// network call, so it survives no signal, app restarts and crashes.

import { randomUUID } from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import type { AckStatus, Category, Priority, SosMessage, SosStatus } from './contract';
import { getSettings } from './settings';
import { createStore } from './store';

/** QUEUED = saved on the phone, not yet accepted by the next hop. */
export type LocalStatus = 'QUEUED' | SosStatus;

export interface OutboxItem {
  message: SosMessage;
  status: LocalStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

interface Row {
  message_id: string;
  payload: string;
  status: LocalStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

const db = SQLite.openDatabaseSync('signalmesh.db');
db.execSync(`
  CREATE TABLE IF NOT EXISTS outbox (
    message_id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT,
    acknowledged_by TEXT,
    acknowledged_at TEXT
  );
`);

function load(): OutboxItem[] {
  return db
    .getAllSync<Row>('SELECT * FROM outbox ORDER BY created_at DESC')
    .map((r) => ({
      message: JSON.parse(r.payload),
      status: r.status,
      attempts: r.attempts,
      lastError: r.last_error,
      sentAt: r.sent_at,
      acknowledgedBy: r.acknowledged_by,
      acknowledgedAt: r.acknowledged_at,
    }));
}

export const outboxStore = createStore<OutboxItem[]>(load());
const refresh = () => outboxStore.set(load());

export function createSos(input: {
  category: Category;
  priority: Priority;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m?: number | null;
  location_recorded_at?: string | null;
  location_source?: SosMessage['location_source'];
  location_is_last_known?: boolean | null;
  user_id?: string | null;
  worker_name?: string;
}): SosMessage {
  const { deviceId, workerName } = getSettings();
  const hasFix = input.latitude !== null && input.longitude !== null;
  const message: SosMessage = {
    message_id: `SM-${randomUUID()}`, // created once; every retry and hop reuses it
    device_id: deviceId,
    worker_name: input.worker_name || workerName,
    category: input.category,
    priority: input.priority,
    latitude: input.latitude,
    longitude: input.longitude,
    location_accuracy_m: hasFix ? input.location_accuracy_m ?? null : null,
    location_recorded_at: hasFix ? input.location_recorded_at ?? null : null,
    location_source: hasFix ? input.location_source ?? null : null,
    location_is_last_known: hasFix ? input.location_is_last_known ?? null : null,
    user_id: input.user_id ?? null,
    created_at: new Date().toISOString(),
    hop_count: 0,
    hops: [deviceId],
    status: 'CREATED',
  };
  db.runSync(
    'INSERT INTO outbox (message_id, payload, status, created_at) VALUES (?, ?, ?, ?)',
    message.message_id,
    JSON.stringify(message),
    'QUEUED',
    message.created_at,
  );
  refresh();
  return message;
}

const RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Messages still waiting to leave the phone: highest priority first, then oldest first. */
export function queuedItems(): OutboxItem[] {
  return outboxStore
    .get()
    .filter((i) => i.status === 'QUEUED')
    .sort(
      (a, b) =>
        RANK[a.message.priority] - RANK[b.message.priority] ||
        a.message.created_at.localeCompare(b.message.created_at),
    );
}

/** Messages that left the phone but nobody has acknowledged yet. */
export function awaitingAckItems(): OutboxItem[] {
  return outboxStore
    .get()
    .filter((i) => i.status !== 'QUEUED' && i.status !== 'ACKNOWLEDGED' && i.status !== 'RESOLVED');
}

export function markSent(messageId: string, status: SosStatus) {
  db.runSync(
    'UPDATE outbox SET status = ?, sent_at = ?, last_error = NULL, attempts = attempts + 1 WHERE message_id = ?',
    status,
    new Date().toISOString(),
    messageId,
  );
  refresh();
}

export function markFailed(messageId: string, error: string) {
  db.runSync(
    'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE message_id = ?',
    error,
    messageId,
  );
  refresh();
}

const STATUS_RANK: Record<string, number> = { QUEUED: -1, CREATED: 0, RELAYED: 1, DELIVERED: 2, ACKNOWLEDGED: 3, RESOLVED: 4 };
export const statusRank = (s: string | null | undefined) => (s ? (STATUS_RANK[s] ?? -1) : -1);

export function applyAckStatus(messageId: string, ack: AckStatus) {
  const item = outboxStore.get().find((i) => i.message.message_id === messageId);
  // Statuses only move forward: a slower route answering "RELAYED" never undoes "ACKNOWLEDGED".
  if (!item || statusRank(ack.status) <= statusRank(item.status)) return;
  db.runSync(
    'UPDATE outbox SET status = ?, acknowledged_by = ?, acknowledged_at = ? WHERE message_id = ?',
    ack.status,
    ack.acknowledged_by ?? null,
    ack.acknowledged_at ?? null,
    messageId,
  );
  refresh();
}

/** Demo reset. */
export function clearOutbox() {
  db.runSync('DELETE FROM outbox');
  refresh();
}
