#!/usr/bin/env node
// Stand-in for the real FastAPI gateway so the app can be built and tested
// before the gateway exists. Same endpoints as docs/CONTRACT.md, in memory only.
//
//   npm run mock-gateway                      # port 8000
//   PORT=8001 AUTO_ACK_SECONDS=10 npm run mock-gateway
//   curl -X POST localhost:8000/gateway/ack/<message_id> -d '{"acknowledged_by":"Meera"}'

import http from 'node:http';
import os from 'node:os';

const PORT = Number(process.env.PORT ?? 8000);
const AUTO_ACK_SECONDS = Number(process.env.AUTO_ACK_SECONDS ?? 0);

const messages = new Map(); // message_id -> SOS message
const checkins = new Map(); // device_id -> last check-in

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function acknowledge(id, by) {
  const m = messages.get(id);
  if (!m || m.status === 'ACKNOWLEDGED') return m;
  Object.assign(m, { status: 'ACKNOWLEDGED', acknowledged_by: by, acknowledged_at: new Date().toISOString() });
  console.log(`ACK  ${id} by ${by}`);
  return m;
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  const route = `${req.method} ${pathname}`;
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
      return res.end();
    }
    if (route === 'GET /health') return send(res, 200, { status: 'ok', role: 'mock-gateway' });

    if (route === 'POST /gateway/sos') {
      const m = await readJson(req);
      if (!m.message_id) return send(res, 422, { detail: 'message_id is required' });
      if (messages.has(m.message_id)) {
        console.log(`DUP  ${m.message_id} (retry ignored)`);
        return send(res, 200, { message_id: m.message_id, status: messages.get(m.message_id).status, duplicate: true });
      }
      const stored = {
        ...m,
        hop_count: (m.hop_count ?? 0) + 1,
        hops: [...(m.hops ?? []), 'GATEWAY'],
        status: 'DELIVERED',
        received_at: new Date().toISOString(),
      };
      messages.set(m.message_id, stored);
      console.log(`SOS  ${m.message_id} ${m.category}/${m.priority} from ${m.device_id} (${m.worker_name}) at ${m.latitude},${m.longitude}`);
      if (AUTO_ACK_SECONDS > 0) setTimeout(() => acknowledge(m.message_id, 'Auto-ack (mock)'), AUTO_ACK_SECONDS * 1000);
      return send(res, 201, { message_id: m.message_id, status: 'DELIVERED', duplicate: false });
    }

    if (route === 'GET /gateway/messages') return send(res, 200, [...messages.values()]);

    let match = pathname.match(/^\/gateway\/ack\/(.+)$/);
    if (req.method === 'POST' && match) {
      const body = await readJson(req).catch(() => ({}));
      const m = acknowledge(decodeURIComponent(match[1]), body.acknowledged_by ?? 'Safety Officer');
      return m ? send(res, 200, m) : send(res, 404, { detail: 'Unknown message_id' });
    }

    match = pathname.match(/^\/gateway\/ack-status\/(.+)$/);
    if (req.method === 'GET' && match) {
      const m = messages.get(decodeURIComponent(match[1]));
      if (!m) return send(res, 404, { detail: 'Unknown message_id' });
      return send(res, 200, {
        message_id: m.message_id,
        status: m.status,
        acknowledged_by: m.acknowledged_by ?? null,
        acknowledged_at: m.acknowledged_at ?? null,
      });
    }

    if (route === 'POST /gateway/checkin') {
      const c = await readJson(req);
      checkins.set(c.device_id, c);
      console.log(`OK   check-in from ${c.device_id} (${c.worker_name}), next due in ${c.interval_minutes} min`);
      return send(res, 200, { status: 'ok' });
    }
    if (route === 'GET /gateway/checkins') return send(res, 200, [...checkins.values()]);

    send(res, 404, { detail: `No route ${route}` });
  } catch (e) {
    send(res, 400, { detail: String(e.message ?? e) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  console.log(`Mock gateway on port ${PORT}${AUTO_ACK_SECONDS ? `, auto-ack after ${AUTO_ACK_SECONDS}s` : ''}`);
  console.log(`Put one of these in the app's Settings:\n  ${ips.join('\n  ') || `http://localhost:${PORT}`}`);
});
