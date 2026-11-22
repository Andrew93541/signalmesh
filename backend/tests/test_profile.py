import logging
import re

import pytest
from fastapi.testclient import TestClient

from trackmate_backend.config import Settings
from trackmate_backend.main import create_app

from .test_auth import PASSWORD, auth, reg

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
def make(tmp_path):
    def _make(**kw):
        return TestClient(create_app(Settings(db_path=str(tmp_path / "p.db"), photo_dir=str(tmp_path / "photos"), **kw)))
    return _make


@pytest.fixture
def user(make):
    with make(dev_mode=True) as c:
        r = c.post("/v1/auth/register", json=reg())
        yield c, r.json()["token"], r.json()["user"]


def code_from(caplog, purpose):
    return re.findall(rf"{purpose} code for user \S+: (\d{{6}})", caplog.text)[-1]


def test_edit_profile_fields_persist_across_logout_and_login(user):
    c, tok, _ = user
    body = {"full_name": "Ravi K", "travel_preferences": "Himalayan treks, monsoon off", "trekking_experience": "INTERMEDIATE", "intro": "Hi!"}
    r = c.patch("/v1/users/me", json=body, headers=auth(tok))
    assert r.status_code == 200 and r.json()["updated_at"]
    c.post("/v1/auth/logout", headers=auth(tok))
    tok2 = c.post("/v1/auth/login", json={"identifier": "ravi@example.com", "password": PASSWORD}).json()["token"]
    me = c.get("/v1/auth/me", headers=auth(tok2)).json()
    assert {k: me[k] for k in body} == body


@pytest.mark.parametrize("field,value", [("id", "x"), ("role", "admin"), ("email_verified", True), ("phone_verified", True),
                                         ("email", "new@example.com"), ("phone", "+911111111111"), ("permissions", ["all"])])
def test_protected_fields_are_rejected_not_ignored(user, field, value):
    c, tok, before = user
    r = c.patch("/v1/users/me", json={field: value}, headers=auth(tok))
    assert r.status_code == 422
    me = c.get("/v1/auth/me", headers=auth(tok)).json()
    assert (me["id"], me["role"], me["email"], me["phone"], me["email_verified"]) == \
        (before["id"], "user", before["email"], before["phone"], False)


@pytest.mark.parametrize("body", [{"full_name": "R"}, {"full_name": None}, {"intro": "x" * 501}, {"trekking_experience": "GOD"}])
def test_profile_validation(user, body):
    c, tok, _ = user
    assert c.patch("/v1/users/me", json=body, headers=auth(tok)).status_code == 422


def test_profile_needs_sign_in(user):
    c, _, _ = user
    assert c.patch("/v1/users/me", json={"intro": "x"}).status_code == 401
    assert c.post("/v1/users/me/password", json={"current_password": PASSWORD, "new_password": "another-pass-99"}).status_code == 401


def test_photo_upload_type_size_and_owner_only(user, make):
    c, tok, _ = user
    assert c.put("/v1/users/me/photo", content=PNG, headers={**auth(tok), "Content-Type": "image/png"}).json()["has_photo"] is True
    assert c.get("/v1/users/me/photo", headers=auth(tok)).content == PNG
    assert c.get("/v1/users/me/photo").status_code == 401
    assert c.put("/v1/users/me/photo", content=b"not an image", headers={**auth(tok), "Content-Type": "image/png"}).status_code == 415
    assert c.put("/v1/users/me/photo", content=PNG, headers={**auth(tok), "Content-Type": "text/html"}).status_code == 415
    big = b"\xff\xd8\xff" + b"0" * (2 * 1024 * 1024)
    assert c.put("/v1/users/me/photo", content=big, headers={**auth(tok), "Content-Type": "image/jpeg"}).status_code == 413
    assert c.delete("/v1/users/me/photo", headers=auth(tok)).json()["has_photo"] is False
    assert c.get("/v1/users/me/photo", headers=auth(tok)).status_code == 404


def test_multiple_emergency_contacts(user):
    c, tok, u = user
    first = u["emergency_contacts"][0]["id"]
    assert c.delete(f"/v1/users/me/emergency-contacts/{first}", headers=auth(tok)).status_code == 409  # keep at least one
    me = c.post("/v1/users/me/emergency-contacts", json={"name": "Neha", "phone": "+91 90000 11111", "relationship": "FRIEND"}, headers=auth(tok)).json()
    assert [x["name"] for x in me["emergency_contacts"]] == ["Asha Kumar", "Neha"]
    second = me["emergency_contacts"][1]["id"]
    me = c.put(f"/v1/users/me/emergency-contacts/{second}", json={"name": "Neha S", "phone": "+919000011111", "relationship": "TRAVEL_BUDDY"}, headers=auth(tok)).json()
    assert me["emergency_contacts"][1]["relationship"] == "TRAVEL_BUDDY"
    assert c.post("/v1/users/me/emergency-contacts", json={"name": "Bad", "phone": "call me", "relationship": "FRIEND"}, headers=auth(tok)).status_code == 422
    assert c.delete(f"/v1/users/me/emergency-contacts/{first}", headers=auth(tok)).status_code == 200
    for i in range(4):
        c.post("/v1/users/me/emergency-contacts", json={"name": f"C{i}x", "phone": f"+9190000222{i}0", "relationship": "OTHER"}, headers=auth(tok))
    assert c.post("/v1/users/me/emergency-contacts", json={"name": "Six", "phone": "+919000033333", "relationship": "OTHER"}, headers=auth(tok)).status_code == 409


def test_cannot_touch_another_users_contact(user):
    c, tok, _ = user
    other = c.post("/v1/auth/register", json=reg(email="b@example.com", phone="+919800000001")).json()
    theirs = other["user"]["emergency_contacts"][0]["id"]
    assert c.delete(f"/v1/users/me/emergency-contacts/{theirs}", headers=auth(tok)).status_code == 404
    assert c.put(f"/v1/users/me/emergency-contacts/{theirs}", json={"name": "Hijack", "phone": "+919000000000", "relationship": "OTHER"}, headers=auth(tok)).status_code == 404


def test_email_change_needs_password_and_code(user, caplog):
    c, tok, _ = user
    with caplog.at_level(logging.WARNING, logger="trackmate.backend"):
        assert c.post("/v1/users/me/email-change", json={"value": "new@example.com", "current_password": "wrong-pass-1"}, headers=auth(tok)).status_code == 403
        r = c.post("/v1/users/me/email-change", json={"value": "New@Example.com", "current_password": PASSWORD}, headers=auth(tok))
        assert r.status_code == 200 and "code" not in r.json() and r.json()["delivery"] == "dev-log"
        assert c.get("/v1/auth/me", headers=auth(tok)).json()["email"] == "ravi@example.com"  # unchanged until confirmed
        assert c.post("/v1/users/me/email-change/confirm", json={"code": "000000"}, headers=auth(tok)).status_code in (400,)
        me = c.post("/v1/users/me/email-change/confirm", json={"code": code_from(caplog, "email change")}, headers=auth(tok)).json()
    assert me["email"] == "new@example.com" and me["email_verified"] is True
    assert c.post("/v1/auth/login", json={"identifier": "new@example.com", "password": PASSWORD}).status_code == 200


def test_phone_change_otp_and_uniqueness(user, caplog):
    c, tok, _ = user
    c.post("/v1/auth/register", json=reg(email="b@example.com", phone="+919800000001"))
    assert c.post("/v1/users/me/phone-change", json={"value": "+91 98000 00001", "current_password": PASSWORD}, headers=auth(tok)).status_code == 409
    assert c.post("/v1/users/me/phone-change", json={"value": "abc", "current_password": PASSWORD}, headers=auth(tok)).status_code == 422
    with caplog.at_level(logging.WARNING, logger="trackmate.backend"):
        c.post("/v1/users/me/phone-change", json={"value": "+91 97000 00002", "current_password": PASSWORD}, headers=auth(tok))
        for _ in range(5):
            c.post("/v1/users/me/phone-change/confirm", json={"code": "000000"}, headers=auth(tok))
        # Locked after 5 wrong tries, even with the right code.
        assert c.post("/v1/users/me/phone-change/confirm", json={"code": code_from(caplog, "phone change")}, headers=auth(tok)).status_code == 400
        c.post("/v1/users/me/phone-change", json={"value": "+91 97000 00002", "current_password": PASSWORD}, headers=auth(tok))
        me = c.post("/v1/users/me/phone-change/confirm", json={"code": code_from(caplog, "phone change")}, headers=auth(tok)).json()
    assert me["phone"] == "+919700000002" and me["phone_verified"] is True


def test_change_codes_not_logged_outside_dev_mode(make, caplog):
    with make() as c, caplog.at_level(logging.WARNING, logger="trackmate.backend"):
        tok = c.post("/v1/auth/register", json=reg()).json()["token"]
        r = c.post("/v1/users/me/email-change", json={"value": "new@example.com", "current_password": PASSWORD}, headers=auth(tok))
        assert r.json()["delivery"] == "not-configured"
        assert not re.search(r"\b\d{6}\b", caplog.text)


def test_password_change_signs_out_other_sessions(user):
    c, tok, _ = user
    other = c.post("/v1/auth/login", json={"identifier": "ravi@example.com", "password": PASSWORD}).json()["token"]
    assert c.post("/v1/users/me/password", json={"current_password": "nope-nope-1", "new_password": "another-pass-99"}, headers=auth(tok)).status_code == 403
    assert c.post("/v1/users/me/password", json={"current_password": PASSWORD, "new_password": "short1"}, headers=auth(tok)).status_code == 422
    assert c.post("/v1/users/me/password", json={"current_password": PASSWORD, "new_password": "another-pass-99"}, headers=auth(tok)).status_code == 200
    assert c.get("/v1/auth/me", headers=auth(tok)).status_code == 200
    assert c.get("/v1/auth/me", headers=auth(other)).status_code == 401
    assert c.post("/v1/auth/login", json={"identifier": "ravi@example.com", "password": PASSWORD}).status_code == 401
    assert c.post("/v1/auth/login", json={"identifier": "ravi@example.com", "password": "another-pass-99"}).status_code == 200
