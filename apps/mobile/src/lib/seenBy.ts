// Sender side: nearby TrackMate users who acknowledged OUR SOS on their phone.
// Learned over the mesh (PEER_ACK frames) or from the gateway (ack-status seen_by).
// This is not a responder acknowledgement and is shown separately.

import Storage from 'expo-sqlite/kv-store';

import { createStore } from './store';

export interface SeenEntry { device_id: string; name: string | null; acknowledged_at: string; via: 'NEARBY' | 'SERVER' }

const KEY = 'trackmate.seenBy';

function read(): Record<string, SeenEntry[]> {
  try {
    return JSON.parse(Storage.getItemSync(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const seenByStore = createStore<Record<string, SeenEntry[]>>(read());

export function noteSeenBy(messageId: string, entries: Omit<SeenEntry, 'via'>[], via: SeenEntry['via']) {
  const all = { ...seenByStore.get() };
  const list = [...(all[messageId] ?? [])];
  let changed = false;
  for (const e of entries) {
    const i = list.findIndex((x) => x.device_id === e.device_id);
    if (i === -1) { list.push({ ...e, via }); changed = true; }
    else if (via === 'SERVER' && list[i].via !== 'SERVER') { list[i] = { ...list[i], via }; changed = true; }
  }
  if (!changed) return;
  all[messageId] = list;
  Storage.setItemSync(KEY, JSON.stringify(all));
  seenByStore.set(all);
}
