// Watches Wi-Fi / mobile data / hotspot changes. A change triggers an immediate
// retry instead of waiting for the backoff timer.

import * as Network from 'expo-network';

import { createStore } from './store';

export interface NetState { type: string | null; connected: boolean | null; internet: boolean | null }

export const netStore = createStore<NetState>({ type: null, connected: null, internet: null });

let started = false;
const listeners = new Set<() => void>();

function apply(s: Network.NetworkState) {
  const next = { type: s.type ?? null, connected: s.isConnected ?? null, internet: s.isInternetReachable ?? null };
  const cur = netStore.get();
  if (cur.type === next.type && cur.connected === next.connected && cur.internet === next.internet) return;
  netStore.set(next);
  console.log(`[net] ${next.type} connected=${next.connected} internet=${next.internet}`);
  listeners.forEach((f) => f());
}

export function onNetworkChange(f: () => void) {
  listeners.add(f);
  if (!started) {
    started = true;
    Network.getNetworkStateAsync().then(apply).catch(() => {});
    Network.addNetworkStateListener(apply);
  }
  return () => listeners.delete(f);
}
