"""SOS incidents from SignalMesh gateways, and the responder (dashboard) API.

Gateways authenticate with their own token (manage.py create-gateway); responders
are users with role 'responder' or 'admin'. Incident state is monotonic:
OPEN < ACKNOWLEDGED < DISPATCHED < RESOLVED (CONTRACT.md § v2, R2).
"""

import asyncio
import json
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from . import security
from .db import Database, now_iso

log = logging.getLogger("trackmate.incidents")

RANK = {"OPEN": 0, "ACKNOWLEDGED": 1, "DISPATCHED": 2, "RESOLVED": 3}
RESPONDER_ROLES = {"responder", "admin"}
Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class PeerAckIn(BaseModel):
    message_id: str = Field(pattern=r"^SM-[A-Za-z0-9-]{6,64}$")
    recipient_device_id: str = Field(min_length=1, max_length=64)
    recipient_name: str | None = Field(default=None, max_length=80)
    recipient_user_id: str | None = Field(default=None, max_length=64)
    acknowledged_at: str = Field(min_length=10, max_length=40)


class IncomingSos(BaseModel):
    """What a gateway forwards (same shape as the SignalMesh contract)."""
    model_config = ConfigDict(extra="ignore")
    message_id: str = Field(pattern=r"^SM-[A-Za-z0-9-]{6,64}$")
    device_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    worker_name: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    category: Literal["MEDICAL", "RESCUE", "GENERAL"]
    priority: Literal["HIGH", "MEDIUM", "LOW"]
    description: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    created_at: str
    hop_count: int = Field(default=0, ge=0, le=16)
    hops: list[Annotated[str, StringConstraints(min_length=1, max_length=64)]] = Field(default_factory=list, max_length=16)
    location_accuracy_m: float | None = Field(default=None, ge=0, le=100_000)
    location_recorded_at: str | None = None
    location_source: Literal["DEVICE", "DEVICE_LAST_KNOWN"] | None = None
    location_is_last_known: bool | None = None
    user_id: str | None = Field(default=None, max_length=64)

    @field_validator("created_at", "location_recorded_at")
    @classmethod
    def _iso(cls, v):
        if v is not None:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        return v


class GatewayStatusIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    node_id: str


class DispatchIn(BaseModel):
    team: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    note: Text | None = None


class ResolveIn(BaseModel):
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class Hub:
    """Live updates for dashboards."""

    def __init__(self):
        self.clients: set[WebSocket] = set()

    async def publish(self, kind: str, data):
        text = json.dumps({"type": kind, "data": data, "at": now_iso()})
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            except Exception:
                self.clients.discard(ws)


# A fix captured more than this long before the SOS was created is not "current".
CURRENT_FIX_MAX_AGE_S = 120


def _parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def location_freshness(d: dict) -> str:
    """NONE | LAST_KNOWN | CURRENT (current = fresh fix taken when the SOS was created)."""
    if d.get("latitude") is None or d.get("longitude") is None:
        return "NONE"
    if d.get("location_is_last_known"):
        return "LAST_KNOWN"
    rec = d.get("location_recorded_at")
    if not rec:
        return "LAST_KNOWN"  # older app versions sent no capture time: cannot claim it was current
    if (_parse(d["created_at"]) - _parse(rec)).total_seconds() > CURRENT_FIX_MAX_AGE_S:
        return "LAST_KNOWN"
    return "CURRENT"


def _incident(row) -> dict:
    d = dict(row)
    d["hops"] = json.loads(d["hops"])
    if d.get("location_is_last_known") is not None:
        d["location_is_last_known"] = bool(d["location_is_last_known"])
    d["location_freshness"] = location_freshness(d)
    return d


def register(app: FastAPI, db: Database, settings, current_user) -> Hub:
    hub = Hub()
    tickets: dict[str, tuple[str, float]] = {}  # one-time WebSocket tickets: ticket -> (user_id, expires)

    # ---- auth helpers ----------------------------------------------------------

    def current_gateway(request: Request) -> str:
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            raise HTTPException(401, "Gateway credential required.")
        row = db.one("SELECT id FROM gateways WHERE token_hash = ?", security.token_hash(auth[7:].strip()))
        if not row:
            log.warning("rejected gateway credential from %s", request.client.host if request.client else "?")
            raise HTTPException(401, "Unknown gateway credential.")
        db.run("UPDATE gateways SET last_seen = ? WHERE id = ?", now_iso(), row["id"])
        return row["id"]

    def responder(auth=Depends(current_user)) -> dict:
        user = db.one("SELECT id, full_name, role FROM users WHERE id = ?", auth[0])
        if not user or user["role"] not in RESPONDER_ROLES:
            raise HTTPException(403, "Responder access required.")
        return dict(user)

    def audit(user: dict | None, action: str, target: str | None, detail=None, request: Request | None = None):
        db.run(
            "INSERT INTO audit_log (actor_id, actor_name, action, target, detail, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            user["id"] if user else None, user["full_name"] if user else None, action, target,
            json.dumps(detail) if detail is not None else None,
            request.client.host if request and request.client else None, now_iso(),
        )

    def event(message_id: str, kind: str, actor: str | None, detail=None):
        db.run("INSERT INTO incident_events (message_id, kind, actor, detail, at) VALUES (?, ?, ?, ?, ?)",
               message_id, kind, actor, json.dumps(detail) if detail is not None else None, now_iso())

    def get_incident(message_id: str, with_events=False) -> dict:
        row = db.one("SELECT * FROM incidents WHERE message_id = ?", message_id)
        if not row:
            raise HTTPException(404, "Incident not found.")
        inc = _incident(row)
        if with_events:
            inc["events"] = [
                {**dict(e), "detail": json.loads(e["detail"]) if e["detail"] else None}
                for e in db.all("SELECT id, kind, actor, detail, at FROM incident_events WHERE message_id = ? ORDER BY id", message_id)
            ]
        return inc

    # ---- gateway-facing ----------------------------------------------------------

    @app.post("/gateway/sos", status_code=201)
    async def receive_from_gateway(sos: IncomingSos, response: Response, gateway_id: str = Depends(current_gateway)):
        with db.lock:
            existing = db.one("SELECT incident_state FROM incidents WHERE message_id = ?", sos.message_id)
            if existing:
                event(sos.message_id, "DUPLICATE", gateway_id, {"hops": sos.hops})
                response.status_code = 200
                return {"message_id": sos.message_id, "duplicate": True, "incident_state": existing["incident_state"], "node_id": settings.node_id}
            path = [*sos.hops, settings.node_id]
            if sos.latitude is None and (sos.location_accuracy_m is not None or sos.location_recorded_at is not None):
                raise HTTPException(422, "location metadata without coordinates")
            # Link to an account only if that account exists; never trust it for anything else.
            user_id = sos.user_id if sos.user_id and db.one("SELECT 1 FROM users WHERE id = ?", sos.user_id) else None
            db.run(
                """INSERT INTO incidents (message_id, gateway_id, device_id, worker_name, category, priority, description,
                   latitude, longitude, created_at, received_at, hops, hop_count, incident_state,
                   location_accuracy_m, location_recorded_at, location_source, location_is_last_known, user_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)""",
                sos.message_id, gateway_id, sos.device_id, sos.worker_name, sos.category, sos.priority, sos.description,
                sos.latitude, sos.longitude, sos.created_at, now_iso(), json.dumps(path), sos.hop_count,
                sos.location_accuracy_m, sos.location_recorded_at, sos.location_source,
                None if sos.location_is_last_known is None else int(sos.location_is_last_known), user_id,
            )
            event(sos.message_id, "RECEIVED", gateway_id, {"hops": sos.hops})
        inc = get_incident(sos.message_id)
        log.info("incident %s %s/%s via %s", sos.message_id, sos.category, sos.priority, " -> ".join(path))
        await hub.publish("incident.created", inc)
        return {"message_id": sos.message_id, "duplicate": False, "incident_state": "OPEN", "node_id": settings.node_id}

    @app.post("/gateway/peer-ack", status_code=201)
    async def receive_peer_ack(body: PeerAckIn, response: Response, gateway_id: str = Depends(current_gateway)):
        """A nearby TrackMate user acknowledged seeing this SOS on their phone.

        Recorded as an incident event only. It does NOT change incident_state: a responder
        acknowledgement (dashboard) and a nearby person's acknowledgement are different things.
        """
        with db.lock:
            if not db.one("SELECT 1 FROM incidents WHERE message_id = ?", body.message_id):
                raise HTTPException(404, "Incident not known yet")  # the gateway retries later
            for e in db.all("SELECT detail FROM incident_events WHERE message_id = ? AND kind = 'PEER_ACK'", body.message_id):
                if json.loads(e["detail"] or "{}").get("recipient_device_id") == body.recipient_device_id:
                    response.status_code = 200
                    return {"message_id": body.message_id, "duplicate": True}
            user_id = body.recipient_user_id if body.recipient_user_id and db.one("SELECT 1 FROM users WHERE id = ?", body.recipient_user_id) else None
            event(body.message_id, "PEER_ACK", body.recipient_name or body.recipient_device_id,
                  {"recipient_device_id": body.recipient_device_id, "recipient_user_id": user_id,
                   "acknowledged_at": body.acknowledged_at, "via": gateway_id})
        log.info("nearby acknowledgement for %s by device %s", body.message_id, body.recipient_device_id)
        await hub.publish("incident.updated", get_incident(body.message_id))
        return {"message_id": body.message_id, "duplicate": False}

    @app.get("/v1/gateway-sync/updates")
    def sync_updates(since: int = 0, gateway_id: str = Depends(current_gateway)):
        rows = db.all(
            """SELECT e.id, e.message_id FROM incident_events e JOIN incidents i ON i.message_id = e.message_id
               WHERE e.id > ? AND i.gateway_id = ? AND e.kind IN ('ACKNOWLEDGED', 'DISPATCHED', 'RESOLVED')
               ORDER BY e.id LIMIT 200""",
            since, gateway_id,
        )
        cursor = rows[-1]["id"] if rows else since
        updates, seen = [], set()
        for r in rows:
            if r["message_id"] in seen:
                continue
            seen.add(r["message_id"])
            i = get_incident(r["message_id"])
            updates.append({k: i[k] for k in ("message_id", "incident_state", "acknowledged_by", "acknowledged_at",
                                              "dispatched_by", "dispatch_team", "resolved_by", "resolved_at", "resolution_note")})
        return {"updates": updates, "cursor": cursor}

    @app.post("/v1/gateway-sync/status")
    async def gateway_status(body: GatewayStatusIn, gateway_id: str = Depends(current_gateway)):
        if body.node_id != gateway_id:
            raise HTTPException(403, "Status must come from the gateway it describes.")
        db.run("UPDATE gateways SET status_json = ?, last_seen = ? WHERE id = ?", body.model_dump_json(), now_iso(), gateway_id)
        await hub.publish("gateway.status", {"id": gateway_id})
        return {"status": "ok"}

    # ---- responder API (dashboard) -------------------------------------------------

    def gateways_view() -> list[dict]:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.gateway_online_seconds)
        out = []
        for g in db.all("SELECT id, created_at, last_seen, status_json FROM gateways ORDER BY id"):
            last = g["last_seen"]
            online = bool(last) and datetime.fromisoformat(last.replace("Z", "+00:00")) >= cutoff
            out.append({"id": g["id"], "created_at": g["created_at"], "last_seen": last, "online": online,
                        "status": json.loads(g["status_json"]) if g["status_json"] else None})
        return out

    @app.get("/v1/admin/summary")
    def summary(user=Depends(responder)):
        c = db.one(
            """SELECT COUNT(*) AS total,
               SUM(incident_state != 'RESOLVED') AS active,
               SUM(incident_state != 'RESOLVED' AND priority = 'HIGH') AS critical,
               SUM(incident_state = 'OPEN') AS awaiting_ack,
               SUM(incident_state = 'ACKNOWLEDGED') AS acknowledged,
               SUM(incident_state = 'DISPATCHED') AS dispatched,
               SUM(incident_state = 'RESOLVED') AS resolved
               FROM incidents"""
        )
        gws = gateways_view()
        nodes = [n for g in gws if g["online"] and g["status"] for n in g["status"].get("nodes", [])]
        return {
            "incidents": {k: (c[k] or 0) for k in c.keys()},
            "gateways": {"known": len(gws), "online": sum(g["online"] for g in gws)},
            "relays": {"known": len([n for n in nodes if n.get("role") == "relay"]),
                       "online": len([n for n in nodes if n.get("role") == "relay" and n.get("online")])},
            "upstream_pending": sum((g["status"] or {}).get("upstream_pending", 0) for g in gws if g["online"]),
            "time": now_iso(),
        }

    @app.get("/v1/admin/incidents")
    def list_incidents(
        user=Depends(responder),
        state: str | None = Query(None, description="Comma-separated incident states"),
        priority: str | None = None,
        category: str | None = None,
        since: str | None = Query(None, description="ISO time; incidents received after it"),
        has_location: bool | None = None,
        limit: int = Query(200, ge=1, le=1000),
    ):
        sql, args = "SELECT * FROM incidents WHERE 1=1", []
        if state:
            states = [s.strip().upper() for s in state.split(",")]
            if not set(states) <= set(RANK):
                raise HTTPException(422, f"state must be among {list(RANK)}")
            sql += f" AND incident_state IN ({','.join('?' * len(states))})"
            args += states
        for col, val in (("priority", priority), ("category", category)):
            if val:
                sql += f" AND {col} = ?"
                args.append(val.upper())
        if since:
            sql += " AND received_at >= ?"
            args.append(since)
        if has_location is True:
            sql += " AND latitude IS NOT NULL"
        elif has_location is False:
            sql += " AND latitude IS NULL"
        sql += " ORDER BY CASE incident_state WHEN 'RESOLVED' THEN 1 ELSE 0 END, received_at DESC LIMIT ?"
        args.append(limit)
        return [_incident(r) for r in db.all(sql, *args)]

    def person(user_id: str | None):
        """Details a responder needs to help: name, phone and emergency contacts only."""
        if not user_id:
            return None
        u = db.one("SELECT id, full_name, phone FROM users WHERE id = ?", user_id)
        if not u:
            return None
        contacts = db.all("SELECT name, phone, relationship FROM emergency_contacts WHERE user_id = ? ORDER BY created_at", user_id)
        return {**dict(u), "emergency_contacts": [dict(c) for c in contacts]}

    @app.get("/v1/admin/incidents/{message_id}")
    def incident_detail(message_id: str, user=Depends(responder)):
        inc = get_incident(message_id, with_events=True)
        inc["gateway"] = next((g for g in gateways_view() if g["id"] == inc["gateway_id"]), None)
        inc["person"] = person(inc["user_id"])
        return inc

    @app.get("/v1/admin/incidents/{message_id}/location")
    def incident_location(message_id: str, user=Depends(responder)):
        inc = get_incident(message_id)
        age = None
        if inc["location_recorded_at"]:
            age = int((datetime.now(timezone.utc) - _parse(inc["location_recorded_at"])).total_seconds())
        return {
            "message_id": message_id,
            "latitude": inc["latitude"], "longitude": inc["longitude"],
            "accuracy_m": inc["location_accuracy_m"],
            "recorded_at": inc["location_recorded_at"],  # captured by the phone
            "received_at": inc["received_at"],  # stored by this backend
            "source": inc["location_source"],
            "is_last_known": inc["location_is_last_known"],
            "freshness": inc["location_freshness"],
            "age_seconds_now": age,
        }

    async def transition(message_id: str, to: str, user: dict, request: Request, fields: dict, detail=None):
        with db.lock:
            inc = get_incident(message_id)
            if RANK[inc["incident_state"]] >= RANK[to]:
                return inc, False  # never moves backwards; repeating an action is a no-op
            now, name = now_iso(), user["full_name"]
            updates = {"incident_state": to, **fields}
            if not inc["acknowledged_by"]:  # dispatching or resolving implies acknowledgement
                updates.update(acknowledged_by=name, acknowledged_at=now)
            sets = ", ".join(f"{k} = ?" for k in updates)
            db.run(f"UPDATE incidents SET {sets} WHERE message_id = ?", *updates.values(), message_id)
            if to != "ACKNOWLEDGED" and not inc["acknowledged_by"]:
                event(message_id, "ACKNOWLEDGED", name, {"implied_by": to})
            event(message_id, to, name, detail)
            audit(user, f"incident.{to.lower()}", message_id, detail, request)
        inc = get_incident(message_id)
        log.info("%s %s by %s", to, message_id, name)
        await hub.publish("incident.updated", inc)
        return inc, True

    @app.post("/v1/admin/incidents/{message_id}/acknowledge")
    async def acknowledge(message_id: str, request: Request, user=Depends(responder)):
        now = now_iso()
        inc, _ = await transition(message_id, "ACKNOWLEDGED", user, request, {"acknowledged_by": user["full_name"], "acknowledged_at": now})
        return inc

    @app.post("/v1/admin/incidents/{message_id}/dispatch")
    async def dispatch(message_id: str, body: DispatchIn, request: Request, user=Depends(responder)):
        now = now_iso()
        inc, _ = await transition(message_id, "DISPATCHED", user, request,
                                  {"dispatched_by": user["full_name"], "dispatched_at": now, "dispatch_team": body.team, "dispatch_note": body.note},
                                  {"team": body.team, "note": body.note})
        return inc

    @app.post("/v1/admin/incidents/{message_id}/resolve")
    async def resolve(message_id: str, body: ResolveIn, request: Request, user=Depends(responder)):
        now = now_iso()
        inc, _ = await transition(message_id, "RESOLVED", user, request,
                                  {"resolved_by": user["full_name"], "resolved_at": now, "resolution_note": body.note},
                                  {"note": body.note})
        return inc

    @app.get("/v1/admin/network")
    def network(user=Depends(responder)):
        return {"gateways": gateways_view(), "time": now_iso()}

    @app.get("/v1/admin/audit")
    def audit_history(user=Depends(responder), limit: int = Query(200, ge=1, le=1000)):
        rows = db.all("SELECT id, actor_name, action, target, detail, ip, at FROM audit_log ORDER BY id DESC LIMIT ?", limit)
        return [{**dict(r), "detail": json.loads(r["detail"]) if r["detail"] else None} for r in rows]

    @app.post("/v1/admin/ws-ticket")
    def ws_ticket(user=Depends(responder)):
        """Short-lived, single-use ticket so the browser never holds the session token."""
        now = time.monotonic()
        for t in [t for t, (_, exp) in tickets.items() if exp < now]:
            tickets.pop(t, None)
        ticket = secrets.token_urlsafe(24)
        tickets[ticket] = (user["id"], now + 30)
        return {"ticket": ticket, "expires_in": 30}

    @app.websocket("/v1/admin/ws")
    async def live(websocket: WebSocket, ticket: str = ""):
        entry = tickets.pop(ticket, None)
        if not entry or entry[1] < time.monotonic():
            await websocket.close(code=4401)
            return
        await websocket.accept()
        hub.clients.add(websocket)
        try:
            while True:
                await asyncio.wait_for(websocket.receive_text(), timeout=None)
        except (WebSocketDisconnect, Exception):
            pass
        finally:
            hub.clients.discard(websocket)

    app.state.audit = audit
    return hub
