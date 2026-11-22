"""SignalMesh site gateway: receives SOS messages from relays and phones,
stores them in SQLite, and serves the responder dashboard.

Run:  uvicorn signalmesh_gateway.app:app --host 0.0.0.0 --port 8000
"""

import asyncio
import json
import logging
import time
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, load_settings
from .models import AckIn, CheckinIn, NodeHeartbeatIn, PeerAckIn, ResolveIn, SosIn
from .store import Store, iso, utcnow

log = logging.getLogger("signalmesh.gateway")

STATUSES = {"RELAYED", "DELIVERED", "ACKNOWLEDGED", "RESOLVED"}


class Hub:
    """Pushes live events to connected dashboards over WebSocket."""

    def __init__(self):
        self.clients: set[WebSocket] = set()

    async def publish(self, kind: str, data):
        text = json.dumps({"type": kind, "data": data, "at": iso(utcnow())})
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            except Exception:
                self.clients.discard(ws)


def _request(method: str, url: str, token: str | None, payload: dict | None = None, timeout: float = 4.0):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        body = res.read()
        return res.status, (json.loads(body) if body else None)


def post_json(url: str, payload: dict, token: str | None = None, timeout: float = 4.0):
    return _request("POST", url, token, payload, timeout)


def get_json(url: str, token: str | None = None, timeout: float = 4.0):
    return _request("GET", url, token, None, timeout)


# Upstream answers that will never succeed by retrying the same payload.
_PERMANENT = {400, 404, 409, 413, 422}


async def forward_upstream_once(store: Store, settings: Settings, post: Callable = post_json) -> int:
    """Send pending messages to the upstream server. Returns how many were accepted."""
    sent = 0
    for msg in store.pending_upstream():
        payload = {k: msg[k] for k in (
            "message_id", "device_id", "worker_name", "category", "priority", "description",
            "latitude", "longitude", "created_at", "hops",
            "location_accuracy_m", "location_recorded_at", "location_source", "location_is_last_known", "user_id")}
        payload["hop_count"] = msg["hop_count"] + 1  # this gateway acts as one more hop
        payload["status"] = "RELAYED"
        try:
            await asyncio.to_thread(post, f"{settings.upstream_url}/gateway/sos", payload, settings.upstream_token)
        except urllib.error.HTTPError as e:
            if e.code in _PERMANENT:
                # A message the backend refuses must not block everything behind it.
                store.mark_upstream_rejected(msg["message_id"], f"HTTP {e.code}")
                log.error("upstream rejected %s (HTTP %s); set aside, queue continues", msg["message_id"], e.code)
                continue
            store.mark_upstream(msg["message_id"], ok=False, error=f"HTTP {e.code}")
            log.warning("upstream refused %s (HTTP %s), stays queued", msg["message_id"], e.code)
            break  # e.g. 401 bad token or 5xx: retry later, keep order
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            store.mark_upstream(msg["message_id"], ok=False, error=str(e))
            log.warning("upstream unreachable, %s stays queued: %s", msg["message_id"], e)
            break  # upstream is down; keep order and retry later
        store.mark_upstream(msg["message_id"], ok=True)
        sent += 1
        log.info("forwarded %s upstream", msg["message_id"])
    return sent


async def forward_peer_acks_once(store: Store, settings: Settings, post: Callable = post_json) -> int:
    """Send nearby acknowledgements upstream. 404 = backend does not have the SOS yet: retry later."""
    sent = 0
    for a in store.pending_peer_acks():
        payload = {k: a[k] for k in ("message_id", "recipient_device_id", "recipient_name", "recipient_user_id", "acknowledged_at")}
        try:
            await asyncio.to_thread(post, f"{settings.upstream_url}/gateway/peer-ack", payload, settings.upstream_token)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                store.mark_peer_ack(a["message_id"], a["recipient_device_id"], "PENDING", "SOS not upstream yet")
                continue
            if e.code in _PERMANENT:
                store.mark_peer_ack(a["message_id"], a["recipient_device_id"], "REJECTED", f"HTTP {e.code}")
                continue
            break
        except (urllib.error.URLError, OSError, TimeoutError):
            break
        store.mark_peer_ack(a["message_id"], a["recipient_device_id"], "SENT")
        sent += 1
    return sent


async def sync_once(store: Store, settings: Settings, state: dict, publish: Callable,
                    get: Callable = get_json, post: Callable = post_json) -> int:
    """Pull responder actions from the backend and push this gateway's status.

    Responder actions are applied with the existing ack/resolve logic, so phones
    see them through the unchanged GET /gateway/ack-status. DISPATCHED is shown
    to v1 clients as ACKNOWLEDGED (CONTRACT.md § v2 derivation table).
    Returns the number of incidents updated locally.
    """
    base, token = settings.upstream_url, settings.upstream_token
    _, body = await asyncio.to_thread(get, f"{base}/v1/gateway-sync/updates?since={state.get('cursor', 0)}", token)
    changed = 0
    for u in body.get("updates", []):
        mid, inc = u["message_id"], u["incident_state"]
        if inc in ("ACKNOWLEDGED", "DISPATCHED") and u.get("acknowledged_by"):
            msg, did = store.acknowledge(mid, u["acknowledged_by"])
        elif inc == "RESOLVED" and u.get("resolved_by"):
            msg, did = store.resolve(mid, u["resolved_by"], u.get("resolution_note"))
        else:
            continue
        if did and msg:
            changed += 1
            log.info("responder update from backend: %s -> %s", mid, msg["status"])
            await publish("sos.updated", msg)
    state["cursor"] = body.get("cursor", state.get("cursor", 0))

    counts = store.counts()
    await asyncio.to_thread(post, f"{base}/v1/gateway-sync/status", {
        "node_id": settings.node_id,
        "database": "ok" if store.ping() else "error",
        "messages": {k: counts[k] for k in ("total", "open", "awaiting_ack", "acknowledged", "resolved")},
        "upstream_pending": counts["upstream_pending"],
        "nodes": [
            {k: n[k] for k in ("node_id", "role", "label", "queue_size", "address", "last_seen", "online")}
            for n in store.nodes(settings.node_online_seconds)
        ],
        "checkins": [
            {k: c[k] for k in ("device_id", "worker_name", "checked_in_at", "due_at", "overdue")}
            for c in store.latest_checkins()
        ],
    }, token)
    return changed


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    store = Store(settings.db_path)
    hub = Hub()
    started = time.monotonic()
    state = {"upstream_reachable": None}

    async def upstream_loop():
        while True:
            try:
                if store.pending_upstream(limit=1):
                    await forward_upstream_once(store, settings)
                    state["upstream_reachable"] = not store.pending_upstream(limit=1)
                if settings.upstream_url and store.pending_peer_acks(limit=1):
                    await forward_peer_acks_once(store, settings)
            except Exception:
                log.exception("upstream loop error")
            await asyncio.sleep(settings.upstream_retry_seconds)

    sync_state: dict = {"cursor": 0, "ok": None, "error": None}

    async def sync_loop():
        while True:
            try:
                await sync_once(store, settings, sync_state, hub.publish)
                sync_state.update(ok=True, error=None)
            except Exception as e:
                if sync_state.get("ok") is not False:
                    log.warning("backend sync failed: %s", e)
                sync_state.update(ok=False, error=str(e))
            await asyncio.sleep(settings.sync_seconds)

    async def overdue_loop():
        alerted: set[tuple[str, str]] = set()  # (device_id, due_at) already announced
        while True:
            try:
                for c in store.latest_checkins():
                    key = (c["device_id"], c["due_at"])
                    if c["overdue"] and key not in alerted:
                        alerted.add(key)
                        log.warning("CHECK-IN OVERDUE: %s (%s), was due %s", c["device_id"], c["worker_name"], c["due_at"])
                        await hub.publish("checkin.overdue", c)
            except Exception:
                log.exception("overdue loop error")
            await asyncio.sleep(settings.overdue_check_seconds)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        log.info("gateway %s starting, db=%s, upstream=%s", settings.node_id, settings.db_path, settings.upstream_url or "none")
        tasks = [asyncio.create_task(overdue_loop())]
        if settings.upstream_url:
            tasks.append(asyncio.create_task(upstream_loop()))
            tasks.append(asyncio.create_task(sync_loop()))
        yield
        for t in tasks:
            t.cancel()
        store.close()

    app = FastAPI(title="SignalMesh Gateway", version="1.0.0", lifespan=lifespan)
    app.state.store = store
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])

    def not_found(message_id: str):
        raise HTTPException(404, f"Unknown message_id {message_id}")

    @app.get("/health")
    async def health():
        return {"status": "ok" if store.ping() else "degraded", "node_id": settings.node_id,
                "role": "gateway", "time": iso(utcnow())}

    @app.get("/gateway/status")
    async def gateway_status():
        counts = store.counts()
        nodes = store.nodes(settings.node_online_seconds)
        checkins = store.latest_checkins()
        return {
            "node_id": settings.node_id,
            "role": "gateway",
            "uptime_seconds": int(time.monotonic() - started),
            "database": "ok" if store.ping() else "error",
            "messages": {k: counts[k] for k in ("total", "open", "critical_open", "awaiting_ack", "acknowledged", "resolved")},
            "nodes": {"online": sum(n["online"] for n in nodes), "known": len(nodes)},
            "checkins": {"devices": len(checkins), "overdue": sum(c["overdue"] for c in checkins)},
            "upstream": {
                "enabled": bool(settings.upstream_url),
                "url": settings.upstream_url,
                "reachable": state["upstream_reachable"],
                "pending": counts["upstream_pending"],
                "rejected": counts["upstream_rejected"],
                "sync_ok": sync_state["ok"],
            },
            "time": iso(utcnow()),
        }

    @app.post("/gateway/sos", status_code=201)
    async def receive_sos(sos: SosIn, response: Response):
        record, duplicate = store.save_sos(sos, settings.node_id, "DELIVERED", bool(settings.upstream_url))
        if duplicate:
            response.status_code = 200
            log.info("DUPLICATE %s via %s (ignored)", sos.message_id, sos.hops[-1] if sos.hops else sos.device_id)
            await hub.publish("sos.duplicate", {"message_id": sos.message_id, "hops": sos.hops})
        else:
            log.info("SOS %s %s/%s from %s path=%s gps=%s", sos.message_id, sos.category, sos.priority,
                     sos.device_id, "→".join(record["hops"]),
                     f"{sos.latitude},{sos.longitude}" if sos.latitude is not None else "none")
            await hub.publish("sos.created", record)
        return {"message_id": sos.message_id, "status": record["status"], "duplicate": duplicate,
                "node_id": settings.node_id}

    @app.get("/gateway/messages")
    async def list_messages(
        status: str | None = Query(None, description="Comma-separated, e.g. DELIVERED,ACKNOWLEDGED"),
        category: str | None = None,
        priority: str | None = None,
        limit: int = Query(200, ge=1, le=1000),
    ):
        statuses = [s.strip().upper() for s in status.split(",")] if status else None
        if statuses and not set(statuses) <= STATUSES:
            raise HTTPException(422, f"status must be among {sorted(STATUSES)}")
        return store.list_messages(statuses, category and category.upper(), priority and priority.upper(), limit)

    @app.get("/gateway/messages/{message_id}")
    async def get_message(message_id: str):
        return store.get_message(message_id, with_events=True) or not_found(message_id)

    @app.get("/gateway/ack-status/{message_id}")
    async def ack_status(message_id: str):
        msg = store.get_message(message_id) or not_found(message_id)
        # seen_by (additive): nearby TrackMate users who acknowledged it on their phone. Not a responder ack.
        return {**{k: msg[k] for k in ("message_id", "status", "acknowledged_by", "acknowledged_at")}, "seen_by": store.seen_by(message_id)}

    @app.post("/gateway/peer-ack", status_code=201)
    async def peer_ack(body: PeerAckIn, response: Response):
        new = store.save_peer_ack(body, upstream=bool(settings.upstream_url))
        if not new:
            response.status_code = 200
        else:
            log.info("nearby acknowledgement for %s by %s", body.message_id, body.recipient_device_id)
            await hub.publish("sos.peer_ack", {"message_id": body.message_id, "device_id": body.recipient_device_id})
        return {"status": "recorded", "duplicate": not new, "node_id": settings.node_id}

    @app.post("/gateway/ack/{message_id}")
    async def acknowledge(message_id: str, body: AckIn):
        msg, changed = store.acknowledge(message_id, body.acknowledged_by)
        if not msg:
            not_found(message_id)
        if changed:
            log.info("ACK %s by %s", message_id, body.acknowledged_by)
            await hub.publish("sos.updated", msg)
        return msg

    @app.post("/gateway/resolve/{message_id}")
    async def resolve(message_id: str, body: ResolveIn):
        msg, changed = store.resolve(message_id, body.resolved_by, body.note)
        if not msg:
            not_found(message_id)
        if changed:
            log.info("RESOLVED %s by %s", message_id, body.resolved_by)
            await hub.publish("sos.updated", msg)
        return msg

    @app.post("/gateway/checkin")
    async def checkin(body: CheckinIn):
        due_at = store.save_checkin(body)
        log.info("check-in %s (%s), next due %s", body.device_id, body.worker_name, due_at)
        await hub.publish("checkin", {**body.model_dump(), "due_at": due_at})
        return {"status": "ok", "due_at": due_at}

    @app.get("/gateway/checkins")
    async def checkins():
        return store.latest_checkins()

    @app.post("/gateway/nodes/heartbeat")
    async def node_heartbeat(body: NodeHeartbeatIn, request: Request):
        store.heartbeat(body, request.client.host if request.client else None)
        await hub.publish("node.heartbeat", body.model_dump())
        return {"status": "ok"}

    @app.get("/gateway/nodes")
    async def nodes():
        return store.nodes(settings.node_online_seconds)

    @app.websocket("/ws")
    async def ws(websocket: WebSocket):
        await websocket.accept()
        hub.clients.add(websocket)
        try:
            while True:
                await websocket.receive_text()  # keep-alive; clients don't need to send anything
        except WebSocketDisconnect:
            pass
        finally:
            hub.clients.discard(websocket)

    return app
