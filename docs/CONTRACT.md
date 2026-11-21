# SignalMesh API contract (v1)

One contract for the phone app, relay nodes, the gateway and the dashboard.
Every hop (relay or gateway) exposes the **same** SOS endpoints, so a sender
only needs one "next hop" URL and never cares whether it talks to a relay or
the gateway.

> **Honesty note.** In the prototype, hops travel as HTTP over one local
> Wi-Fi network (application-level relay). This shows store-and-forward,
> dedupe and multi-hop routing, but it is **not** infrastructure-free mesh
> radio (Bluetooth / Wi-Fi Direct / LoRa). It still needs the router.

## Status lifecycle

| Status | Meaning | Who sets it |
|---|---|---|
| `QUEUED` *(phone only)* | Saved on the sender's phone, no hop has accepted it yet | Phone |
| `CREATED` | Message object exists (value inside the payload when first sent) | Phone |
| `RELAYED` | A relay node accepted and stored it; not yet at the gateway | Relay |
| `DELIVERED` | The gateway stored it. Responders can now see it | Gateway |
| `ACKNOWLEDGED` | A named responder accepted the request | Dashboard → gateway |
| `RESOLVED` | Responder closed the emergency | Dashboard → gateway |

The phone only shows "A responder has acknowledged your request" for
`ACKNOWLEDGED` / `RESOLVED`. `DELIVERED` is shown as "Your message reached
the gateway", never as "help is coming".

## SOS message

```json
{
  "message_id": "SM-3f1c9a7e-5b2d-4c11-9e0a-2b7d8c6f4a10",
  "device_id": "MOBILE_01",
  "worker_name": "Ravi",
  "category": "MEDICAL",
  "priority": "HIGH",
  "description": "Fell from ladder, can't move leg",
  "latitude": 19.0760,
  "longitude": 72.8777,
  "created_at": "2026-11-21T10:41:08.120Z",
  "hop_count": 1,
  "hops": ["MOBILE_01", "RELAY_02"],
  "status": "CREATED"
}
```

| Field | Rules |
|---|---|
| `message_id` | `SM-` + 6–64 chars `[A-Za-z0-9-]`. Created **once** on the phone, reused on every retry. Dedupe key. |
| `device_id`, `worker_name` | 1–64 / 1–80 chars |
| `category` | `MEDICAL` \| `RESCUE` \| `GENERAL` |
| `priority` | `HIGH` \| `MEDIUM` \| `LOW` |
| `description` | optional, ≤ 500 chars, may be `null` |
| `latitude`, `longitude` | numbers in range, **or both `null`** when there is no GPS fix. Never invented. |
| `created_at` | ISO-8601 from the phone. Preserved unchanged by every hop. |
| `hops` | node IDs in order, sender first. Each relay **appends itself** before forwarding. Max 16. |
| `hop_count` | number of relays the message passed through (= `len(hops) - 1` when it leaves a relay) |
| `status` | informational on input; each hop sets its own status |

## Endpoints on every hop (relay and gateway)

### `GET /health`
```json
{ "status": "ok", "node_id": "GATEWAY_01", "role": "gateway", "time": "2026-11-21T10:41:09Z" }
```

### `POST /gateway/sos`
Body: SOS message. Responses:
- `201` new: `{ "message_id": "...", "status": "DELIVERED", "duplicate": false, "node_id": "GATEWAY_01" }`
  (a relay answers `"status": "RELAYED"`)
- `200` duplicate (same `message_id` already stored): `{ ..., "duplicate": true, "status": "<current status>" }`
- `422` validation error: `{ "detail": [...] }`

### `GET /gateway/ack-status/{message_id}`
```json
{ "message_id": "SM-…", "status": "ACKNOWLEDGED", "acknowledged_by": "Meera Iyer", "acknowledged_at": "2026-11-21T10:42:30Z" }
```
`404` if this hop has never seen the message. A relay answers from the
gateway when it can reach it, otherwise from its own copy.

### `POST /gateway/checkin`
Dead-man timer heartbeat from a phone. Body:
```json
{ "device_id": "MOBILE_01", "worker_name": "Ravi", "latitude": null, "longitude": null,
  "checked_in_at": "2026-11-21T10:30:00Z", "interval_minutes": 15 }
```
Response `200`: `{ "status": "ok", "due_at": "2026-11-21T10:45:00Z" }`.
The **gateway** marks the worker overdue when `now > checked_in_at + interval_minutes`.

## Gateway-only endpoints (dashboard)

| Method & path | Purpose |
|---|---|
| `GET /gateway/status` | Gateway health, counts, relay nodes online, overdue check-ins, upstream queue |
| `GET /gateway/messages?status=&category=&priority=&limit=` | SOS list, newest first |
| `GET /gateway/messages/{id}` | One SOS with its event history (receipts, duplicates, acks) |
| `POST /gateway/ack/{id}` | Body `{ "acknowledged_by": "Meera Iyer" }`. Idempotent. |
| `POST /gateway/resolve/{id}` | Body `{ "resolved_by": "Meera Iyer", "note": "Taken to first aid" }` |
| `GET /gateway/checkins` | Latest check-in per device with `due_at` and `overdue` |
| `POST /gateway/nodes/heartbeat` | Relay nodes report `{ "node_id", "role", "label", "queue_size" }` every ~10 s |
| `GET /gateway/nodes` | Known nodes with `last_seen` and `online` |
| `WS /ws` | Live events: `sos.created`, `sos.duplicate`, `sos.updated`, `checkin`, `checkin.overdue`, `node.heartbeat` |

`GET /gateway/status` example:
```json
{
  "node_id": "GATEWAY_01", "role": "gateway", "uptime_seconds": 812, "database": "ok",
  "messages": { "total": 4, "open": 3, "critical_open": 2, "awaiting_ack": 1, "acknowledged": 2, "resolved": 1 },
  "nodes": { "online": 1, "known": 2 },
  "checkins": { "devices": 2, "overdue": 1 },
  "upstream": { "enabled": false, "url": null, "reachable": null, "pending": 0 }
}
```

`GET /gateway/messages/{id}` adds:
```json
"events": [
  { "kind": "RECEIVED", "actor": "RELAY_02", "detail": { "hops": ["MOBILE_01","RELAY_02"] }, "at": "…" },
  { "kind": "DUPLICATE", "actor": "MOBILE_01", "detail": { "hops": ["MOBILE_01"] }, "at": "…" },
  { "kind": "ACKNOWLEDGED", "actor": "Meera Iyer", "detail": null, "at": "…" }
]
```

## Configuration

No IP address is hard-coded. Each component reads its peer's URL from config:
the phone from its Settings screen, relays from `SIGNALMESH_NEXT_HOP_URL`, the
dashboard from its own env file. See each component's README.
