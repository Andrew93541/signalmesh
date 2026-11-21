import asyncio
import urllib.error
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from signalmesh_gateway.config import Settings
from signalmesh_gateway.main import create_app, forward_upstream_once
from signalmesh_gateway.store import iso, utcnow


def sos(mid="SM-test-0001", **over):
    body = {
        "message_id": mid,
        "device_id": "MOBILE_01",
        "worker_name": "Ravi",
        "category": "MEDICAL",
        "priority": "HIGH",
        "description": "Fell from ladder",
        "latitude": 19.076,
        "longitude": 72.8777,
        "created_at": "2026-11-21T10:41:08.120Z",
        "hop_count": 1,
        "hops": ["MOBILE_01", "RELAY_02"],
        "status": "RELAYED",
    }
    body.update(over)
    return body


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "gw.db")


@pytest.fixture
def client(db_path):
    with TestClient(create_app(Settings(db_path=db_path))) as c:
        yield c


def test_health(client):
    r = client.get("/health").json()
    assert r["status"] == "ok" and r["node_id"] == "GATEWAY_01" and r["role"] == "gateway"


def test_sos_stored_with_relay_path_and_original_fields(client):
    r = client.post("/gateway/sos", json=sos())
    assert r.status_code == 201
    assert r.json() == {"message_id": "SM-test-0001", "status": "DELIVERED", "duplicate": False, "node_id": "GATEWAY_01"}
    m = client.get("/gateway/messages/SM-test-0001").json()
    assert m["hops"] == ["MOBILE_01", "RELAY_02", "GATEWAY_01"]
    assert m["hop_count"] == 1 and m["received_from"] == "RELAY_02"
    assert m["created_at"] == "2026-11-21T10:41:08.120Z"  # preserved exactly
    assert m["description"] == "Fell from ladder"
    assert [e["kind"] for e in m["events"]] == ["RECEIVED"]


def test_direct_from_phone_without_hops(client):
    client.post("/gateway/sos", json=sos(hops=[], hop_count=0))
    assert client.get("/gateway/messages/SM-test-0001").json()["hops"] == ["MOBILE_01", "GATEWAY_01"]


def test_scenario4_duplicate_creates_one_record(client):
    first = client.post("/gateway/sos", json=sos())
    again = client.post("/gateway/sos", json=sos())
    other_path = client.post("/gateway/sos", json=sos(hops=["MOBILE_01"], hop_count=0))
    assert first.status_code == 201
    assert again.status_code == 200 and again.json()["duplicate"] is True
    assert other_path.json()["duplicate"] is True
    assert len(client.get("/gateway/messages").json()) == 1
    kinds = [e["kind"] for e in client.get("/gateway/messages/SM-test-0001").json()["events"]]
    assert kinds == ["RECEIVED", "DUPLICATE", "DUPLICATE"]


def test_scenario5_no_gps_accepted_and_not_invented(client):
    r = client.post("/gateway/sos", json=sos(latitude=None, longitude=None))
    assert r.status_code == 201
    m = client.get("/gateway/messages/SM-test-0001").json()
    assert m["latitude"] is None and m["longitude"] is None


@pytest.mark.parametrize("bad", [
    {"latitude": 19.0, "longitude": None},          # half a location
    {"latitude": 200},                              # out of range
    {"message_id": "bad id"},                       # wrong format
    {"category": "FIRE"},
    {"priority": "URGENT"},
    {"created_at": "yesterday"},
    {"description": "x" * 501},
])
def test_validation_rejects_bad_input(client, bad):
    assert client.post("/gateway/sos", json=sos(**bad)).status_code == 422
    assert client.get("/gateway/messages").json() == []


def test_scenario6_ack_reaches_ack_status_and_is_idempotent(client):
    client.post("/gateway/sos", json=sos())
    before = client.get("/gateway/ack-status/SM-test-0001").json()
    assert before == {"message_id": "SM-test-0001", "status": "DELIVERED", "acknowledged_by": None, "acknowledged_at": None}

    r = client.post("/gateway/ack/SM-test-0001", json={"acknowledged_by": "Meera Iyer"})
    assert r.status_code == 200 and r.json()["status"] == "ACKNOWLEDGED"
    client.post("/gateway/ack/SM-test-0001", json={"acknowledged_by": "Someone Else"})  # no-op

    after = client.get("/gateway/ack-status/SM-test-0001").json()
    assert after["status"] == "ACKNOWLEDGED" and after["acknowledged_by"] == "Meera Iyer"
    kinds = [e["kind"] for e in client.get("/gateway/messages/SM-test-0001").json()["events"]]
    assert kinds.count("ACKNOWLEDGED") == 1


def test_unknown_message_is_404(client):
    assert client.get("/gateway/ack-status/SM-nope-000").status_code == 404
    assert client.post("/gateway/ack/SM-nope-000", json={"acknowledged_by": "M"}).status_code == 404


def test_resolve_fills_acknowledger_if_missing(client):
    client.post("/gateway/sos", json=sos())
    m = client.post("/gateway/resolve/SM-test-0001", json={"resolved_by": "Meera", "note": "First aid done"}).json()
    assert m["status"] == "RESOLVED" and m["acknowledged_by"] == "Meera" and m["resolution_note"] == "First aid done"


def test_filters_and_status_counts(client):
    client.post("/gateway/sos", json=sos("SM-aaaa-0001", category="MEDICAL", priority="HIGH"))
    client.post("/gateway/sos", json=sos("SM-aaaa-0002", category="RESCUE", priority="MEDIUM"))
    client.post("/gateway/sos", json=sos("SM-aaaa-0003", category="RESCUE", priority="HIGH"))
    client.post("/gateway/ack/SM-aaaa-0003", json={"acknowledged_by": "M"})

    assert {m["message_id"] for m in client.get("/gateway/messages?category=rescue").json()} == {"SM-aaaa-0002", "SM-aaaa-0003"}
    assert [m["message_id"] for m in client.get("/gateway/messages?status=DELIVERED&priority=HIGH").json()] == ["SM-aaaa-0001"]
    assert client.get("/gateway/messages?status=BOGUS").status_code == 422

    s = client.get("/gateway/status").json()
    assert s["messages"] == {"total": 3, "open": 3, "critical_open": 2, "awaiting_ack": 2, "acknowledged": 1, "resolved": 0}
    assert s["database"] == "ok" and s["upstream"]["enabled"] is False


def test_messages_survive_restart(db_path):
    with TestClient(create_app(Settings(db_path=db_path))) as c:
        c.post("/gateway/sos", json=sos())
        c.post("/gateway/ack/SM-test-0001", json={"acknowledged_by": "Meera"})
    with TestClient(create_app(Settings(db_path=db_path))) as c:
        m = c.get("/gateway/ack-status/SM-test-0001").json()
        assert m["status"] == "ACKNOWLEDGED"
        assert c.post("/gateway/sos", json=sos()).json()["duplicate"] is True


def test_checkin_overdue_detection(client):
    recent = iso(utcnow())
    stale = iso(utcnow() - timedelta(minutes=20))
    base = {"worker_name": "W", "latitude": None, "longitude": None, "interval_minutes": 15}
    assert client.post("/gateway/checkin", json={**base, "device_id": "MOBILE_01", "checked_in_at": recent}).status_code == 200
    client.post("/gateway/checkin", json={**base, "device_id": "MOBILE_02", "checked_in_at": stale})
    rows = {c["device_id"]: c for c in client.get("/gateway/checkins").json()}
    assert rows["MOBILE_01"]["overdue"] is False and rows["MOBILE_02"]["overdue"] is True
    assert client.get("/gateway/status").json()["checkins"] == {"devices": 2, "overdue": 1}


def test_node_heartbeat_and_online(client):
    client.post("/gateway/nodes/heartbeat", json={"node_id": "RELAY_02", "role": "relay", "queue_size": 3})
    nodes = client.get("/gateway/nodes").json()
    assert nodes[0]["node_id"] == "RELAY_02" and nodes[0]["online"] is True and nodes[0]["queue_size"] == 3
    assert client.get("/gateway/status").json()["nodes"] == {"online": 1, "known": 1}


def test_websocket_pushes_new_sos_and_ack(client):
    with client.websocket_connect("/ws") as ws:
        client.post("/gateway/sos", json=sos())
        assert ws.receive_json()["type"] == "sos.created"
        client.post("/gateway/ack/SM-test-0001", json={"acknowledged_by": "Meera"})
        evt = ws.receive_json()
        assert evt["type"] == "sos.updated" and evt["data"]["status"] == "ACKNOWLEDGED"


def test_upstream_queue_keeps_messages_until_upstream_returns(db_path):
    # Background loop effectively off so the test drives forwarding itself.
    settings = Settings(db_path=db_path, upstream_url="http://upstream.invalid", upstream_retry_seconds=3600)
    app = create_app(settings)
    store = app.state.store

    def down(url, payload):
        raise urllib.error.URLError("connection refused")

    with TestClient(app) as c:
        c.post("/gateway/sos", json=sos("SM-up-000001", priority="LOW"))
        c.post("/gateway/sos", json=sos("SM-up-000002", priority="HIGH"))

        assert asyncio.run(forward_upstream_once(store, settings, post=down)) == 0
        assert len(store.pending_upstream()) == 2  # nothing lost while upstream is down
        assert c.get("/gateway/status").json()["upstream"]["pending"] == 2

        received = []
        assert asyncio.run(forward_upstream_once(store, settings, post=lambda url, p: received.append(p) or 201)) == 2
        assert [p["message_id"] for p in received] == ["SM-up-000002", "SM-up-000001"]  # HIGH first
        assert received[0]["hops"][-1] == "GATEWAY_01" and received[0]["hop_count"] == 2
        assert store.pending_upstream() == []
