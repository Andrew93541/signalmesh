// Nearby mesh: phone-to-phone SOS relay with no shared network, using Google
// Nearby Connections (Bluetooth / BLE / Wi-Fi Direct, chosen by Android).
//
// Store-and-forward, delivered by whoever gets a connection first:
//   - A phone that cannot reach any gateway hands its SOS (and SOS it holds for
//     others) to every connected nearby phone that is not already on the path.
//   - The receiver stores it (same rules as the LAN relay: validate, dedupe by
//     message_id, append itself to hops) and answers ACK. ACK means "a nearby phone
//     holds it" = RELAYED, never DELIVERED.
//   - Any phone with a route (mobile data, any Wi-Fi, the local station) forwards
//     to the gateway; the backend stores each message_id once however many copies arrive.
//   - Responder statuses (DELIVERED / ACKNOWLEDGED / RESOLVED) come back as STATUS
//     frames, passed on phone to phone, so the sender sees them even while offline.
//
// Frames are small JSON strings (< 32 KB). Everything received is validated; nothing
// is trusted because it came over Bluetooth.

import { PermissionsAndroid, Platform } from 'react-native';

import { Nearby } from '../../modules/signalmesh-nearby';

import type { PeerAck } from './alertFormat';
import { isStatus, type SosMessage, type SosStatus } from './contract';
import { gatewayAt } from './gateway';
import { applyAckStatus, markSent, outboxStore, queuedItems, statusRank } from './outbox';
import {
  acceptSosMessage, forwardOnce, noteMeshHandoff, pendingRelayMessages, relayAwaitingStatus, relayStatuses, setRelayStatus,
} from './relay';
import { noteSeenBy } from './seenBy';
import { getSettings, settingsStore } from './settings';
import { flushPeerAcks, onResponderStatus, peerAckOutbox, queuePeerAck, setMeshPeerAckSender } from './sosAlerts';
import { createStore } from './store';
import { activeRouteUrl, linkStore, syncNow } from './sync';

type Frame =
  | { v: 1; t: 'HELLO'; node: string; online: boolean }
  | { v: 1; t: 'SOS'; msg: SosMessage }
  | { v: 1; t: 'ACK'; id: string; status: SosStatus }
  | { v: 1; t: 'STATUS'; id: string; status: SosStatus; by?: string | null; at?: string | null }
  // A nearby person acknowledged an SOS on their phone. Passed toward the sender and to any gateway.
  | { v: 1; t: 'PEER_ACK'; ack: PeerAck };

export interface MeshPeer { endpointId: string; node: string; online: boolean | null; since: string }
export interface MeshState {
  available: boolean; // native module present in this build
  running: boolean;
  error: string | null;
  peers: MeshPeer[];
  log: string[];
}

export const meshStore = createStore<MeshState>({ available: !!Nearby, running: false, error: null, peers: [], log: [] });

const patch = (p: Partial<MeshState>) => meshStore.set({ ...meshStore.get(), ...p });
function log(line: string) {
  console.log(`[mesh] ${line}`);
  const t = new Date().toTimeString().slice(0, 8);
  patch({ log: [`${t} ${line}`, ...meshStore.get().log].slice(0, 60) });
}

const PUMP_MS = 5_000;
const RESEND_MS = 15_000; // no ACK within this time: offer again
const STATUS_POLL_MS = 10_000;

const acked = new Map<string, Set<string>>(); // message_id -> nodes that hold it
const offered = new Map<string, number>(); // `${message_id}>${node}` -> sent at
const known = new Map<string, SosStatus>(); // best status seen per message_id (gossip dedupe)
let lastStatusPoll = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let subscribed = false;
let starting = false;

const nodeOf = (endpointName: string | null) => (endpointName ?? '').replace(/^TM:/, '');
const isOnline = () => linkStore.get().state === 'online';

async function send(endpointId: string, f: Frame) {
  if (!Nearby) return false;
  try {
    await Nearby.send(endpointId, JSON.stringify(f));
    return true;
  } catch (e) {
    log(`send to ${endpointId} failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function broadcast(f: Frame, except?: string) {
  await Promise.all(meshStore.get().peers.filter((p) => p.endpointId !== except).map((p) => send(p.endpointId, f)));
}

// ---- permissions ------------------------------------------------------------------

async function ensurePermissions(): Promise<string | null> {
  if (Platform.OS !== 'android') return 'Nearby mesh is Android only.';
  const v = Number(Platform.Version);
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted = [
    P.ACCESS_FINE_LOCATION,
    ...(v >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_ADVERTISE, P.BLUETOOTH_CONNECT] : []),
    ...(v >= 33 ? [P.NEARBY_WIFI_DEVICES, P.POST_NOTIFICATIONS] : []),
  ].filter(Boolean) as (typeof P)[keyof typeof P][];
  const res = await PermissionsAndroid.requestMultiple(wanted);
  const denied = wanted.filter((p) => res[p] !== PermissionsAndroid.RESULTS.GRANTED);
  // Location is optional on Android 12+ for Nearby; Bluetooth/nearby-devices are not.
  // Location is optional on 12+; notifications only affect alerts (warned about in Help others).
  const blocking = denied.filter((p) => (v < 31 || p !== P.ACCESS_FINE_LOCATION) && p !== P.POST_NOTIFICATIONS);
  return blocking.length ? `Permission needed: ${blocking.map((p) => p.split('.').pop()).join(', ')}` : null;
}

// ---- receiving ----------------------------------------------------------------------

function parseFrame(data: string): Frame | null {
  try {
    const f = JSON.parse(data);
    if (!f || f.v !== 1 || typeof f.t !== 'string') return null;
    if (f.t === 'ACK' || f.t === 'STATUS') return typeof f.id === 'string' && isStatus(f.status) ? f : null;
    if (f.t === 'SOS') return f.msg && typeof f.msg === 'object' ? f : null;
    if (f.t === 'HELLO') return typeof f.node === 'string' ? f : null;
    if (f.t === 'PEER_ACK') {
      const a = f.ack;
      return a && typeof a.message_id === 'string' && /^SM-[A-Za-z0-9-]{6,64}$/.test(a.message_id)
        && typeof a.recipient_device_id === 'string' && a.recipient_device_id.length <= 64
        && typeof a.acknowledged_at === 'string' && !isNaN(Date.parse(a.acknowledged_at)) ? f : null;
    }
    return null;
  } catch {
    return null;
  }
}

function applyStatus(id: string, status: SosStatus, by: string | null | undefined, at: string | null | undefined, from?: string) {
  if (statusRank(status) <= statusRank(known.get(id))) return;
  known.set(id, status);
  applyAckStatus(id, { message_id: id, status, acknowledged_by: by ?? null, acknowledged_at: at ?? null }); // own SOS (no-op otherwise)
  onResponderStatus(id, status); // an SOS alerting on this phone stops once a responder acts
  setRelayStatus(id, status); // copy held for someone else (no-op otherwise)
  log(`status ${id.slice(-8)} → ${status}`);
  void broadcast({ v: 1, t: 'STATUS', id, status, by, at }, from); // pass it on toward the sender
}

async function onMessage(endpointId: string, name: string | null, data: string) {
  const f = parseFrame(data);
  if (!f) return log(`ignored invalid frame from ${nodeOf(name)}`);
  const node = nodeOf(name);
  if (f.t === 'HELLO') {
    patch({ peers: meshStore.get().peers.map((p) => (p.endpointId === endpointId ? { ...p, online: f.online } : p)) });
    return;
  }
  if (f.t === 'SOS') {
    const [code, body] = acceptSosMessage(f.msg, `mesh:${node}`);
    if (code >= 300) return log(`rejected SOS from ${node}: ${body?.detail ?? code}`);
    log(`${body.duplicate ? 'already had' : 'received'} SOS ${String(f.msg.message_id).slice(-8)} from ${node}`);
    await send(endpointId, { v: 1, t: 'ACK', id: f.msg.message_id, status: isStatus(body.status) ? body.status : 'RELAYED' });
    if (!body.duplicate) { syncNow(); void forwardOnce(); }
    return;
  }
  if (f.t === 'ACK') {
    if (!acked.has(f.id)) acked.set(f.id, new Set());
    acked.get(f.id)!.add(node);
    offered.delete(`${f.id}>${node}`);
    const own = outboxStore.get().find((i) => i.message.message_id === f.id);
    if (own?.status === 'QUEUED') markSent(f.id, 'RELAYED'); // a nearby phone holds it; not yet delivered
    else if (!own) noteMeshHandoff(f.id, node);
    log(`${node} holds ${f.id.slice(-8)}`);
    if (statusRank(f.status) > statusRank('RELAYED')) applyStatus(f.id, f.status, null, null, endpointId);
    return;
  }
  if (f.t === 'STATUS') applyStatus(f.id, f.status, f.by, f.at, endpointId);
  if (f.t === 'PEER_ACK') {
    const a = f.ack;
    const added = queuePeerAck({ ...a, recipient_name: typeof a.recipient_name === 'string' ? a.recipient_name.slice(0, 80) : null,
      recipient_user_id: typeof a.recipient_user_id === 'string' ? a.recipient_user_id.slice(0, 64) : null });
    if (outboxStore.get().some((i) => i.message.message_id === a.message_id)) {
      noteSeenBy(a.message_id, [{ device_id: a.recipient_device_id, name: a.recipient_name ?? null, acknowledged_at: a.acknowledged_at }], 'NEARBY');
    }
    if (added) {
      log(`${a.recipient_device_id} acknowledged ${a.message_id.slice(-8)} on their phone`);
      void broadcast(f, endpointId); // pass it on toward the sender and a gateway
      void flushPeerAcks();
    }
  }
}

function onPeer(type: 'connected' | 'disconnected', endpointId: string, name: string | null) {
  const peers = meshStore.get().peers.filter((p) => p.endpointId !== endpointId);
  if (type === 'connected') {
    peers.push({ endpointId, node: nodeOf(name), online: null, since: new Date().toISOString() });
    patch({ peers });
    log(`connected to ${nodeOf(name)}`);
    void send(endpointId, { v: 1, t: 'HELLO', node: getSettings().deviceId, online: isOnline() });
    // Tell the newcomer every responder status we know, so a returning sender catches up.
    for (const [id, status] of known) if (statusRank(status) >= statusRank('DELIVERED')) void send(endpointId, { v: 1, t: 'STATUS', id, status });
    for (const ack of peerAckOutbox()) void send(endpointId, { v: 1, t: 'PEER_ACK', ack }); // acknowledgements not yet at a gateway
    void pump();
  } else {
    patch({ peers });
    log(`disconnected from ${nodeOf(name) || endpointId}`);
  }
}

// ---- sending --------------------------------------------------------------------------

async function pump() {
  const { peers, running } = meshStore.get();
  if (!running) return;

  if (isOnline()) {
    // This phone can reach a gateway: deliver what others handed us, and bring
    // responder statuses back to the mesh.
    void forwardOnce();
    void flushPeerAcks();
    if (peers.length && Date.now() - lastStatusPoll > STATUS_POLL_MS && activeRouteUrl()) {
      lastStatusPoll = Date.now();
      const client = gatewayAt(activeRouteUrl()!);
      for (const r of relayAwaitingStatus()) {
        try {
          const a = await client.ackStatus(r.message_id);
          applyStatus(a.message_id, a.status, a.acknowledged_by, a.acknowledged_at);
        } catch { /* gateway may not have it yet */ }
      }
    }
    return;
  }
  if (!peers.length) return;

  // No route: offer our own queued SOS and the SOS we hold for others.
  const messages: SosMessage[] = [...queuedItems().map((i) => i.message), ...pendingRelayMessages()];
  const now = Date.now();
  for (const msg of messages) {
    for (const p of peers) {
      if (!p.node || msg.hops?.includes(p.node) || acked.get(msg.message_id)?.has(p.node)) continue;
      const key = `${msg.message_id}>${p.node}`;
      if (now - (offered.get(key) ?? 0) < RESEND_MS) continue;
      offered.set(key, now);
      if (await send(p.endpointId, { v: 1, t: 'SOS', msg })) log(`offered ${msg.message_id.slice(-8)} to ${p.node}`);
    }
  }
}

// ---- start / stop -----------------------------------------------------------------------

function subscribe() {
  if (subscribed || !Nearby) return;
  subscribed = true;
  Nearby.addListener('onPeer', (e) => onPeer(e.type, e.endpointId, e.name));
  Nearby.addListener('onMessage', (e) => void onMessage(e.endpointId, e.name, e.data));
  Nearby.addListener('onLog', (e) => log(e.message));
  // Something new to send, or the route state changed: act now instead of waiting.
  outboxStore.subscribe(() => void pump());
  let lastOnline = isOnline();
  linkStore.subscribe(() => {
    const online = isOnline();
    if (online === lastOnline) return;
    lastOnline = online;
    void broadcast({ v: 1, t: 'HELLO', node: getSettings().deviceId, online });
    void pump();
  });
  for (const r of relayStatuses()) if (isStatus(r.status)) known.set(r.message_id, r.status);
  setMeshPeerAckSender((ack) => void broadcast({ v: 1, t: 'PEER_ACK', ack }));
}

export async function startMesh(): Promise<string | null> {
  if (!Nearby) {
    patch({ error: 'This build has no nearby mesh. Install the latest TrackMate build.' });
    return meshStore.get().error;
  }
  if (meshStore.get().running || starting) return null;
  starting = true;
  try {
    const problem = await ensurePermissions();
    if (problem) { patch({ error: problem, running: false }); log(problem); return problem; }
    subscribe();
    await Nearby.start(`TM:${getSettings().deviceId}`);
    // Keeps the process (and the Bluetooth link) alive with the screen off; Android shows
    // a "Listening for nearby SOS" notification while it runs. Refusal is not fatal.
    if (!Nearby.startService()) log('background listening not allowed by Android: works while TrackMate is open');
    patch({ running: true, error: null });
    log(`started as ${getSettings().deviceId}`);
    if (!timer) timer = setInterval(() => void pump(), PUMP_MS);
    return null;
  } catch (e) {
    const msg = `Could not start nearby mesh: ${e instanceof Error ? e.message : String(e)}`;
    patch({ running: false, error: msg });
    log(msg);
    return msg;
  } finally {
    starting = false;
  }
}

export async function stopMesh() {
  if (timer) clearInterval(timer);
  timer = null;
  Nearby?.stopService();
  await Nearby?.stop().catch(() => {});
  patch({ running: false, peers: [] });
  log('stopped');
}

/** Called once at app start: runs the mesh while it is switched on in settings. */
export function initMesh() {
  if (getSettings().meshEnabled) void startMesh();
  let enabled = getSettings().meshEnabled;
  settingsStore.subscribe(() => {
    const now = getSettings().meshEnabled;
    if (now === enabled) return;
    enabled = now;
    void (now ? startMesh() : stopMesh());
  });
}
