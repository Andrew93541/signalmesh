// Delivery loop for this phone's own SOS messages and check-ins.
//
// Routes, in order:
//   INTERNET: the hosted gateway over HTTPS (online mode), when set up and the phone has internet
//   LOCAL:    the local next hop on Wi-Fi/hotspot, a relay phone or the local gateway (offline mode)
// The first route whose /health answers is used. The same message_id goes over every
// route and every retry, so the backend stores an SOS once whichever way it arrives.
//
// Pacing: no fixed fast polling. Failures back off 3 s → 60 s; with nothing to send
// and nothing awaiting a response the loop only checks every 30 s. A network change,
// the app coming to the foreground, or a new SOS retries immediately.

import { AppState } from 'react-native';

import { backoffDelay } from './backoff';
import { flushCheckin } from './checkin';
import { GatewayError, gatewayAt } from './gateway';
import { netStore, onNetworkChange } from './network';
import { applyAckStatus, awaitingAckItems, markFailed, markSent, queuedItems } from './outbox';
import { noteSeenBy } from './seenBy';
import { getSettings } from './settings';
import { createStore } from './store';

export type LinkState = 'checking' | 'online' | 'unreachable' | 'simulated_offline' | 'not_configured';
export type Route = 'INTERNET' | 'LOCAL';
export const ROUTE_LABEL: Record<Route, string> = { INTERNET: 'Internet (online gateway)', LOCAL: 'Local network (offline mode)' };

export const linkStore = createStore<{ state: LinkState; error: string | null; route: Route | null; nextRetryAt: number | null }>({
  state: 'checking', error: null, route: null, nextRetryAt: null,
});

const ACTIVE_MS = 5_000; // something queued or awaiting acknowledgement
const IDLE_MS = 30_000; // nothing pending: just keep the connection indicator honest

let activeUrl: string | null = null;
/** Address of the route the last pass could reach (relay forwarding uses it too). */
export const activeRouteUrl = () => activeUrl;

let started = false;
let busy = false;
let again = false;
let failures = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function setLink(patch: Partial<ReturnType<typeof linkStore.get>>) {
  const cur = linkStore.get();
  const next = { ...cur, ...patch };
  if (next.state !== cur.state || next.error !== cur.error || next.route !== cur.route || next.nextRetryAt !== cur.nextRetryAt) linkStore.set(next);
}

function candidates(): { route: Route; url: string }[] {
  const s = getSettings();
  const internet = netStore.get().internet;
  const out: { route: Route; url: string }[] = [];
  if (s.onlineGatewayUrl.trim() && internet !== false) out.push({ route: 'INTERNET', url: s.onlineGatewayUrl });
  if (s.gatewayUrl.trim()) out.push({ route: 'LOCAL', url: s.gatewayUrl });
  return out;
}

/** One pass. Returns true when everything that could be done succeeded. */
async function pass(): Promise<boolean> {
  if (getSettings().simulateNoSignal) {
    setLink({ state: 'simulated_offline', route: null, error: null });
    return true; // not a failure; no backoff growth
  }
  const routes = candidates();
  if (!routes.length) {
    setLink({ state: 'not_configured', route: null, error: 'No safety station address set up' });
    return true;
  }

  const reachable: { route: Route; url: string; client: ReturnType<typeof gatewayAt> }[] = [];
  let lastError: string | null = null;
  for (const r of routes) {
    const client = gatewayAt(r.url);
    try {
      await client.health();
      reachable.push({ route: r.route, url: r.url, client });
      break; // first answering route is enough to send; others are tried only for ack lookups below
    } catch (e) {
      lastError = `${r.route === 'INTERNET' ? 'Online gateway' : 'Local network'}: ${errorText(e)}`;
    }
  }
  if (!reachable.length) {
    activeUrl = null;
    setLink({ state: 'unreachable', route: null, error: lastError });
    return false;
  }
  const active = reachable[0];
  activeUrl = active.url;
  setLink({ state: 'online', route: active.route, error: null });

  for (const item of queuedItems()) {
    try {
      markSent(item.message.message_id, await active.client.sendSos(item.message));
      console.log(`[sync] ${item.message.message_id} sent via ${active.route}`);
    } catch (e) {
      markFailed(item.message.message_id, errorText(e));
      setLink({ state: 'unreachable', route: null, error: errorText(e) });
      return false;
    }
  }

  await flushCheckin(active.client).catch(() => {});

  // A message sent earlier over the other route is only known there; ask both.
  const others = routes.filter((r) => r.route !== active.route).map((r) => gatewayAt(r.url));
  for (const item of awaitingAckItems()) {
    let unknownEverywhere = true;
    for (const client of [active.client, ...others]) {
      try {
        const ack = await client.ackStatus(item.message.message_id);
        applyAckStatus(item.message.message_id, ack);
        if (ack.seen_by?.length) noteSeenBy(item.message.message_id, ack.seen_by, 'SERVER');
        unknownEverywhere = false;
        break;
      } catch (e) {
        if (!(e instanceof GatewayError && e.status === 404)) unknownEverywhere = false;
      }
    }
    // Handed to a nearby phone (RELAYED) but no gateway has it yet, and now this phone
    // has a route: deliver it directly. Same message_id, so the backend stores it once.
    if (unknownEverywhere && item.status === 'RELAYED') {
      await active.client.sendSos(item.message).then(
        (st) => { applyAckStatus(item.message.message_id, { message_id: item.message.message_id, status: st }); console.log(`[sync] ${item.message.message_id} re-sent directly via ${active.route}`); },
        () => {},
      );
    }
  }
  return true;
}

function schedule() {
  if (timer) clearTimeout(timer);
  const pending = queuedItems().length > 0 || awaitingAckItems().length > 0;
  const delay = failures > 0 ? backoffDelay(failures - 1) : pending ? ACTIVE_MS : IDLE_MS;
  setLink({ nextRetryAt: failures > 0 ? Date.now() + delay : null });
  timer = setTimeout(() => void run(), delay);
}

async function run() {
  if (busy) { again = true; return; }
  busy = true;
  try {
    failures = (await pass().catch((e) => { setLink({ state: 'unreachable', route: null, error: errorText(e) }); return false; })) ? 0 : failures + 1;
  } finally {
    busy = false;
  }
  if (again) { again = false; failures = 0; return void run(); }
  schedule();
}

export function startSync() {
  if (started) return;
  started = true;
  onNetworkChange(() => syncNow());
  AppState.addEventListener('change', (s) => { if (s === 'active') syncNow(); });
  void run();
}

/** Retry right away and reset the backoff (new SOS, check-in, settings or network change). */
export function syncNow() {
  failures = 0;
  void run();
}
