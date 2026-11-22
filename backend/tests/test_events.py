import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from trackmate_backend.config import Settings
from trackmate_backend.main import create_app

from .test_auth import auth, reg


def iso(days: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(timespec="seconds").replace("+00:00", "Z")


@pytest.fixture
def env(tmp_path):
    with TestClient(create_app(Settings(db_path=str(tmp_path / "e.db"), photo_dir=str(tmp_path / "photos")))) as c:
        a = c.post("/v1/auth/register", json=reg()).json()
        b = c.post("/v1/auth/register", json=reg(email="b@example.com", phone="+919800000001", full_name="Bina Rao")).json()
        db = c.app.state.db

        def add(owner, **over):
            e = {"id": str(uuid.uuid4()), "organizer_id": owner["user"]["id"], "title": "Kalsubai sunrise trek",
                 "description": "Night climb to the highest peak in Maharashtra.", "category": "TREK",
                 "start_location": "Bari village", "destination": "Kalsubai peak", "start_lat": 19.6, "start_lon": 73.71,
                 "start_at": iso(10), "end_at": iso(10.5), "duration_minutes": 720, "difficulty": "MODERATE",
                 "participant_limit": 20, "price_minor": 149900, "currency": "INR",
                 "organizer_contact": "+91 98000 12345", "visibility": "PUBLIC", "status": "PUBLISHED",
                 "created_at": iso(0), "updated_at": iso(0)}
            e.update(over)
            db.run(f"INSERT INTO events ({', '.join(e)}) VALUES ({', '.join('?' * len(e))})", *e.values())
            return e["id"]

        yield c, a, b, add


def ids(r):
    return [e["id"] for e in r.json()]


def test_discover_shows_only_published_public_upcoming(env):
    c, a, _, add = env
    shown = add(a)
    hidden = [add(a, status=s) for s in ("DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "CANCELLED", "COMPLETED")]
    hidden.append(add(a, visibility="UNLISTED"))
    hidden.append(add(a, start_at=iso(-3), end_at=iso(-2)))  # already over
    r = c.get("/v1/events")  # no sign-in needed to browse
    assert r.status_code == 200 and ids(r) == [shown]
    assert not set(hidden) & set(ids(r))


def test_public_event_never_exposes_private_contact(env):
    c, a, _, add = env
    eid = add(a)
    for body in (c.get("/v1/events").json()[0], c.get(f"/v1/events/{eid}").json()):
        assert "organizer_contact" not in body and "approval_mode" not in body
        assert body["organizer"] == {"id": a["user"]["id"], "name": "Ravi Kumar"}
        assert "email" not in str(body) and "98000" not in str(body)


def test_filters(env):
    c, a, _, add = env
    trek = add(a)
    walk = add(a, title="Fort heritage walk", category="CITY_WALK", difficulty="EASY", start_location="Pune",
               destination="Shaniwar Wada", start_at=iso(3), end_at=iso(3.1), participant_limit=2)
    assert ids(c.get("/v1/events", params={"q": "heritage"})) == [walk]
    assert ids(c.get("/v1/events", params={"category": "TREK"})) == [trek]
    assert ids(c.get("/v1/events", params={"difficulty": "EASY"})) == [walk]
    assert ids(c.get("/v1/events", params={"location": "kalsubai"})) == [trek]
    day = iso(3)[:10]
    assert ids(c.get("/v1/events", params={"date_from": day, "date_to": day})) == [walk]
    assert ids(c.get("/v1/events")) == [walk, trek]  # soonest first
    assert c.get("/v1/events", params={"date_from": "next week"}).status_code == 422
    assert c.get("/v1/events", params={"difficulty": "INSANE"}).status_code == 422


def test_seats_available_and_has_seats_filter(env):
    c, a, b, add = env
    full = add(a, participant_limit=1)
    open_ = add(a, participant_limit=5)
    db = c.app.state.db
    db.run("INSERT INTO event_applications (id, event_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, 'ACCEPTED', ?, ?)",
           "x1", full, b["user"]["id"], iso(0), iso(0))
    db.run("INSERT INTO event_applications (id, event_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, 'PENDING', ?, ?)",
           "x2", open_, b["user"]["id"], iso(0), iso(0))
    by_id = {e["id"]: e for e in c.get("/v1/events").json()}
    assert (by_id[full]["seats_taken"], by_id[full]["seats_available"]) == (1, 0)
    assert (by_id[open_]["seats_taken"], by_id[open_]["seats_available"]) == (0, 5)  # pending does not take a seat
    assert ids(c.get("/v1/events", params={"has_seats": "true"})) == [open_]


def test_my_events_lists_all_my_statuses_with_private_fields(env):
    c, a, b, add = env
    mine = [add(a, status="DRAFT"), add(a, status="REJECTED", status_reason="Add a meeting point"), add(a)]
    add(b)
    r = c.get("/v1/events/mine", headers=auth(a["token"]))
    assert sorted(ids(r)) == sorted(mine)
    rejected = next(e for e in r.json() if e["status"] == "REJECTED")
    assert rejected["status_reason"] == "Add a meeting point" and rejected["organizer_contact"] == "+91 98000 12345"
    assert c.get("/v1/events/mine").status_code == 401


def test_detail_hides_unpublished_from_others(env):
    c, a, b, add = env
    draft = add(a, status="DRAFT")
    assert c.get(f"/v1/events/{draft}").status_code == 404
    assert c.get(f"/v1/events/{draft}", headers=auth(b["token"])).status_code == 404
    assert c.get(f"/v1/events/{draft}", headers=auth(a["token"])).json()["status"] == "DRAFT"
    assert c.get("/v1/events/does-not-exist").status_code == 404


def test_categories(env):
    c, *_ = env
    cats = c.get("/v1/event-categories").json()
    assert cats[0] == {"code": "TREK", "label": "Trek"} and len(cats) == 8
