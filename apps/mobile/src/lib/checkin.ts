// Dead-man timer. The worker taps "I'm OK" every N minutes. The gateway
// raises the alert when a check-in is missed, because an injured worker's
// phone may not be able to send anything.

import Storage from 'expo-sqlite/kv-store';

import type { CheckinPayload } from './contract';
import { gateway } from './gateway';
import { getFix } from './location';
import { getSettings } from './settings';
import { createStore } from './store';

interface CheckinState {
  lastCheckinAt: string | null;
  pending: CheckinPayload | null; // saved until the next hop accepts it
}

const KEY = 'checkin';

function read(): CheckinState {
  try {
    const raw = Storage.getItemSync(KEY);
    return raw ? JSON.parse(raw) : { lastCheckinAt: null, pending: null };
  } catch {
    return { lastCheckinAt: null, pending: null };
  }
}

export const checkinStore = createStore<CheckinState>(read());

function save(next: CheckinState) {
  Storage.setItemSync(KEY, JSON.stringify(next));
  checkinStore.set(next);
}

export async function checkIn() {
  const { deviceId, workerName, checkinMinutes } = getSettings();
  const fix = await getFix();
  const now = new Date().toISOString();
  save({
    lastCheckinAt: now,
    pending: {
      device_id: deviceId,
      worker_name: workerName,
      latitude: fix.latitude,
      longitude: fix.longitude,
      checked_in_at: now,
      interval_minutes: checkinMinutes,
    },
  });
}

/** Called by the sync loop. Throws if the next hop is unreachable. */
export async function flushCheckin(client: Pick<typeof gateway, "checkin"> = gateway) {
  const { pending } = checkinStore.get();
  if (!pending) return;
  await client.checkin(pending);
  // Only clear it if no newer check-in replaced it while the request was in flight.
  if (checkinStore.get().pending === pending) save({ ...checkinStore.get(), pending: null });
}

/** Milliseconds until the next check-in is due (negative = overdue), or null before the first one. */
export function msUntilDue(lastCheckinAt: string | null, minutes: number, now: number): number | null {
  if (!lastCheckinAt) return null;
  return new Date(lastCheckinAt).getTime() + minutes * 60_000 - now;
}
