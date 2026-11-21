# SignalMesh API contract (v1, with approved v2 below)

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
| `location_accuracy_m` | *v1.1, optional.* Horizontal accuracy (m) reported by the phone, 0–100 000. |
| `location_recorded_at` | *v1.1, optional.* ISO-8601 time the phone captured the fix (not the send time). Preserved unchanged by every hop. |
| `location_source` | *v1.1, optional.* `DEVICE` (fresh fix at SOS time) \| `DEVICE_LAST_KNOWN` (no fresh fix; the phone's cached position). Anything else is rejected (422). |
| `location_is_last_known` | *v1.1, optional.* `true` when the coordinates are the cached position. |
| `user_id` | *v1.1, optional.* TrackMate account id when the sender is signed in; the backend links it only if the account exists. |

v1.1 fields are additive: older senders omit them and stay valid. Location metadata sent **without** coordinates is rejected (422). Mock (developer-option) locations are never sent. The backend computes `location_freshness`: `CURRENT` when not last-known and captured ≤ 120 s before `created_at`, `LAST_KNOWN` otherwise, `NONE` without coordinates.

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
phones and relay phones from the app's Settings screen (Next hop URL), the
gateway's optional upstream from `SIGNALMESH_UPSTREAM_URL`, the dashboard from
its own env file. See each component's README.

---

## v2 (approved, not implemented yet — see DECISIONS.md D2)

v2 is **additive**: same routes, new fields. v1 clients keep working because
`status` stays in every response, derived from the new fields.

### Two separate states

| Field | Values | Meaning | Set by |
|---|---|---|---|
| `delivery_state` | `QUEUED` | Saved on the originating phone | Phone |
| | `RELAYED` | Stored by an intermediate relay | Relay |
| | `TRANSMITTED` | Accepted by a transport/provider (e.g. SMS, satellite) but not yet confirmed stored by a gateway | Transport adapter |
| | `DELIVERED` | Durably stored by a SignalMesh gateway | Gateway |
| `incident_state` | `OPEN` | Delivered, no responder yet | Gateway (on first store) |
| | `ACKNOWLEDGED` | A named responder accepted it | Responder |
| | `DISPATCHED` | A response team was assigned, with evidence (who, team, when) | Responder |
| | `RESOLVED` | An authorized responder closed it | Responder |

`incident_state` exists only once a gateway has the message. Delivery never
moves backwards; incident never skips evidence (`DISPATCHED` needs `dispatched_by`
and `team`).

### Derived v1 `status`

| incident_state | delivery_state | v1 `status` |
|---|---|---|
| `RESOLVED` | any | `RESOLVED` |
| `ACKNOWLEDGED` or `DISPATCHED` | any | `ACKNOWLEDGED` |
| `OPEN` / none | `DELIVERED` | `DELIVERED` |
| none | `RELAYED` or `TRANSMITTED` | `RELAYED` |

### Changes per endpoint

- `POST /gateway/sos` response adds `delivery_state`, `incident_state`.
- `GET /gateway/ack-status/{id}` adds `delivery_state`, `incident_state`,
  `dispatched_by`, `dispatched_at`, `team`.
- `GET /gateway/messages` gains filters `delivery_state=` and `incident_state=`
  (v1 `status=` still accepted).
- **New:** `POST /gateway/dispatch/{id}` body
  `{ "dispatched_by": "Meera Iyer", "team": "Rescue team B", "note": "ETA 20 min" }`.
  Allowed from `OPEN` (implies acknowledgement) or `ACKNOWLEDGED`. Records a
  `DISPATCHED` event.
- Events list gains `DISPATCHED` and `TRANSMITTED` kinds.

### Review notes (2026-11-21) — must be resolved by the implementation

Checked against the current code (`gateway/`, `apps/mobile/src/lib/`) and D1.

| # | Finding | Resolution in v2 |
|---|---|---|
| R1 | **Phone stops polling at `ACKNOWLEDGED`** (`awaitingAckItems()` excludes it), so it could never show `DISPATCHED` / `RESOLVED`. | App keeps polling until `RESOLVED`, with backoff after `ACKNOWLEDGED` (e.g. 3 s → 15 s → 60 s). Same for relay cached state. |
| R2 | **Incident authority with two servers (D1).** Responders could act on the edge gateway (offline site) and on the backend (online). | Incident state is **monotonic** (`OPEN < ACKNOWLEDGED < DISPATCHED < RESOLVED`); each server merges by taking the furthest state and the union of events. Every event gets a stable `event_id` (UUID) so merges are idempotent. Gateway sends events upstream with its existing retry queue; backend sends responder events down when the link is up. Until the backend exists, the gateway is the only authority. |
| R3 | Same SOS can reach two gateways, or a gateway and the backend directly. | Backend dedupes by `message_id` (as the gateway does) and records each receipt as an event. |
| R4 | Relay's own fallback answer (gateway unreachable) has no v2 fields. When the gateway is reachable the relay already proxies its JSON verbatim, so v2 fields pass through before the relay is updated. | Relay fallback adds `delivery_state: "RELAYED"`, `incident_state: null`. |
| R5 | **Gateway has no schema migrations**; v2 adds columns. | Add a schema version (`PRAGMA user_version`) with ordered `ALTER TABLE` steps and a backfill: `DELIVERED → OPEN`, `ACKNOWLEDGED → ACKNOWLEDGED`, `RESOLVED → RESOLVED`; `delivery_state = DELIVERED` for all stored rows. Test on a copy of a v1 database. |
| R6 | Dispatch from `OPEN` skips an explicit acknowledgement. | Dispatch sets `acknowledged_by/at` if empty (same rule `resolve` already uses). |
| R7 | v1 `status=` filter vs derived status. | `status=ACKNOWLEDGED` also matches `DISPATCHED` rows, so v1 dashboards keep working. |
| R8 | `TRANSMITTED` maps to v1 `RELAYED`, whose old app copy says "passed to a nearby device". No current transport produces `TRANSMITTED`. | Acceptable: only future SMS/satellite adapters emit it, and those ship with a v2-aware app that uses DESIGN_SYSTEM.md § 7 copy. |
| R9 | Dashboard ordering. | Because the gateway keeps v1 fields, the dashboard can move to v2 any time after step 1. |

### Migration order (revised)

1. **Gateway:** schema version + migration (R5), store/return both fields, derived `status`, `dispatch` route (R6), v1 filter compatibility (R7), `event_id` on events. Tests: derivation table, migration of a v1 DB, all 21 existing tests still pass.
2. **Relay (in app):** fallback v2 fields (R4); keep proxying. Physical relay test repeated.
3. **App:** read v2 fields with `status` fallback; poll until `RESOLVED` (R1); new status copy.
4. **Dashboard:** switch to v2 fields and add dispatch (any time after step 1, R9).
5. **Backend (D1):** accepts upstream SOS with v2 fields, dedupes (R3); incident sync both ways (R2) designed and tested before responders act on the backend.
