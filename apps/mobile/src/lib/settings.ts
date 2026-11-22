import Storage from 'expo-sqlite/kv-store';

import { getRandomBytes } from 'expo-crypto';

import { preferBuiltAddress } from './backoff';
import { createStore } from './store';

export interface Settings {
  gatewayUrl: string; // local next hop (offline mode): a relay phone or the local gateway, LAN http allowed
  onlineGatewayUrl: string; // hosted gateway (online mode), https only; empty = online mode off
  deviceId: string;
  workerName: string;
  checkinMinutes: number;
  simulateNoSignal: boolean; // demo switch: pauses all network sends
  relayEnabled: boolean; // this phone also accepts and forwards other phones' SOS
  relayPort: number;
  meshEnabled: boolean; // nearby phone mesh (Bluetooth / Wi-Fi Direct), no shared network needed
  shareCallNumber: boolean; // include my phone number in my SOS so nearby TrackMate users can call me
}

const KEY = 'settings';

const DEFAULTS: Settings = {
  // Set at build time (EXPO_PUBLIC_*), never hard-coded addresses. Empty means
  // "not set up yet": the app asks the user to enter it in Connection settings.
  gatewayUrl: process.env.EXPO_PUBLIC_LOCAL_GATEWAY_URL ?? '',
  onlineGatewayUrl: process.env.EXPO_PUBLIC_ONLINE_GATEWAY_URL ?? '',
  deviceId: 'MOBILE_01',
  workerName: 'Ravi',
  checkinMinutes: 15,
  simulateNoSignal: false,
  relayEnabled: false,
  relayPort: 8080,
  meshEnabled: true,
  shareCallNumber: false,
};

/** Every install needs its own device ID: it names this phone in hop paths and on the nearby mesh. */
function newDeviceId() {
  const hex = Array.from(getRandomBytes(2), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `MOBILE_${hex}`;
}

function read(): Settings {
  try {
    const raw = Storage.getItemSync(KEY);
    if (raw) {
      const saved: Settings = { ...DEFAULTS, ...JSON.parse(raw) };
      return {
        ...saved,
        onlineGatewayUrl: preferBuiltAddress(saved.onlineGatewayUrl, process.env.EXPO_PUBLIC_ONLINE_GATEWAY_URL),
        gatewayUrl: preferBuiltAddress(saved.gatewayUrl, process.env.EXPO_PUBLIC_LOCAL_GATEWAY_URL),
      };
    }
    const first = { ...DEFAULTS, deviceId: newDeviceId() };
    Storage.setItemSync(KEY, JSON.stringify(first));
    return first;
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
