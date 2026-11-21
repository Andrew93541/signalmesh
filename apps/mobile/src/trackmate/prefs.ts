// TrackMate app preferences (separate from SignalMesh settings).

import Storage from 'expo-sqlite/kv-store';

import { createStore } from '@/lib/store';

export type Mode = 'TOURIST' | 'TREKKER';

export interface Prefs {
  mode: Mode | null; // null until the user picks one on first run
}

const KEY = 'trackmate.prefs';

function read(): Prefs {
  try {
    const raw = Storage.getItemSync(KEY);
    return raw ? { mode: null, ...JSON.parse(raw) } : { mode: null };
  } catch {
    return { mode: null };
  }
}

export const prefsStore = createStore<Prefs>(read());

export function setMode(mode: Mode) {
  const next = { ...prefsStore.get(), mode };
  Storage.setItemSync(KEY, JSON.stringify(next));
  prefsStore.set(next);
}

export const MODE_LABEL: Record<Mode, string> = { TOURIST: 'Tourist', TREKKER: 'Trekker' };
