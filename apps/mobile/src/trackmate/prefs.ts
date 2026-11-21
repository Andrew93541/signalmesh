// TrackMate app preferences (separate from SignalMesh settings).

import Storage from 'expo-sqlite/kv-store';

import { preferBuiltAddress } from '@/lib/backoff';
import { createStore } from '@/lib/store';

export type Mode = 'TOURIST' | 'TREKKER';

export interface Prefs {
  mode: Mode | null; // null until the user picks one
  onboardingDone: boolean;
  guest: boolean; // using the app without an account (SOS and local features still work)
  backendUrl: string; // TrackMate account server (not the SignalMesh gateway)
}

const KEY = 'trackmate.prefs';
const DEFAULTS: Prefs = { mode: null, onboardingDone: false, guest: false, backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? (__DEV__ ? 'http://127.0.0.1:8100' : '') };

function read(): Prefs {
  try {
    const raw = Storage.getItemSync(KEY);
    if (!raw) return DEFAULTS;
    const saved = { ...DEFAULTS, ...JSON.parse(raw) };
    return { ...saved, backendUrl: preferBuiltAddress(saved.backendUrl, process.env.EXPO_PUBLIC_BACKEND_URL) };
  } catch {
    return DEFAULTS;
  }
}

export const prefsStore = createStore<Prefs>(read());

export function savePrefs(patch: Partial<Prefs>) {
  const next = { ...prefsStore.get(), ...patch };
  Storage.setItemSync(KEY, JSON.stringify(next));
  prefsStore.set(next);
}

export const setMode = (mode: Mode) => savePrefs({ mode });

export const MODE_LABEL: Record<Mode, string> = { TOURIST: 'Tourist', TREKKER: 'Trekker' };
