// Retry loop: every few seconds, push queued SOS messages and check-ins to
// the next hop, then poll for acknowledgements. Runs while the app is open.

import { flushCheckin } from './checkin';
import { gateway } from './gateway';
import { applyAckStatus, awaitingAckItems, markFailed, markSent, queuedItems } from './outbox';
import { getSettings } from './settings';
import { createStore } from './store';

export type LinkState = 'checking' | 'online' | 'unreachable' | 'simulated_offline';

export const linkStore = createStore<{ state: LinkState; error: string | null }>({
  state: 'checking',
  error: null,
});

const INTERVAL_MS = 3000;
let started = false;
let busy = false;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function setLink(state: LinkState, error: string | null = null) {
  const cur = linkStore.get();
  if (cur.state !== state || cur.error !== error) linkStore.set({ state, error });
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    if (getSettings().simulateNoSignal) {
      setLink('simulated_offline');
      return;
    }

    try {
      await gateway.health();
    } catch (e) {
      setLink('unreachable', errorText(e));
      return;
    }
    setLink('online');

    for (const item of queuedItems()) {
      try {
        markSent(item.message.message_id, await gateway.sendSos(item.message));
      } catch (e) {
        markFailed(item.message.message_id, errorText(e));
        setLink('unreachable', errorText(e));
        return;
      }
    }

    await flushCheckin();

    for (const item of awaitingAckItems()) {
      try {
        applyAckStatus(item.message.message_id, await gateway.ackStatus(item.message.message_id));
      } catch {
        // The relay or gateway may not know this message yet; try again next tick.
      }
    }
  } catch (e) {
    setLink('unreachable', errorText(e));
  } finally {
    busy = false;
  }
}

export function startSync() {
  if (started) return;
  started = true;
  void tick();
  setInterval(() => void tick(), INTERVAL_MS);
}

/** Try right away instead of waiting for the next tick (after an SOS or a check-in). */
export function syncNow() {
  void tick();
}
