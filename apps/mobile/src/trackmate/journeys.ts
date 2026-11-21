// Journeys stored on the phone (SQLite). Kept apart from the SignalMesh outbox.
// No server sync yet: the TrackMate backend comes in a later phase.

import { randomUUID } from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import { createStore } from '@/lib/store';

export type JourneyType = 'TRIP' | 'TREK';
export type JourneyStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface Journey {
  id: string;
  type: JourneyType;
  title: string;
  destination: string | null;
  startDate: string; // YYYY-MM-DD, local
  endDate: string | null;
  notes: string | null;
  checkinMinutes: number | null; // null = no check-in timer for this journey
  status: JourneyStatus;
  createdAt: string;
  startedAt: string | null; // first time tracking started
  endedAt: string | null;
  activeSince: string | null; // when the current tracking segment started (ACTIVE only)
  elapsedMs: number; // tracked time from finished segments (excludes pauses)
  distanceM: number; // from accepted GPS points only
}

interface Row {
  id: string; type: JourneyType; title: string; destination: string | null; start_date: string; end_date: string | null;
  notes: string | null; checkin_minutes: number | null; status: JourneyStatus; created_at: string; started_at: string | null;
  ended_at: string | null; active_since: string | null; elapsed_ms: number; distance_m: number;
}

const db = SQLite.openDatabaseSync('trackmate.db');
db.execSync(`
  CREATE TABLE IF NOT EXISTS journeys (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    destination TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    notes TEXT,
    checkin_minutes INTEGER,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    active_since TEXT,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    distance_m REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS track_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journey_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    altitude REAL,
    recorded_at TEXT NOT NULL,
    accepted INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_points_journey ON track_points(journey_id, id);
`);

const toJourney = (r: Row): Journey => ({
  id: r.id, type: r.type, title: r.title, destination: r.destination, startDate: r.start_date, endDate: r.end_date,
  notes: r.notes, checkinMinutes: r.checkin_minutes, status: r.status, createdAt: r.created_at, startedAt: r.started_at,
  endedAt: r.ended_at, activeSince: r.active_since, elapsedMs: r.elapsed_ms, distanceM: r.distance_m,
});

function load(): Journey[] {
  return db.getAllSync<Row>('SELECT * FROM journeys ORDER BY created_at DESC').map(toJourney);
}

export const journeysStore = createStore<Journey[]>(load());
export const refreshJourneys = () => journeysStore.set(load());

export function getJourney(id: string): Journey | undefined {
  return journeysStore.get().find((j) => j.id === id);
}

export interface NewJourney {
  type: JourneyType;
  title: string;
  destination: string | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  checkinMinutes: number | null;
}

export function validateJourney(j: NewJourney): string | null {
  if (!j.title.trim()) return 'Give your journey a name.';
  if (j.title.trim().length > 80) return 'Keep the name under 80 characters.';
  if (j.endDate && j.endDate < j.startDate) return 'The end date is before the start date.';
  if ((j.notes ?? '').length > 1000) return 'Notes are too long (max 1000 characters).';
  return null;
}

export function createJourney(j: NewJourney): Journey {
  const error = validateJourney(j);
  if (error) throw new Error(error);
  const id = randomUUID();
  db.runSync(
    `INSERT INTO journeys (id, type, title, destination, start_date, end_date, notes, checkin_minutes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PLANNED', ?)`,
    id, j.type, j.title.trim(), j.destination?.trim() || null, j.startDate, j.endDate, j.notes?.trim() || null,
    j.checkinMinutes, new Date().toISOString(),
  );
  refreshJourneys();
  return getJourney(id)!;
}

export function deleteJourney(id: string) {
  db.runSync('DELETE FROM track_points WHERE journey_id = ?', id);
  db.runSync('DELETE FROM journeys WHERE id = ?', id);
  refreshJourneys();
}

/** Exposed for the tracking module (Increment 2). */
export const journeysDb = db;

// ---- date helpers (local calendar dates, no time zone surprises) ----------------

export function todayLocal(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'), String(dt.getDate()).padStart(2, '0')].join('-');
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
