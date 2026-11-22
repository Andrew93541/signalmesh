// Recipient side of an SOS, JavaScript part. The alert itself (notification, siren,
// vibration, duplicate check, local acknowledgement) is native: see
// modules/signalmesh-nearby/.../SosAlerts.kt. This file:
//   - opens the pop-up when an alert arrives while the app is on screen,
//   - delivers acknowledgements: over the nearby mesh toward the sender, and to a gateway
//     when any route exists (queued and retried until the gateway records it),
//   - stops the alert when a responder acknowledges or resolves the incident.
// A nearby person's acknowledgement is never reported as a responder acknowledgement.

import { router } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';

import { Nearby } from '../../modules/signalmesh-nearby';

import { mergePeerAck, parseAlert, type PeerAck, type SosAlert } from './alertFormat';
import { GatewayError, gatewayAt } from './gateway';
import { onNetworkChange } from './network';
import { getSettings } from './settings';
import { createStore } from './store';
import { activeRouteUrl, linkStore } from './sync';

const load = (): SosAlert[] => (Nearby ? Nearby.listAlerts().map(parseAlert).filter((a): a is SosAlert => !!a) : []);
export const alertsStore = createStore<SosAlert[]>(load());
export const refreshAlerts = () => alertsStore.set(load());
export const getAlert = (id: string) => parseAlert(Nearby?.getAlert(id));

// ---- acknowledgement outbox (our own, plus ones we carry for nearby phones) ------------------

const OUT_KEY = 'trackmate.peerAckOutbox';
function readOut(): PeerAck[] {
  try { return JSON.parse(Storage.getItemSync(OUT_KEY) ?? '[]'); } catch { return []; }
}
function writeOut(list: PeerAck[]) {
  Storage.setItemSync(OUT_KEY, JSON.stringify(list));
}
export const peerAckOutbox = () => readOut();

/** Adds to the delivery queue. Returns false if this (incident, recipient) was already queued. */
export function queuePeerAck(a: PeerAck): boolean {
  const { list, added } = mergePeerAck(readOut(), a);
  if (added) writeOut(list);
  return added;
}

let meshSend: ((a: PeerAck) => void) | null = null;
/** mesh.ts registers how to pass an acknowledgement to nearby phones (avoids an import cycle). */
export function setMeshPeerAckSender(fn: (a: PeerAck) => void) { meshSend = fn; }

function ownAcks() {
  if (!Nearby) return;
  const { deviceId, workerName } = getSettings();
  for (const a of Nearby.pendingAcks().map(parseAlert)) {
    if (!a?.acknowledged_at) continue;
    const pa: PeerAck = { message_id: a.message_id, recipient_device_id: deviceId, recipient_name: workerName || null,
      recipient_user_id: null, acknowledged_at: a.acknowledged_at };
    if (queuePeerAck(pa)) meshSend?.(pa);
  }
}

let flushing = false;
export async function flushPeerAcks() {
  const url = activeRouteUrl();
  if (!url || flushing) return;
  flushing = true;
  try {
    const client = gatewayAt(url);
    const { deviceId } = getSettings();
    for (const a of readOut()) {
      try {
        await client.peerAck(a);
        writeOut(readOut().filter((x) => !(x.message_id === a.message_id && x.recipient_device_id === a.recipient_device_id)));
        if (a.recipient_device_id === deviceId) Nearby?.markAckConfirmed(a.message_id, 'GATEWAY'); // server-confirmed
        console.log(`[alert] acknowledgement ${a.message_id.slice(-8)} by ${a.recipient_device_id} recorded by gateway`);
      } catch (e) {
        if (e instanceof GatewayError && e.status === 422) {
          writeOut(readOut().filter((x) => x !== a)); // malformed: never deliverable
          continue;
        }
        break; // unreachable, or a relay hop that does not take acknowledgements: retry later
      }
    }
  } finally {
    flushing = false;
    refreshAlerts();
  }
}

// ---- responder status: stop alerting once help is acknowledged or the SOS is resolved ---------

export function onResponderStatus(id: string, status: string) {
  if (!Nearby || (status !== 'ACKNOWLEDGED' && status !== 'RESOLVED')) return;
  if (Nearby.resolveAlert(id, status)) refreshAlerts();
}

async function watchResponders() {
  const url = activeRouteUrl();
  if (!url || !Nearby) return;
  const client = gatewayAt(url);
  for (const a of load()) {
    if (a.responder_status === 'RESOLVED' || a.state === 'MUTED') continue;
    try {
      const s = await client.ackStatus(a.message_id);
      onResponderStatus(a.message_id, s.status);
    } catch { /* the gateway may not have it yet */ }
  }
}

// ---- start ------------------------------------------------------------------------------------

let started = false;
export function initAlerts() {
  if (started || !Nearby) return;
  started = true;
  Nearby.addListener('onAlert', (e) => {
    refreshAlerts();
    if (AppState.currentState === 'active') router.push({ pathname: '/sos-alert/[id]', params: { id: e.messageId } });
  });
  Nearby.addListener('onAck', () => {
    refreshAlerts();
    ownAcks();
    void flushPeerAcks();
  });
  // Opened from the notification / full-screen intent: Expo Router follows the deep link
  // itself; this only applies the show-over-lock-screen flag for that case.
  Nearby.consumeLaunchAlert();
  AppState.addEventListener('change', (s) => {
    if (s !== 'active') return;
    Nearby?.consumeLaunchAlert();
    refreshAlerts();
    ownAcks();
  });
  ownAcks(); // acknowledgements saved while the app was closed
  const tick = () => { void flushPeerAcks().then(watchResponders); };
  onNetworkChange(tick);
  let wasOnline = false;
  linkStore.subscribe(() => {
    const online = linkStore.get().state === 'online';
    if (online && !wasOnline) tick();
    wasOnline = online;
  });
  setInterval(tick, 15_000);
}
