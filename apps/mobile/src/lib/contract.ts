// Mirrors docs/CONTRACT.md (repo root), shared with the gateway and dashboard.

export type Category = 'MEDICAL' | 'RESCUE' | 'GENERAL';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
// RELAYED = a relay stored it, DELIVERED = the gateway stored it,
// ACKNOWLEDGED = a named responder accepted it, RESOLVED = responder closed it.
export type SosStatus = 'CREATED' | 'RELAYED' | 'DELIVERED' | 'ACKNOWLEDGED' | 'RESOLVED';

export const CATEGORIES: Category[] = ['MEDICAL', 'RESCUE', 'GENERAL'];
export const PRIORITIES: Priority[] = ['HIGH', 'MEDIUM', 'LOW'];
export const STATUSES: SosStatus[] = ['CREATED', 'RELAYED', 'DELIVERED', 'ACKNOWLEDGED', 'RESOLVED'];

export const DEFAULT_PRIORITY: Record<Category, Priority> = {
  MEDICAL: 'HIGH',
  RESCUE: 'HIGH',
  GENERAL: 'MEDIUM',
};

export interface SosMessage {
  message_id: string; // generated once on the phone, reused on every retry
  device_id: string;
  worker_name: string;
  category: Category;
  priority: Priority;
  description?: string | null; // optional, max 500 chars
  latitude: number | null; // null when the phone has no GPS fix
  longitude: number | null;
  // Location metadata (contract v1.1, additive; older hops ignore unknown fields)
  location_accuracy_m?: number | null; // horizontal accuracy in metres
  location_recorded_at?: string | null; // when the phone captured the fix
  location_source?: 'DEVICE' | 'DEVICE_LAST_KNOWN' | null;
  location_is_last_known?: boolean | null;
  user_id?: string | null; // TrackMate account, when the sender is signed in
  created_at: string; // ISO-8601
  hop_count: number;
  hops: string[];
  status: SosStatus;
}

// Response of GET /gateway/ack-status/{message_id}
export interface AckStatus {
  message_id: string;
  status: SosStatus;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
}

// Body of POST /gateway/checkin (dead-man timer heartbeat)
export interface CheckinPayload {
  device_id: string;
  worker_name: string;
  latitude: number | null;
  longitude: number | null;
  checked_in_at: string;
  interval_minutes: number;
}

export function isStatus(value: unknown): value is SosStatus {
  return typeof value === 'string' && (STATUSES as string[]).includes(value);
}
