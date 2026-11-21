// Local alarm so anyone physically nearby notices, even with no network.
// Vibration only for now; add a siren sound with expo-audio once there is an asset.

import { Vibration } from 'react-native';

import { createStore } from './store';

export const alarmStore = createStore(false);

export function setAlarm(on: boolean) {
  if (on) Vibration.vibrate([0, 800, 400], true);
  else Vibration.cancel();
  alarmStore.set(on);
}
