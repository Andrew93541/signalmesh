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
from .models import AckIn, CheckinIn, NodeHeartbeatIn, ResolveIn, SosIn
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


def post_json(url: str, payload: dict, timeout: float = 4.0) -> int:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.status


async def forward_upstream_once(store: Store, settings: Settings, post: Callable = post_json) -> int:
    """Send pending messages to the upstream server. Returns how many were accepted."""
    sent = 0
    for msg in store.pending_upstream():
        payload = {k: msg[k] for k in (
            "message_id", "device_id", "worker_name", "category", "priority", "description",
            "latitude", "longitude", "created_at", "hops")}
        payload["hop_count"] = msg["hop_count"] + 1  # this gateway acts as one more hop
        payload["status"] = "RELAYED"
        try:
            await asyncio.to_thread(post, f"{settings.upstream_url}/gateway/sos", payload)
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            store.mark_upstream(msg["message_id"], ok=False, error=str(e))
            log.warning("upstream unreachable, %s stays queued: %s", msg["message_id"], e)
            break  # upstream is down; keep order and retry later
        store.mark_upstream(msg["message_id"], ok=True)
        sent += 1
        log.info("forwarded %s upstream", msg["message_id"])
    return sent


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
            except Exception:
                log.exception("upstream loop error")
            await asyncio.sleep(settings.upstream_retry_seconds)

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
        return {k: msg[k] for k in ("message_id", "status", "acknowledged_by", "acknowledged_at")}

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
