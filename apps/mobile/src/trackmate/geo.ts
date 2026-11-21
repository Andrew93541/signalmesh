// Pure GPS maths, no React Native imports (tested with plain Node:
// scripts/test-geo.mts).

export const MAX_ACCURACY_M = 30; // fixes worse than this are stored but not counted
export const MIN_STEP_M = 5;
export const MAX_SPEED_MS = 70; // ~250 km/h: anything faster between two fixes is a GPS jump

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  at: number; // ms
}

export function haversineM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Decide whether a new fix adds distance. `prev` is the last counted point (anchor).
 * Returns metres to add (0 = not counted) and whether the fix becomes the new anchor.
 */
export function distanceToCount(prev: Fix | null, next: Fix): { add: number; newAnchor: boolean } {
  if (next.accuracy === null || next.accuracy > MAX_ACCURACY_M) return { add: 0, newAnchor: false };
  if (!prev) return { add: 0, newAnchor: true };
  const d = haversineM(prev, next);
  const noise = Math.max(MIN_STEP_M, ((prev.accuracy ?? MAX_ACCURACY_M) + next.accuracy) / 2);
  if (d < noise) return { add: 0, newAnchor: false }; // still within GPS jitter of the anchor
  const seconds = Math.max(1, (next.at - prev.at) / 1000);
  if (d / seconds > MAX_SPEED_MS) return { add: 0, newAnchor: false }; // implausible jump
  return { add: d, newAnchor: true };
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

export function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
