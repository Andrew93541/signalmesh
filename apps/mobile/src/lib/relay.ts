// Relay mode: this phone runs a small HTTP server on the local Wi-Fi.
// Nearby phones send their SOS here; the relay stores each one in SQLite,
// adds itself to the hop path, and forwards it to its own next hop
// (the gateway or another relay), retrying until accepted.
//
// Needs the SignalMesh development/release build (react-native-tcp-socket is a
// native module). It cannot run inside Expo Go.

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Network from 'expo-network';
import * as SQLite from 'expo-sqlite';

import { Nearby } from '../../modules/signalmesh-nearby';

import { backoffDelay } from './backoff';
import { CATEGORIES, PRIORITIES, type CheckinPayload, type SosMessage } from './contract';
import { GatewayError, gateway, gatewayAt } from './gateway';
import { onNetworkChange } from './network';
import { RequestParser, httpResponse, type HttpRequest } from './relay-http';
import { getSettings } from './settings';
import { createStore } from './store';
import { activeRouteUrl } from './sync';

type Reply = [number, any];

export type RelayItemState = 'PENDING' | 'FORWARDED' | 'REJECTED';

export interface RelayItem {
  message: SosMessage;
  from: string | null;
  receivedAt: string;
  state: RelayItemState;
  nextStatus: string | null; // what the next hop answered (DELIVERED, RELAYED, ACKNOWLEDGED…)
  attempts: number;
  lastError: string | null;
  forwardedAt: string | null;
}

interface Row {
  message_id: string;
  payload: string;
  from_addr: string | null;
  received_at: string;
  state: RelayItemState;
  next_status: string | null;
  attempts: number;
  last_error: string | null;
  forwarded_at: string | null;
}

const db = SQLite.openDatabaseSync('signalmesh.db');
db.execSync(`
  CREATE TABLE IF NOT EXISTS relay_queue (
    message_id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    from_addr TEXT,
    received_at TEXT NOT NULL,
    state TEXT NOT NULL,
    next_status TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    forwarded_at TEXT
  );
  CREATE TABLE IF NOT EXISTS relay_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload TEXT NOT NULL
  );
`);

function loadItems(): RelayItem[] {
  return db.getAllSync<Row>('SELECT * FROM relay_queue ORDER BY received_at DESC LIMIT 100').map((r) => ({
    message: JSON.parse(r.payload),
    from: r.from_addr,
    receivedAt: r.received_at,
    state: r.state,
    nextStatus: r.next_status,
    attempts: r.attempts,
    lastError: r.last_error,
    forwardedAt: r.forwarded_at,
  }));
}

const pendingCheckins = () =>
  db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM relay_checkins')?.n ?? 0;

export interface RelayState {
  running: boolean;
  address: string | null;
  /** route = confirmed via a connection to the next hop; device = unconfirmed fallback */
  addressSource: 'route' | 'device' | null;
  port: number;
  error: string | null;
  items: RelayItem[];
  pendingCheckins: number;
}

export const relayStore = createStore<RelayState>({
  running: false,
  address: null,
  addressSource: null,
  port: getSettings().relayPort,
  error: null,
  items: loadItems(),
  pendingCheckins: pendingCheckins(),
});

const patch = (p: Partial<RelayState>) => relayStore.set({ ...relayStore.get(), ...p });
const refresh = () => patch({ items: loadItems(), pendingCheckins: pendingCheckins() });
const queueSize = () => relayStore.get().items.filter((i) => i.state === 'PENDING').length;

// ---- request handling ------------------------------------------------------

const ID_RE = /^SM-[A-Za-z0-9-]{6,64}$/;

function parseJson(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function acceptSos(body: string, from: string | null): Reply {
  return acceptSosMessage(parseJson(body), from);
}

/**
 * Store a SOS received from another phone (over the LAN relay or the nearby mesh):
 * validate, ignore duplicates by message_id, append this phone to the hop path,
 * queue it for forwarding. Same rules for both transports.
 */
export function acceptSosMessage(m: any, from: string | null): Reply {
  const { deviceId } = getSettings();
  if (!m || typeof m !== 'object') return [400, { detail: 'Body must be JSON' }];
  if (typeof m.message_id !== 'string' || !ID_RE.test(m.message_id)) return [422, { detail: 'Invalid message_id' }];
  if (typeof m.device_id !== 'string' || !m.device_id) return [422, { detail: 'device_id is required' }];
  if (!CATEGORIES.includes(m.category) || !PRIORITIES.includes(m.priority)) return [422, { detail: 'Invalid category or priority' }];
  if (typeof m.created_at !== 'string') return [422, { detail: 'created_at is required' }];
  if (Array.isArray(m.hops) && m.hops.length >= 16) return [422, { detail: 'Too many hops' }];

  const existing = db.getFirstSync<Pick<Row, 'next_status'>>(
    'SELECT next_status FROM relay_queue WHERE message_id = ?',
    m.message_id,
  );
  if (existing) {
    console.log(`[relay] duplicate ${m.message_id} ignored`);
    return [200, { message_id: m.message_id, status: existing.next_status ?? 'RELAYED', duplicate: true, node_id: deviceId }];
  }

  const hops: string[] = Array.isArray(m.hops) && m.hops.length ? m.hops.map(String) : [m.device_id];
  const relayed: SosMessage = { ...m, hops: [...hops, deviceId], hop_count: (Number(m.hop_count) || 0) + 1, status: 'RELAYED' };
  db.runSync(
    'INSERT INTO relay_queue (message_id, payload, from_addr, received_at, state) VALUES (?, ?, ?, ?, ?)',
    relayed.message_id,
    JSON.stringify(relayed),
    from,
    new Date().toISOString(),
    'PENDING',
  );
  console.log(`[relay] stored ${relayed.message_id} from ${from}, path ${relayed.hops.join(' > ')}`);
  // Wi-Fi relay deliveries alert this phone's user too (the mesh path raises its alert natively).
  if (!from?.startsWith('mesh:')) Nearby?.handleIncomingSos(JSON.stringify(m), `wifi-relay:${from ?? 'unknown'}`);
  refresh();
  void forwardOnce();
  return [201, { message_id: relayed.message_id, status: 'RELAYED', duplicate: false, node_id: deviceId }];
}

async function ackStatus(messageId: string): Promise<Reply> {
  const local = db.getFirstSync<Pick<Row, 'state' | 'next_status'>>(
    'SELECT state, next_status FROM relay_queue WHERE message_id = ?',
    messageId,
  );
  try {
    const remote = await gateway.ackStatus(messageId); // ask the next hop
    if (local && remote.status !== local.next_status) {
      db.runSync('UPDATE relay_queue SET next_status = ? WHERE message_id = ?', remote.status, messageId);
      refresh();
    }
    return [200, remote];
  } catch {
    // Next hop unreachable, or it hasn't received the message yet: answer from our copy.
    if (!local) return [404, { detail: `Unknown message_id ${messageId}` }];
    const status = local.state === 'PENDING' ? 'RELAYED' : (local.next_status ?? 'RELAYED');
    return [200, { message_id: messageId, status, acknowledged_by: null, acknowledged_at: null }];
  }
}

function acceptCheckin(body: string): Reply {
  const c = parseJson(body) as CheckinPayload | undefined;
  if (!c || typeof c.device_id !== 'string' || typeof c.checked_in_at !== 'string') {
    return [422, { detail: 'Invalid check-in' }];
  }
  db.runSync('INSERT INTO relay_checkins (payload) VALUES (?)', JSON.stringify(c));
  refresh();
  void forwardOnce();
  const due = new Date(new Date(c.checked_in_at).getTime() + (Number(c.interval_minutes) || 0) * 60_000);
  return [200, { status: 'ok', due_at: isNaN(due.getTime()) ? null : due.toISOString() }];
}

async function route(req: HttpRequest, from: string | null): Promise<Reply> {
  const { deviceId } = getSettings();
  if (req.method === 'GET' && req.path === '/health') {
    return [200, { status: 'ok', node_id: deviceId, role: 'relay', time: new Date().toISOString(), queue: queueSize() }];
  }
  if (req.method === 'POST' && req.path === '/gateway/sos') return acceptSos(req.body, from);
  if (req.method === 'POST' && req.path === '/gateway/checkin') return acceptCheckin(req.body);
  const ack = req.path.match(/^\/gateway\/ack-status\/(.+)$/);
  if (req.method === 'GET' && ack) return ackStatus(decodeURIComponent(ack[1]));
  return [404, { detail: `No route ${req.method} ${req.path}` }];
}

function handleConnection(socket: any) {
  const parser = new RequestParser();
  let answered = false;
  const timeout = setTimeout(() => socket.destroy(), 10_000);
  socket.on('error', () => clearTimeout(timeout));
  socket.on('close', () => clearTimeout(timeout));
  socket.on('data', async (chunk: Uint8Array | string) => {
    if (answered) return;
    const req = parser.push(chunk);
    if (req === null) return; // wait for more data
    answered = true;
    clearTimeout(timeout);
    let reply: Reply;
    if (req === 'too_large') reply = [413, { detail: 'Request too large' }];
    else if (req === 'bad') reply = [400, { detail: 'Malformed request' }];
    else {
      try {
        reply = await route(req, socket.remoteAddress ?? null);
      } catch (e) {
        console.warn('[relay] handler error', e);
        reply = [500, { detail: 'Relay error' }];
      }
    }
    socket.end(httpResponse(reply[0], reply[1]));
  });
}

// ---- forwarding to the next hop ----------------------------------------------

const RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
let forwarding = false;
let relayFailures = 0;
let lastHeartbeat = 0;
const HEARTBEAT_MS = 15_000;

export async function forwardOnce() {
  if (forwarding || getSettings().simulateNoSignal) return;
  forwarding = true;
  let failed = false;
  try {
    const pending = db
      .getAllSync<Row>("SELECT * FROM relay_queue WHERE state = 'PENDING' ORDER BY received_at")
      .map((r) => ({ r, m: JSON.parse(r.payload) as SosMessage }))
      .sort((a, b) => (RANK[a.m.priority] ?? 3) - (RANK[b.m.priority] ?? 3));

    // Best route the sync loop found (online gateway first, then the local hop).
    const next = activeRouteUrl() ? gatewayAt(activeRouteUrl()!) : gateway;
    for (const { m } of pending) {
      try {
        const status = await next.sendSos(m);
        db.runSync(
          "UPDATE relay_queue SET state = 'FORWARDED', next_status = ?, forwarded_at = ?, attempts = attempts + 1, last_error = NULL WHERE message_id = ?",
          status,
          new Date().toISOString(),
          m.message_id,
        );
        console.log(`[relay] forwarded ${m.message_id} -> ${status}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const rejected = e instanceof GatewayError && (e.status === 400 || e.status === 422);
        db.runSync(
          'UPDATE relay_queue SET state = ?, attempts = attempts + 1, last_error = ? WHERE message_id = ?',
          rejected ? 'REJECTED' : 'PENDING',
          msg,
          m.message_id,
        );
        if (!rejected) { failed = true; break; } // next hop down: keep the rest queued, retry with backoff
      }
    }

    const checkins = db.getAllSync<{ id: number; payload: string }>('SELECT * FROM relay_checkins ORDER BY id');
    for (const c of checkins) {
      try {
        await gateway.checkin(JSON.parse(c.payload));
        db.runSync('DELETE FROM relay_checkins WHERE id = ?', c.id);
      } catch {
        break;
      }
    }

    if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
      const { deviceId, workerName } = getSettings();
      await gateway
        .heartbeat({ node_id: deviceId, role: 'relay', label: `${workerName}'s phone`, queue_size: queueSize() })
        .then(() => { lastHeartbeat = Date.now(); })
        .catch(() => {});
    }
  } finally {
    forwarding = false;
    relayFailures = failed ? relayFailures + 1 : 0;
    refresh();
  }
}

/** Self-scheduling loop: 2 s while messages wait, 10 s idle, backoff 3 s → 60 s while the next hop is down. */
function scheduleForward() {
  if (!server) return;
  const pending = db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM relay_queue WHERE state = 'PENDING'")?.n ?? 0;
  const delay = relayFailures > 0 ? backoffDelay(relayFailures - 1) : pending > 0 ? 2_000 : 10_000;
  loop = setTimeout(() => void forwardOnce().finally(scheduleForward), delay);
}

// ---- start / stop -------------------------------------------------------------

let server: any = null;
let loop: ReturnType<typeof setTimeout> | null = null;
let addressTimer: ReturnType<typeof setInterval> | null = null;
let netUnsub: (() => void) | null = null;

/**
 * The address other phones should use. expo-network returns a single device IP,
 * which can be the mobile-data interface (seen on device: 192.0.0.2). Instead,
 * open a TCP connection to the next hop and read the local address Android chose
 * for it: that is the interface on the shared Wi-Fi/hotspot network.
 */
async function refreshAddress(TcpSocket: any) {
  const m = getSettings().gatewayUrl.match(/^https?:\/\/(\[[^\]]+\]|[^/:]+)(?::(\d+))?/i);
  const host = m?.[1];
  const port = m?.[2] ? Number(m[2]) : 80;
  let viaRoute: string | null = null;
  if (host && host !== '127.0.0.1' && host !== 'localhost') {
    viaRoute = await new Promise<string | null>((resolve) => {
      let done = false;
      const finish = (v: string | null) => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(v); } };
      const sock = TcpSocket.createConnection({ host, port }, () => finish(sock.localAddress ?? null));
      sock.on('error', () => finish(null));
      setTimeout(() => finish(null), 3000);
    });
  }
  if (viaRoute && !viaRoute.startsWith('127.')) {
    patch({ address: viaRoute.replace(/^::ffff:/, ''), addressSource: 'route' });
  } else {
    patch({ address: await Network.getIpAddressAsync().catch(() => null), addressSource: 'device' });
  }
}

export async function startRelay() {
  if (server) return;
  const port = getSettings().relayPort;
  let TcpSocket: any;
  try {
    // Lazy require: the native module is absent in Expo Go, and importing it at the top would crash there.
    // The package sets module.exports after `export default`, so require() returns the object itself.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-tcp-socket');
    TcpSocket = mod.default ?? mod;
    server = TcpSocket.createServer(handleConnection);
  } catch (e) {
    server = null;
    console.warn('[relay] could not start', e);
    patch({ running: false, error: `Relay could not start on this build (${e instanceof Error ? e.message : String(e)}).` });
    return;
  }
  server.on('error', (e: Error) => {
    console.warn('[relay] server error', e);
    patch({ running: false, error: e.message });
    server = null;
  });
  server.listen({ port, host: '0.0.0.0', reuseAddress: true }, async () => {
    patch({ running: true, port, error: null });
    await refreshAddress(TcpSocket);
    console.log(`[relay] listening on 0.0.0.0:${port}, reachable at ${relayStore.get().address} (${relayStore.get().addressSource})`);
  });
  addressTimer = setInterval(() => void refreshAddress(TcpSocket), 30_000); // Wi-Fi/hotspot can change
  scheduleForward();
  netUnsub = onNetworkChange(() => { relayFailures = 0; void forwardOnce(); void refreshAddress(TcpSocket); });
  void activateKeepAwakeAsync('relay'); // a sleeping phone stops relaying
}

export function stopRelay() {
  server?.close();
  server = null;
  if (loop) clearTimeout(loop);
  loop = null;
  netUnsub?.();
  netUnsub = null;
  if (addressTimer) clearInterval(addressTimer);
  addressTimer = null;
  deactivateKeepAwake('relay');
  patch({ running: false, address: null, addressSource: null });
}

/** Demo reset. */
export function clearRelayQueue() {
  db.runSync('DELETE FROM relay_queue');
  db.runSync('DELETE FROM relay_checkins');
  refresh();
}

// ---- helpers for the nearby mesh -------------------------------------------------

/** Messages received from others that have not reached a gateway yet. */
export function pendingRelayMessages(): SosMessage[] {
  return db.getAllSync<{ payload: string }>("SELECT payload FROM relay_queue WHERE state = 'PENDING' ORDER BY received_at")
    .map((r) => JSON.parse(r.payload));
}

/** Forwarded messages whose responder status may still change. */
export function relayAwaitingStatus(): { message_id: string; status: string | null }[] {
  return db.getAllSync<{ message_id: string; next_status: string | null }>(
    "SELECT message_id, next_status FROM relay_queue WHERE state = 'FORWARDED' AND (next_status IS NULL OR next_status NOT IN ('ACKNOWLEDGED','RESOLVED'))",
  ).map((r) => ({ message_id: r.message_id, status: r.next_status }));
}

export function relayStatuses(): { message_id: string; status: string | null }[] {
  return db.getAllSync<{ message_id: string; next_status: string | null }>('SELECT message_id, next_status FROM relay_queue')
    .map((r) => ({ message_id: r.message_id, status: r.next_status }));
}

export function setRelayStatus(messageId: string, status: string) {
  const r = db.runSync('UPDATE relay_queue SET next_status = ? WHERE message_id = ?', status, messageId);
  if (r.changes) refresh();
}

/** Mark a message as handed to another phone over the mesh (it stays PENDING so whichever phone gets online first delivers it). */
export function noteMeshHandoff(messageId: string, to: string) {
  db.runSync("UPDATE relay_queue SET last_error = ? WHERE message_id = ? AND state = 'PENDING'", `also passed to ${to}`, messageId);
  refresh();
}
