import pytest
from fastapi.testclient import TestClient

from trackmate_backend.config import Settings
from trackmate_backend.main import create_app

from .test_auth import auth, reg

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 200


@pytest.fixture
def env(tmp_path):
    with TestClient(create_app(Settings(db_path=str(tmp_path / "s.db"), photo_dir=str(tmp_path / "photos")))) as c:
        a = c.post("/v1/auth/register", json=reg()).json()
        b = c.post("/v1/auth/register", json=reg(email="b@example.com", phone="+919800000001", full_name="Bina Rao")).json()
        yield c, (a["user"]["id"], auth(a["token"])), (b["user"]["id"], auth(b["token"]))


def upload(c, h, data=JPEG, mime="image/jpeg"):
    return c.post("/v1/media", content=data, headers={**h, "Content-Type": mime})


def post(c, h, **over):
    mid = upload(c, h).json()["id"]
    body = {"caption": "Sunrise at Kalsubai", "location_name": "Kalsubai", "media_ids": [mid]}
    body.update(over)
    return c.post("/v1/posts", json=body, headers=h)


def test_create_post_with_photo_and_video_hides_coords_by_default(env):
    c, (aid, ah), (_, bh) = env
    img = upload(c, ah).json()
    vid = upload(c, ah, MP4, "video/mp4").json()
    assert (img["kind"], vid["kind"]) == ("IMAGE", "VIDEO")
    r = c.post("/v1/posts", json={"caption": "Trail day", "location_name": "Lonavala", "media_ids": [img["id"], vid["id"]],
                                  "latitude": 18.75, "longitude": 73.4}, headers=ah)
    assert r.status_code == 201
    p = r.json()
    assert p["latitude"] is None and p["longitude"] is None  # coordinates need share_location=true
    assert [m["kind"] for m in p["media"]] == ["IMAGE", "VIDEO"] and p["is_mine"] is True
    seen = c.get(f"/v1/posts/{p['id']}", headers=bh).json()
    assert seen["is_mine"] is False and "email" not in str(seen) and "phone" not in str(seen)
    assert c.get(f"/v1/media/{img['id']}", headers=bh).content == JPEG
    shared = post(c, ah, share_location=True, latitude=19.6, longitude=73.7).json()
    assert (shared["latitude"], shared["longitude"]) == (19.6, 73.7)


@pytest.mark.parametrize("data,mime,code", [(b"hello", "image/jpeg", 415), (JPEG, "image/gif", 415), (b"", "image/png", 422),
                                            (b"\xff\xd8\xff" + b"0" * (10 * 1024 * 1024), "image/jpeg", 413)])
def test_media_validation(env, data, mime, code):
    c, (_, ah), _ = env
    assert upload(c, ah, data, mime).status_code == code


def test_media_must_be_own_and_unused(env):
    c, (_, ah), (_, bh) = env
    theirs = upload(c, bh).json()["id"]
    assert c.post("/v1/posts", json={"caption": "x", "media_ids": [theirs]}, headers=ah).status_code == 422
    mine = upload(c, ah).json()["id"]
    assert c.post("/v1/posts", json={"media_ids": [mine]}, headers=ah).status_code == 201
    assert c.post("/v1/posts", json={"media_ids": [mine]}, headers=ah).status_code == 422  # already used
    assert c.post("/v1/posts", json={"caption": "no media", "media_ids": []}, headers=ah).status_code == 422
    unattached = upload(c, ah).json()["id"]
    assert c.get(f"/v1/media/{unattached}", headers=bh).status_code == 404  # not posted yet: owner only


def test_only_owner_edits_or_deletes(env):
    c, (_, ah), (_, bh) = env
    p = post(c, ah, share_location=True, latitude=19.6, longitude=73.7).json()
    assert c.patch(f"/v1/posts/{p['id']}", json={"caption": "hacked"}, headers=bh).status_code == 403
    assert c.delete(f"/v1/posts/{p['id']}", headers=bh).status_code == 403
    e = c.patch(f"/v1/posts/{p['id']}", json={"caption": "Edited", "share_location": False}, headers=ah).json()
    assert e["caption"] == "Edited" and e["latitude"] is None
    assert c.patch(f"/v1/posts/{p['id']}", json={"share_location": True}, headers=ah).status_code == 422
    assert c.delete(f"/v1/posts/{p['id']}", headers=ah).status_code == 200
    assert c.get(f"/v1/posts/{p['id']}", headers=ah).status_code == 404
    assert c.get(f"/v1/media/{p['media'][0]['id']}", headers=ah).status_code == 404  # file removed with the post


def test_likes_and_comments(env):
    c, (_, ah), (_, bh) = env
    pid = post(c, ah).json()["id"]
    assert c.post(f"/v1/posts/{pid}/like", headers=bh).json()["like_count"] == 1
    assert c.post(f"/v1/posts/{pid}/like", headers=bh).json()["like_count"] == 1  # idempotent
    assert c.get(f"/v1/posts/{pid}", headers=bh).json()["liked_by_me"] is True
    assert c.delete(f"/v1/posts/{pid}/like", headers=bh).json()["like_count"] == 0
    cm = c.post(f"/v1/posts/{pid}/comments", json={"body": "Stunning!"}, headers=bh).json()
    assert cm["author"]["name"] == "Bina Rao" and cm["can_delete"] is True
    assert c.post(f"/v1/posts/{pid}/comments", json={"body": "   "}, headers=bh).status_code == 422
    other = c.post(f"/v1/posts/{pid}/comments", json={"body": "Thanks"}, headers=ah).json()
    assert c.delete(f"/v1/comments/{other['id']}", headers=bh).status_code == 403  # not hers, not her post
    assert c.get(f"/v1/posts/{pid}", headers=ah).json()["comment_count"] == 2
    assert c.delete(f"/v1/comments/{cm['id']}", headers=ah).status_code == 200  # post owner may moderate
    assert [x["body"] for x in c.get(f"/v1/posts/{pid}/comments", headers=ah).json()] == ["Thanks"]


def test_follow_feed_profile_and_lists(env):
    c, (aid, ah), (bid, bh) = env
    post(c, ah)
    assert c.get("/v1/feed?scope=following", headers=bh).json()["items"] == []
    assert len(c.get("/v1/feed", headers=bh).json()["items"]) == 1
    prof = c.post(f"/v1/users/{aid}/follow", headers=bh).json()
    assert prof["is_following"] is True and prof["followers_count"] == 1
    assert len(c.get("/v1/feed?scope=following", headers=bh).json()["items"]) == 1
    assert [u["id"] for u in c.get(f"/v1/users/{aid}/followers", headers=bh).json()["items"]] == [bid]
    assert [u["id"] for u in c.get(f"/v1/users/{bid}/following", headers=ah).json()["items"]] == [aid]
    assert c.post(f"/v1/users/{bid}/follow", headers=bh).status_code == 422  # not yourself
    c.delete(f"/v1/users/{aid}/follow", headers=bh)
    assert c.get(f"/v1/users/{aid}/profile", headers=bh).json()["followers_count"] == 0
    assert c.get(f"/v1/users/{aid}/posts", headers=bh).json()["items"][0]["caption"] == "Sunrise at Kalsubai"


def test_public_profile_never_exposes_private_data(env):
    c, (aid, ah), (_, bh) = env
    c.patch("/v1/users/me", json={"username": "Ravi.Treks", "intro": "Weekend trekker", "interests": ["Sahyadri", "Camping"],
                                  "home_location": "Pune", "show_home_location": False}, headers=ah)
    p = c.get(f"/v1/users/{aid}/profile", headers=bh).json()
    assert p["username"] == "ravi.treks" and p["bio"] == "Weekend trekker" and p["interests"] == ["Sahyadri", "Camping"]
    assert p["home_location"] is None  # hidden unless chosen
    for secret in ("ravi@example.com", "9876543210", "Asha", "emergency", "role", "email", "phone"):
        assert secret not in str(p)
    c.patch("/v1/users/me", json={"show_home_location": True}, headers=ah)
    assert c.get(f"/v1/users/{aid}/profile", headers=bh).json()["home_location"] == "Pune"
    assert c.patch("/v1/users/me", json={"username": "ravi.treks"}, headers=bh).status_code == 409
    assert c.patch("/v1/users/me", json={"username": "no spaces!"}, headers=bh).status_code == 422


def test_block_hides_both_ways_and_removes_follows(env):
    c, (aid, ah), (bid, bh) = env
    pid = post(c, ah).json()["id"]
    c.post(f"/v1/users/{aid}/follow", headers=bh)
    assert c.post(f"/v1/users/{bid}/block", headers=ah).json()["status"] == "blocked"
    assert c.get(f"/v1/posts/{pid}", headers=bh).status_code == 404
    assert c.get("/v1/feed", headers=bh).json()["items"] == []
    assert c.get(f"/v1/users/{aid}/profile", headers=bh).status_code == 404
    assert c.post(f"/v1/users/{aid}/follow", headers=bh).status_code == 404
    assert c.get(f"/v1/users/{aid}/profile", headers=ah).json()["followers_count"] == 0
    assert [u["id"] for u in c.get("/v1/users/me/blocks", headers=ah).json()] == [bid]
    c.delete(f"/v1/users/{bid}/block", headers=ah)
    assert c.get(f"/v1/posts/{pid}", headers=bh).status_code == 200


def test_reports(env):
    c, (_, ah), (_, bh) = env
    pid = post(c, ah).json()["id"]
    assert c.post("/v1/reports", json={"target_type": "POST", "target_id": pid, "reason": "SPAM"}, headers=bh).status_code == 201
    assert c.post("/v1/reports", json={"target_type": "POST", "target_id": pid, "reason": "BORING"}, headers=bh).status_code == 422


def test_everything_needs_sign_in(env):
    c, *_ = env
    for m, url in (("get", "/v1/feed"), ("post", "/v1/media"), ("get", "/v1/users/x/profile"), ("get", "/v1/users/me/entitlements")):
        assert getattr(c, m)(url).status_code == 401


def test_plans_prices_and_free_emergency(env):
    c, *_ = env
    p = c.get("/v1/plans").json()
    prices = {x["code"]: (x["price_minor"], x["currency"], x["billing"]) for x in p["premium"]["products"]}
    assert prices == {"TRIP_BUNDLE": (19900, "INR", "PER_TRIP"), "COMMUNITY_ADDON": (14900, "INR", "PER_TRIP"), "SOS_ADDON": (14900, "INR", "PER_TRIP")}
    assert any("Receive SOS" in f for f in p["free"]["features"]) and p["free"]["price_minor"] == 0
    assert p["payment_provider"] is None


def test_entitlements_never_active_without_payment_and_no_duplicates(env):
    c, (_, ah), _ = env
    r = c.post("/v1/users/me/entitlements", json={"product_code": "TRIP_BUNDLE", "trip_ref": "trip-1"}, headers=ah)
    assert r.status_code == 202 and r.json()["status"] == "PENDING_PAYMENT" and r.json()["payment_status"] == "NOT_CONFIGURED"
    assert c.post("/v1/users/me/entitlements", json={"product_code": "TRIP_BUNDLE", "trip_ref": "trip-1"}, headers=ah).status_code == 409
    assert c.post("/v1/users/me/entitlements", json={"product_code": "SOS_ADDON", "trip_ref": "trip-1"}, headers=ah).status_code == 409  # bundle covers it
    assert c.post("/v1/users/me/entitlements", json={"product_code": "SOS_ADDON", "trip_ref": "trip-2"}, headers=ah).status_code == 202
    assert c.post("/v1/users/me/entitlements", json={"product_code": "GOLD", "trip_ref": "trip-3"}, headers=ah).status_code == 422
    eid = r.json()["id"]
    assert c.delete(f"/v1/users/me/entitlements/{eid}", headers=ah).json()["status"] == "CANCELLED"
    assert c.post("/v1/users/me/entitlements", json={"product_code": "TRIP_BUNDLE", "trip_ref": "trip-1"}, headers=ah).status_code == 202
    assert all(e["status"] != "ACTIVE" for e in c.get("/v1/users/me/entitlements", headers=ah).json())


def test_safety_prefs_roundtrip(env):
    c, (_, ah), _ = env
    assert c.get("/v1/users/me/safety-prefs", headers=ah).json() == {"prefs": {}}
    body = {"prefs": {"sos_alerts": True, "missed_checkin_escalation": False}}
    assert c.put("/v1/users/me/safety-prefs", json=body, headers=ah).json() == body
    assert c.get("/v1/users/me/safety-prefs", headers=ah).json() == body
    assert c.put("/v1/users/me/safety-prefs", json={"prefs": {"bypass_dnd": True}}, headers=ah).status_code == 422
