import Storage from 'expo-sqlite/kv-store';

import { createStore } from './store';

export interface Settings {
  gatewayUrl: string; // the next hop: a relay node or the gateway itself
  deviceId: string;
  workerName: string;
  checkinMinutes: number;
  simulateNoSignal: boolean; // demo switch: pauses all network sends
  relayEnabled: boolean; // this phone also accepts and forwards other phones' SOS
  relayPort: number;
}

const KEY = 'settings';

const DEFAULTS: Settings = {
  gatewayUrl: 'http://192.168.1.10:8000',
  deviceId: 'MOBILE_01',
  workerName: 'Ravi',
  checkinMinutes: 15,
  simulateNoSignal: false,
  relayEnabled: false,
  relayPort: 8080,
};

function read(): Settings {
  try {
    const raw = Storage.getItemSync(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export const settingsStore = createStore<Settings>(read());

export const getSettings = settingsStore.get;

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...settingsStore.get(), ...patch };
  Storage.setItemSync(KEY, JSON.stringify(next));
  settingsStore.set(next);
  return next;
}
