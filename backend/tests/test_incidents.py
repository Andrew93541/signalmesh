import secrets

import pytest
from fastapi.testclient import TestClient

from trackmate_backend import security
from trackmate_backend.config import Settings
from trackmate_backend.db import now_iso
from trackmate_backend.main import create_app
from tests.test_auth import PASSWORD, reg


def sos(mid="SM-incident-001", **over):
    body = {
        "message_id": mid, "device_id": "MOBILE_01", "worker_name": "Ravi", "category": "MEDICAL", "priority": "HIGH",
        "description": None, "latitude": 19.0334, "longitude": 73.0638, "created_at": "2026-11-21T10:00:00.000Z",
        "hop_count": 2, "hops": ["MOBILE_01", "RELAY_02", "GATEWAY_01"], "status": "RELAYED",
    }
    body.update(over)
    return body


@pytest.fixture
def env(tmp_path):
    app = create_app(Settings(db_path=str(tmp_path / "i.db")))
    db = app.state.db
    token = secrets.token_urlsafe(16)
    db.run("INSERT INTO gateways (id, token_hash, created_at) VALUES ('GATEWAY_01', ?, ?)", security.token_hash(token), now_iso())
    with TestClient(app) as c:
        # an ordinary user and a responder
        user_token = c.post("/v1/auth/register", json=reg()).json()["token"]
        c.post("/v1/auth/register", json=reg(email="meera@example.org", phone="+919800000001", full_name="Meera Iyer"))
        db.run("UPDATE users SET role = 'responder' WHERE email = 'meera@example.org'")
        resp_token = c.post("/v1/auth/login", json={"identifier": "meera@example.org", "password": PASSWORD}).json()["token"]
        yield {"c": c, "db": db, "gw": {"Authorization": f"Bearer {token}"},
               "user": {"Authorization": f"Bearer {user_token}"}, "resp": {"Authorization": f"Bearer {resp_token}"}}


def test_gateway_ingest_requires_gateway_credential(env):
    c = env["c"]
    assert c.post("/gateway/sos", json=sos()).status_code == 401
    assert c.post("/gateway/sos", json=sos(), headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert c.post("/gateway/sos", json=sos(), headers=env["user"]).status_code == 401  # user session is not a gateway


def test_ingest_records_full_path_and_dedupes(env):
    c = env["c"]
    r = c.post("/gateway/sos", json=sos(), headers=env["gw"])
    assert r.status_code == 201 and r.json()["incident_state"] == "OPEN"
    again = c.post("/gateway/sos", json=sos(), headers=env["gw"])
    assert again.status_code == 200 and again.json()["duplicate"] is True
    incs = c.get("/v1/admin/incidents", headers=env["resp"]).json()
    assert len(incs) == 1
    assert incs[0]["hops"] == ["MOBILE_01", "RELAY_02", "GATEWAY_01", "BACKEND_01"]
    assert incs[0]["created_at"] == "2026-11-21T10:00:00.000Z"
    kinds = [e["kind"] for e in c.get("/v1/admin/incidents/SM-incident-001", headers=env["resp"]).json()["events"]]
    assert kinds == ["RECEIVED", "DUPLICATE"]


def test_null_gps_is_kept_null(env):
    c = env["c"]
    c.post("/gateway/sos", json=sos(latitude=None, longitude=None), headers=env["gw"])
    inc = c.get("/v1/admin/incidents/SM-incident-001", headers=env["resp"]).json()
    assert inc["latitude"] is None and inc["longitude"] is None
    assert c.get("/v1/admin/incidents?has_location=true", headers=env["resp"]).json() == []


def test_admin_api_requires_responder(env):
    c = env["c"]
    for path in ("/v1/admin/summary", "/v1/admin/incidents", "/v1/admin/network", "/v1/admin/audit"):
        assert c.get(path).status_code == 401
        assert c.get(path, headers=env["user"]).status_code == 403
    c.post("/gateway/sos", json=sos(), headers=env["gw"])
    assert c.post("/v1/admin/incidents/SM-incident-001/acknowledge", headers=env["user"]).status_code == 403
    assert c.post("/v1/admin/incidents/SM-incident-001/acknowledge").status_code == 401
    # nothing changed
    assert c.get("/v1/admin/incidents/SM-incident-001", headers=env["resp"]).json()["incident_state"] == "OPEN"


def test_summary_and_filters_use_real_data(env):
    c, gw, h = env["c"], env["gw"], env["resp"]
    assert c.get("/v1/admin/summary", headers=h).json()["incidents"]["total"] == 0  # empty, not mocked
    c.post("/gateway/sos", json=sos("SM-incident-001"), headers=gw)
    c.post("/gateway/sos", json=sos("SM-incident-002", priority="LOW", category="RESCUE"), headers=gw)
    c.post("/v1/admin/incidents/SM-incident-002/acknowledge", headers=h)
    s = c.get("/v1/admin/summary", headers=h).json()["incidents"]
    assert s == {"total": 2, "active": 2, "critical": 1, "awaiting_ack": 1, "acknowledged": 1, "dispatched": 0, "resolved": 0}
    assert [i["message_id"] for i in c.get("/v1/admin/incidents?category=rescue", headers=h).json()] == ["SM-incident-002"]
    assert [i["message_id"] for i in c.get("/v1/admin/incidents?state=OPEN&priority=HIGH", headers=h).json()] == ["SM-incident-001"]
    assert c.get("/v1/admin/incidents?state=BOGUS", headers=h).status_code == 422


def test_acknowledge_dispatch_resolve_with_evidence_and_audit(env):
    c, h = env["c"], env["resp"]
    c.post("/gateway/sos", json=sos(), headers=env["gw"])
    base = "/v1/admin/incidents/SM-incident-001"
    assert c.post(f"{base}/dispatch", json={}, headers=h).status_code == 422  # team required
    assert c.post(f"{base}/dispatch", json={"team": "x"}, headers=h).status_code == 422
    a = c.post(f"{base}/acknowledge", headers=h).json()
    assert a["incident_state"] == "ACKNOWLEDGED" and a["acknowledged_by"] == "Meera Iyer" and a["acknowledged_at"]
    d = c.post(f"{base}/dispatch", json={"team": "Rescue team B", "note": "ETA 20 min"}, headers=h).json()
    assert d["incident_state"] == "DISPATCHED" and d["dispatch_team"] == "Rescue team B" and d["dispatched_by"] == "Meera Iyer"
    assert c.post(f"{base}/resolve", json={"note": ""}, headers=h).status_code == 422  # note required
    r = c.post(f"{base}/resolve", json={"note": "Reached safely"}, headers=h).json()
    assert r["incident_state"] == "RESOLVED" and r["resolved_by"] == "Meera Iyer" and r["resolved_at"]
    # never moves backwards
    assert c.post(f"{base}/acknowledge", headers=h).json()["incident_state"] == "RESOLVED"
    kinds = [e["kind"] for e in c.get(base, headers=h).json()["events"]]
    assert kinds == ["RECEIVED", "ACKNOWLEDGED", "DISPATCHED", "RESOLVED"]
    actions = [a["action"] for a in c.get("/v1/admin/audit", headers=h).json()]
    assert {"incident.acknowledged", "incident.dispatched", "incident.resolved", "responder.login"} <= set(actions)


def test_dispatch_without_ack_implies_ack(env):
    c, h = env["c"], env["resp"]
    c.post("/gateway/sos", json=sos(), headers=env["gw"])
    d = c.post("/v1/admin/incidents/SM-incident-001/dispatch", json={"team": "Team A"}, headers=h).json()
    assert d["acknowledged_by"] == "Meera Iyer"


def test_gateway_sync_returns_responder_actions_and_accepts_status(env):
    c, gw, h = env["c"], env["gw"], env["resp"]
    c.post("/gateway/sos", json=sos(), headers=gw)
    assert c.get("/v1/gateway-sync/updates?since=0", headers=gw).json()["updates"] == []
    c.post("/v1/admin/incidents/SM-incident-001/acknowledge", headers=h)
    body = c.get("/v1/gateway-sync/updates?since=0", headers=gw).json()
    assert body["updates"][0]["incident_state"] == "ACKNOWLEDGED" and body["updates"][0]["acknowledged_by"] == "Meera Iyer"
    assert c.get(f"/v1/gateway-sync/updates?since={body['cursor']}", headers=gw).json()["updates"] == []
    status = {"node_id": "GATEWAY_01", "upstream_pending": 2, "nodes": [{"node_id": "RELAY_02", "role": "relay", "online": True}]}
    assert c.post("/v1/gateway-sync/status", json=status, headers=gw).status_code == 200
    assert c.post("/v1/gateway-sync/status", json={**status, "node_id": "GATEWAY_99"}, headers=gw).status_code == 403
    s = c.get("/v1/admin/summary", headers=h).json()
    assert s["gateways"] == {"known": 1, "online": 1} and s["relays"] == {"known": 1, "online": 1} and s["upstream_pending"] == 2


def test_websocket_requires_ticket_and_pushes_new_incident(env):
    c, h = env["c"], env["resp"]
    assert c.post("/v1/admin/ws-ticket", headers=env["user"]).status_code == 403
    with pytest.raises(Exception):
        with c.websocket_connect("/v1/admin/ws?ticket=nope") as ws:
            ws.receive_text()
    ticket = c.post("/v1/admin/ws-ticket", headers=h).json()["ticket"]
    with c.websocket_connect(f"/v1/admin/ws?ticket={ticket}") as ws:
        c.post("/gateway/sos", json=sos(), headers=env["gw"])
        msg = ws.receive_json()
        assert msg["type"] == "incident.created" and msg["data"]["message_id"] == "SM-incident-001"
    with pytest.raises(Exception):  # ticket is single-use
        with c.websocket_connect(f"/v1/admin/ws?ticket={ticket}") as ws:
            ws.receive_text()


def test_migration_from_v1_database(tmp_path):
    from trackmate_backend.db import MIGRATIONS, Database
    path = str(tmp_path / "old.db")
    old = Database.__new__(Database)  # build a v1-only database by hand
    import sqlite3, threading
    old.conn = sqlite3.connect(path, isolation_level=None); old.conn.row_factory = sqlite3.Row; old.lock = threading.RLock()
    old.conn.execute("BEGIN")
    for st in (s for s in MIGRATIONS[0].split(";") if s.strip()):
        old.conn.execute(st)
    old.conn.execute("PRAGMA user_version = 1"); old.conn.execute("COMMIT")
    old.conn.execute("INSERT INTO users (id, full_name, email, phone, password_hash, created_at) VALUES ('u1','A B','a@b.co','+911234567','h','t')")
    old.conn.close()
    db = Database(path)
    assert db.schema_version == len(MIGRATIONS)
    assert db.one("SELECT role FROM users WHERE id = 'u1'")["role"] == "user"  # existing data kept


GPS = {"latitude": 19.0334226, "longitude": 73.0638, "location_accuracy_m": 12.5,
       "location_recorded_at": "2026-11-21T09:59:58.000Z", "location_source": "DEVICE", "location_is_last_known": False}


def test_location_metadata_stored_unchanged_with_freshness(env):
    c, gw, h = env["c"], env["gw"], env["resp"]
    c.post("/gateway/sos", json=sos(**GPS), headers=gw)
    loc = c.get("/v1/admin/incidents/SM-incident-001/location", headers=h).json()
    assert (loc["latitude"], loc["longitude"], loc["accuracy_m"]) == (19.0334226, 73.0638, 12.5)
    assert loc["recorded_at"] == "2026-11-21T09:59:58.000Z" and loc["received_at"] != loc["recorded_at"]
    assert loc["freshness"] == "CURRENT" and loc["is_last_known"] is False and loc["source"] == "DEVICE"
    assert c.get("/v1/admin/incidents/SM-incident-001/location", headers=env["user"]).status_code == 403


@pytest.mark.parametrize("over,expected", [
    ({"location_is_last_known": True, "location_source": "DEVICE_LAST_KNOWN"}, "LAST_KNOWN"),
    ({"location_recorded_at": "2026-11-21T09:30:00.000Z"}, "LAST_KNOWN"),  # 30 min before the SOS
    ({"location_recorded_at": None, "location_accuracy_m": None}, "LAST_KNOWN"),  # old app: no capture time
    ({"latitude": None, "longitude": None, "location_recorded_at": None, "location_accuracy_m": None,
      "location_source": None, "location_is_last_known": None}, "NONE"),
])
def test_freshness_is_never_overstated(env, over, expected):
    c = env["c"]
    c.post("/gateway/sos", json=sos(**{**GPS, **over}), headers=env["gw"])
    assert c.get("/v1/admin/incidents/SM-incident-001", headers=env["resp"]).json()["location_freshness"] == expected


def test_metadata_without_coordinates_rejected(env):
    bad = {**GPS, "latitude": None, "longitude": None}
    assert env["c"].post("/gateway/sos", json=sos(**bad), headers=env["gw"]).status_code == 422


def test_incident_links_to_real_account_and_shows_only_needed_details(env):
    c, h = env["c"], env["resp"]
    uid = c.get("/v1/auth/me", headers=env["user"]).json()["id"]
    c.post("/gateway/sos", json=sos(user_id=uid), headers=env["gw"])
    c.post("/gateway/sos", json=sos("SM-incident-002", user_id="not-a-user"), headers=env["gw"])
    inc = c.get("/v1/admin/incidents/SM-incident-001", headers=h).json()
    assert inc["person"]["full_name"] == "Ravi Kumar" and inc["person"]["phone"] == "+919876543210"
    assert inc["person"]["emergency_contacts"][0]["name"] == "Asha Kumar"
    assert "email" not in inc["person"] and "password_hash" not in str(inc)
    assert c.get("/v1/admin/incidents/SM-incident-002", headers=h).json()["person"] is None


def peer_ack(mid="SM-incident-001", device="MOBILE_0DF5", **over):
    b = {"message_id": mid, "recipient_device_id": device, "recipient_name": "Bina", "acknowledged_at": "2026-11-22T10:00:00.000Z"}
    b.update(over)
    return b


def test_peer_ack_is_an_event_not_a_responder_acknowledgement(env):
    c = env["c"]
    assert c.post("/gateway/peer-ack", json=peer_ack(), headers=env["gw"]).status_code == 404  # SOS not here yet: gateway retries
    c.post("/gateway/sos", json=sos(), headers=env["gw"])
    r = c.post("/gateway/peer-ack", json=peer_ack(), headers=env["gw"])
    assert r.status_code == 201 and r.json()["duplicate"] is False
    assert c.post("/gateway/peer-ack", json=peer_ack(), headers=env["gw"]).json()["duplicate"] is True
    inc = c.get("/v1/admin/incidents/SM-incident-001", headers=env["resp"]).json()
    assert inc["incident_state"] == "OPEN" and inc["acknowledged_by"] is None
    acks = [e for e in inc["events"] if e["kind"] == "PEER_ACK"]
    assert len(acks) == 1 and acks[0]["actor"] == "Bina" and acks[0]["detail"]["recipient_device_id"] == "MOBILE_0DF5"
    assert acks[0]["detail"]["recipient_user_id"] is None  # unknown account ids are not linked


def test_peer_ack_needs_gateway_credential(env):
    c = env["c"]
    c.post("/gateway/sos", json=sos(), headers=env["gw"])
    assert c.post("/gateway/peer-ack", json=peer_ack()).status_code == 401
    assert c.post("/gateway/peer-ack", json=peer_ack(), headers=env["user"]).status_code == 401
