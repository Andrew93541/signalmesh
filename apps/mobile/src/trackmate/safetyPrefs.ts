// In-app safety options. These are the app's own choices; they never grant or
// change Android permissions (see Settings → Safety options for permission status).
// Saved on the phone and, when signed in, synced to the account.

import Storage from 'expo-sqlite/kv-store';

import { Nearby } from '../../modules/signalmesh-nearby';

import { createStore } from '@/lib/store';

import { api, sessionStore } from './auth';

export interface SafetyPrefs {
  sos_alerts: boolean; // siren/pop-up when a nearby SOS reaches this phone
  emergency_notification: boolean;
  emergency_sound: boolean;
  emergency_vibration: boolean;
  checkin_reminders: boolean;
  missed_checkin_escalation: boolean; // needs explicit consent and trusted contacts
  gps_during_trek: boolean;
  offline_sos_queue: boolean; // always on: an SOS is never dropped
  trusted_contact_notifications: boolean;
}

export const DEFAULT_SAFETY: SafetyPrefs = {
  sos_alerts: true, emergency_notification: true, emergency_sound: true, emergency_vibration: true,
  checkin_reminders: true, missed_checkin_escalation: false, gps_during_trek: true, offline_sos_queue: true,
  trusted_contact_notifications: true,
};

const KEY = 'trackmate.safetyPrefs';
function read(): SafetyPrefs {
  try { return { ...DEFAULT_SAFETY, ...JSON.parse(Storage.getItemSync(KEY) ?? '{}'), offline_sos_queue: true }; } catch { return DEFAULT_SAFETY; }
}
export const safetyStore = createStore<SafetyPrefs>(read());
export const getSafetyPrefs = safetyStore.get;

/** Push the alert-related options to the native alert layer. */
function applyNative(p: SafetyPrefs) {
  if (!Nearby) return;
  const st = Nearby.alertStatus();
  Nearby.setAlertPrefs(p.sos_alerts, st.volume, p.emergency_vibration, p.emergency_sound, p.emergency_notification);
}

export function saveSafetyPrefs(patch: Partial<SafetyPrefs>) {
  const next = { ...safetyStore.get(), ...patch, offline_sos_queue: true };
  Storage.setItemSync(KEY, JSON.stringify(next));
  safetyStore.set(next);
  applyNative(next);
  const t = sessionStore.get().session?.token;
  if (t) void api('/v1/users/me/safety-prefs', { method: 'PUT', body: JSON.stringify({ prefs: next }) }, t).catch(() => {});
}

/** After sign-in: the account's saved choices win over this phone's. */
export async function pullSafetyPrefs() {
  const t = sessionStore.get().session?.token;
  if (!t) return;
  try {
    const { prefs } = await api<{ prefs: Partial<SafetyPrefs> }>('/v1/users/me/safety-prefs', {}, t);
    if (Object.keys(prefs).length) {
      const next = { ...safetyStore.get(), ...prefs, offline_sos_queue: true };
      Storage.setItemSync(KEY, JSON.stringify(next));
      safetyStore.set(next);
      applyNative(next);
    }
  } catch { /* offline: keep this phone's choices */ }
}
