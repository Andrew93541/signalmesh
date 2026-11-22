// GPS tracking for journeys (foreground only for now: background tracking needs a
// foreground service and is planned separately).
//
// Honesty rules: distance counts only fixes with accuracy <= MAX_ACCURACY_M and
// movement beyond GPS noise; time excludes pauses; nothing is invented when GPS
// is missing.

import * as Location from 'expo-location';

import { checkIn } from '@/lib/checkin';
import { saveSettings } from '@/lib/settings';
import { createStore } from '@/lib/store';
import { syncNow } from '@/lib/sync';

import { distanceToCount, MAX_ACCURACY_M, type Fix } from './geo';
import { getSafetyPrefs } from './safetyPrefs';
import { getJourney, journeysDb as db, journeysStore, refreshJourneys, type Journey } from './journeys';

export type { Fix } from './geo';

export type GpsState = 'idle' | 'waiting' | 'ok' | 'poor' | 'denied' | 'error';

export interface TrackingState {
  journeyId: string | null;
  gps: GpsState;
  lastFix: Fix | null;
  error: string | null;
  pointsRecorded: number;
}

export const trackingStore = createStore<TrackingState>({ journeyId: null, gps: 'idle', lastFix: null, error: null, pointsRecorded: 0 });
const patch = (p: Partial<TrackingState>) => trackingStore.set({ ...trackingStore.get(), ...p });

let sub: Location.LocationSubscription | null = null;
let anchor: Fix | null = null; // last point counted towards distance

/** Tracked time in ms (excludes pauses). */
export function elapsedMs(j: Journey, now = Date.now()) {
  return j.elapsedMs + (j.status === 'ACTIVE' && j.activeSince ? now - new Date(j.activeSince).getTime() : 0);
}

function onFix(journeyId: string, loc: Location.LocationObject) {
  const fix: Fix = {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? null,
    altitude: loc.coords.altitude ?? null,
    altitudeAccuracy: loc.coords.altitudeAccuracy ?? null,
    at: loc.timestamp,
  };
  const { add, newAnchor } = distanceToCount(anchor, fix);
  const accepted = fix.accuracy !== null && fix.accuracy <= MAX_ACCURACY_M;
  db.runSync(
    'INSERT INTO track_points (journey_id, latitude, longitude, accuracy, altitude, recorded_at, accepted) VALUES (?, ?, ?, ?, ?, ?, ?)',
    journeyId, fix.latitude, fix.longitude, fix.accuracy, fix.altitude, new Date(fix.at).toISOString(), accepted ? 1 : 0,
  );
  if (add > 0) db.runSync('UPDATE journeys SET distance_m = distance_m + ? WHERE id = ?', add, journeyId);
  if (newAnchor) anchor = fix;
  patch({ lastFix: fix, gps: accepted ? 'ok' : 'poor', pointsRecorded: trackingStore.get().pointsRecorded + 1 });
  if (add > 0) refreshJourneys();
}

async function startWatch(journeyId: string): Promise<boolean> {
  stopWatch();
  if (!getSafetyPrefs().gps_during_trek) {
    patch({ journeyId, gps: 'idle', error: 'GPS tracking during treks is off (Settings → Safety options). Time is still recorded.' });
    return false;
  }
  const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!perm || perm.status !== 'granted') {
    patch({ journeyId, gps: 'denied', error: 'Location permission is off. Tracking needs it to record your route.' });
    return false;
  }
  const last = db.getFirstSync<{ latitude: number; longitude: number; accuracy: number | null; altitude: number | null; recorded_at: string }>(
    'SELECT latitude, longitude, accuracy, altitude, recorded_at FROM track_points WHERE journey_id = ? AND accepted = 1 ORDER BY id DESC LIMIT 1',
    journeyId,
  );
  anchor = last ? { ...last, altitudeAccuracy: null, at: new Date(last.recorded_at).getTime() } : null;
  const count = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM track_points WHERE journey_id = ?', journeyId)?.n ?? 0;
  patch({ journeyId, gps: 'waiting', error: null, pointsRecorded: count });
  try {
    sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 5000, distanceInterval: 5 },
      (loc) => onFix(journeyId, loc),
      (reason) => patch({ gps: 'error', error: String(reason) }),
    );
    return true;
  } catch (e) {
    patch({ gps: 'error', error: e instanceof Error ? e.message : 'Could not start GPS' });
    return false;
  }
}

function stopWatch() {
  sub?.remove();
  sub = null;
}

function activeJourney() {
  return journeysStore.get().find((j) => j.status === 'ACTIVE' || j.status === 'PAUSED');
}

/** Start or resume tracking. Returns an error message to show, or null. */
export async function startTracking(id: string): Promise<string | null> {
  const other = activeJourney();
  if (other && other.id !== id) return `"${other.title}" is still being tracked. Stop it first.`;
  const j = getJourney(id);
  if (!j || j.status === 'COMPLETED') return 'This journey has already finished.';
  const now = new Date().toISOString();
  db.runSync(
    "UPDATE journeys SET status = 'ACTIVE', started_at = COALESCE(started_at, ?), active_since = ? WHERE id = ?",
    now, now, id,
  );
  refreshJourneys();
  await startWatch(id);
  if (j.status === 'PLANNED' && j.checkinMinutes) {
    // Use the existing SignalMesh check-in timer for this journey.
    saveSettings({ checkinMinutes: j.checkinMinutes });
    await checkIn();
    syncNow();
  }
  return null;
}

export function pauseTracking(id: string) {
  const j = getJourney(id);
  if (!j || j.status !== 'ACTIVE') return;
  db.runSync("UPDATE journeys SET status = 'PAUSED', elapsed_ms = ?, active_since = NULL WHERE id = ?", elapsedMs(j), id);
  stopWatch();
  patch({ gps: 'idle' });
  refreshJourneys();
}

export function stopTracking(id: string) {
  const j = getJourney(id);
  if (!j || (j.status !== 'ACTIVE' && j.status !== 'PAUSED')) return;
  db.runSync(
    "UPDATE journeys SET status = 'COMPLETED', elapsed_ms = ?, active_since = NULL, ended_at = ? WHERE id = ?",
    elapsedMs(j), new Date().toISOString(), id,
  );
  stopWatch();
  anchor = null;
  trackingStore.set({ journeyId: null, gps: 'idle', lastFix: null, error: null, pointsRecorded: 0 });
  refreshJourneys();
}

/** On app launch: an ACTIVE journey resumes recording (the app may have been closed). */
export function resumeActiveTracking() {
  const j = activeJourney();
  if (j?.status === 'ACTIVE') void startWatch(j.id);
}

export function trackSummary(id: string) {
  return db.getFirstSync<{ total: number; accepted: number }>(
    'SELECT COUNT(*) AS total, COALESCE(SUM(accepted), 0) AS accepted FROM track_points WHERE journey_id = ?',
    id,
  ) ?? { total: 0, accepted: 0 };
}
