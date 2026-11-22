// Pure helpers for Analytics (Node-tested in scripts/test-analytics.mts).

export interface GpsJourney { startedAt: string | null; elapsedMs: number; distanceM: number; title: string; status: string; activeSince?: string | null }
export interface GpsDay { date: string; distance_m: number; duration_ms: number; treks: number }

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The 7 local dates ending on `end` (inclusive), oldest first. */
export function weekEnding(end: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(end); d.setDate(d.getDate() - (6 - i)); return ymd(d); });
}

/** TrackMate GPS activity per day: a trek counts on the local day it started. */
export function gpsByDay(journeys: GpsJourney[], dates: string[], now = Date.now()): GpsDay[] {
  return dates.map((date) => {
    const js = journeys.filter((j) => j.startedAt && ymd(new Date(j.startedAt)) === date);
    return {
      date,
      treks: js.length,
      distance_m: js.reduce((a, j) => a + j.distanceM, 0),
      duration_ms: js.reduce((a, j) => a + j.elapsedMs + (j.status === 'ACTIVE' && j.activeSince ? Math.max(0, now - Date.parse(j.activeSince)) : 0), 0),
    };
  });
}

export function fmtDistance(m: number | null): string {
  if (m === null) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function goalProgress(value: number | null, goal: number): number {
  if (value === null || goal <= 0) return 0;
  return Math.max(0, Math.min(1, value / goal));
}

const KNOWN_SOURCES: Record<string, string> = {
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.heytap.health.international': 'HeyTap Health',
  'com.android.healthconnect.phr': 'Health Connect',
};
export function sourceName(pkg: string): string {
  return KNOWN_SOURCES[pkg] ?? pkg.split('.').slice(-2).join('.');
}
