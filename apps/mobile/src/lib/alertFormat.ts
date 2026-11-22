// Pure helpers for the recipient SOS alert. No app imports: tested in Node
// (scripts/test-alerts.mts).

export interface SosAlert {
  message_id: string;
  device_id?: string;
  worker_name?: string;
  category?: 'MEDICAL' | 'RESCUE' | 'GENERAL' | string;
  priority?: string;
  description?: string;
  created_at?: string;
  latitude?: number;
  longitude?: number;
  location_accuracy_m?: number;
  location_recorded_at?: string;
  location_source?: string;
  location_is_last_known?: boolean;
  sender_phone?: string;
  hops?: string[];
  received_at: string;
  source?: string;
  /** ALERTING → ACKNOWLEDGED (by this recipient) | RESPONDED (a responder acted) | MUTED (alerts off) */
  state: 'ALERTING' | 'ACKNOWLEDGED' | 'RESPONDED' | 'MUTED';
  /** LOCAL = saved on this phone only; CONFIRMED = the safety network (gateway) recorded it */
  ack_state?: 'LOCAL' | 'CONFIRMED';
  acknowledged_at?: string;
  ack_confirmed_via?: string;
  responder_status?: string;
}

export type Freshness = 'CURRENT' | 'LAST_KNOWN' | 'NONE';

/** Same rule as the backend: CURRENT only if a fresh fix captured ≤ 120 s before the SOS was created. */
export const CURRENT_FIX_MAX_AGE_S = 120;

export function alertFreshness(a: Pick<SosAlert, 'latitude' | 'longitude' | 'location_is_last_known' | 'location_recorded_at' | 'created_at'>): Freshness {
  if (a.latitude === undefined || a.latitude === null || a.longitude === undefined || a.longitude === null) return 'NONE';
  if (a.location_is_last_known || !a.location_recorded_at || !a.created_at) return 'LAST_KNOWN';
  const rec = Date.parse(a.location_recorded_at);
  const created = Date.parse(a.created_at);
  if (isNaN(rec) || isNaN(created)) return 'LAST_KNOWN';
  const age = (created - rec) / 1000;
  return age >= -5 && age <= CURRENT_FIX_MAX_AGE_S ? 'CURRENT' : 'LAST_KNOWN';
}

export const FRESHNESS_TEXT: Record<Freshness, string> = {
  CURRENT: 'Location at the time of the SOS',
  LAST_KNOWN: 'Last-known location, not live. They may have moved.',
  NONE: 'No location was shared with this SOS',
};

export function parseAlert(json: string | null | undefined): SosAlert | null {
  if (!json) return null;
  try {
    const a = JSON.parse(json);
    return a && typeof a.message_id === 'string' ? (a as SosAlert) : null;
  } catch {
    return null;
  }
}

/** Distance in metres between two coordinates (haversine). */
export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km away`;
}

export interface PeerAck {
  message_id: string;
  recipient_device_id: string;
  recipient_name: string | null;
  recipient_user_id: string | null;
  acknowledged_at: string;
}

/** Keeps one entry per (incident, recipient device): duplicates over the mesh are ignored. */
export function mergePeerAck(list: PeerAck[], a: PeerAck): { list: PeerAck[]; added: boolean } {
  if (list.some((x) => x.message_id === a.message_id && x.recipient_device_id === a.recipient_device_id)) return { list, added: false };
  return { list: [...list, a], added: true };
}
