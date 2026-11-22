import pytest
from fastapi.testclient import TestClient

from trackmate_backend.config import Settings
from trackmate_backend.main import create_app

from .test_auth import auth, reg


@pytest.fixture
def env(tmp_path):
    with TestClient(create_app(Settings(db_path=str(tmp_path / "m.db"), photo_dir=str(tmp_path / "photos")))) as c:
        users = []
        for i, name in enumerate(["Ravi Kumar", "Bina Rao", "Chetan Das"]):
            r = c.post("/v1/auth/register", json=reg(email=f"u{i}@example.com", phone=f"+91980000000{i}", full_name=name)).json()
            users.append((r["user"]["id"], auth(r["token"])))
        yield c, users


def test_only_followers_can_be_messaged_first(env):
    c, [(a, ah), (b, bh), _] = env
    assert c.post("/v1/conversations", json={"user_id": b}, headers=ah).status_code == 403  # B does not follow A
    c.post(f"/v1/users/{a}/follow", headers=bh)  # B follows A: A may now message B
    conv = c.post("/v1/conversations", json={"user_id": b}, headers=ah).json()
    assert conv["other"]["id"] == b and "email" not in str(conv) and "phone" not in str(conv)
    again = c.post("/v1/conversations", json={"user_id": a}, headers=bh).json()
    assert again["id"] == conv["id"]  # one conversation per pair; B can reply even though A doesn't follow B
    assert c.post("/v1/conversations", json={"user_id": a}, headers=ah).status_code == 422


def test_send_read_unread_and_privacy(env):
    c, [(a, ah), (b, bh), (_, ch)] = env
    c.post(f"/v1/users/{a}/follow", headers=bh)
    cid = c.post("/v1/conversations", json={"user_id": b}, headers=ah).json()["id"]
    assert c.get("/v1/conversations", headers=ah).json() == []  # no messages yet: not listed
    m = c.post(f"/v1/conversations/{cid}/messages", json={"body": "Joining Sunday's trek?"}, headers=ah).json()
    assert m["mine"] is True and m["read_at"] is None
    assert c.post(f"/v1/conversations/{cid}/messages", json={"body": "   "}, headers=ah).status_code == 422
    assert c.get("/v1/conversations/unread-count", headers=bh).json() == {"unread": 1}
    inbox = c.get("/v1/conversations", headers=bh).json()
    assert inbox[0]["last_message"]["body"] == "Joining Sunday's trek?" and inbox[0]["unread"] == 1
    c.post(f"/v1/conversations/{cid}/messages", json={"body": "Yes!"}, headers=bh)
    msgs = c.get(f"/v1/conversations/{cid}/messages", headers=bh).json()["items"]
    assert [(x["body"], x["mine"]) for x in msgs] == [("Joining Sunday's trek?", False), ("Yes!", True)]
    c.post(f"/v1/conversations/{cid}/read", headers=bh)
    assert c.get("/v1/conversations/unread-count", headers=bh).json() == {"unread": 0}
    # A third person cannot read or post in it
    assert c.get(f"/v1/conversations/{cid}/messages", headers=ch).status_code == 404
    assert c.post(f"/v1/conversations/{cid}/messages", json={"body": "hi"}, headers=ch).status_code == 404
    assert c.get("/v1/conversations").status_code == 401


def test_blocking_stops_messages(env):
    c, [(a, ah), (b, bh), _] = env
    c.post(f"/v1/users/{a}/follow", headers=bh)
    cid = c.post("/v1/conversations", json={"user_id": b}, headers=ah).json()["id"]
    c.post(f"/v1/conversations/{cid}/messages", json={"body": "hello"}, headers=ah)
    c.post(f"/v1/users/{a}/block", headers=bh)
    assert c.post(f"/v1/conversations/{cid}/messages", json={"body": "hello?"}, headers=ah).status_code == 403
    assert c.get("/v1/conversations", headers=ah).json() == []
    assert c.post("/v1/conversations", json={"user_id": b}, headers=ah).status_code == 404


def test_profile_says_whether_they_follow_you(env):
    c, [(a, ah), (b, bh), _] = env
    assert c.get(f"/v1/users/{b}/profile", headers=ah).json()["follows_me"] is False
    c.post(f"/v1/users/{a}/follow", headers=bh)
    assert c.get(f"/v1/users/{b}/profile", headers=ah).json()["follows_me"] is True


def test_demo_seed_is_labelled_and_fully_removable(env, tmp_path):
    from trackmate_backend import demo
    c, [(a, ah), _, _] = env
    db = c.app.state.db
    media = tmp_path / "media"
    r = demo.seed(db, media, a)
    assert r == {"demo_users": 4, "new_posts": 6, "messages": 2}
    assert demo.seed(db, media, a)["new_posts"] == 0  # idempotent
    feed = c.get("/v1/feed", headers=ah).json()["items"]
    assert len(feed) == 6 and all(p["caption"].startswith("Demo post:") and p["author"]["name"].endswith("(demo)") for p in feed)
    assert all(p["latitude"] is None for p in feed)  # no coordinates
    img = c.get(f"/v1/media/{feed[0]['media'][0]['id']}", headers=ah)
    assert img.status_code == 200 and img.content.startswith(b"\x89PNG")
    assert c.get("/v1/conversations/unread-count", headers=ah).json() == {"unread": 2}
    assert c.post("/v1/auth/login", json={"identifier": f"asha.demo@{demo.DOMAIN}", "password": "anything123"}).status_code == 401
    out = demo.remove(db, media)
    assert out["removed_users"] == 4 and c.get("/v1/feed", headers=ah).json()["items"] == []
    assert c.get("/v1/conversations", headers=ah).json() == [] and not list(media.glob("*.png"))
