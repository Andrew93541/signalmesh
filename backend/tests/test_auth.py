import logging
import re

import pytest
from fastapi.testclient import TestClient

from trackmate_backend.config import PRIVACY_VERSION, TERMS_VERSION, Settings
from trackmate_backend.main import create_app

PASSWORD = "trail-walker-2026"
CONSENTS = [
    {"type": "TERMS_OF_SERVICE", "version": TERMS_VERSION, "accepted": True},
    {"type": "PRIVACY_POLICY", "version": PRIVACY_VERSION, "accepted": True},
]


def reg(**over):
    body = {
        "full_name": "Ravi Kumar",
        "email": "Ravi@Example.com",
        "phone": "+91 98765 43210",
        "password": PASSWORD,
        "emergency_contact": {"name": "Asha Kumar", "phone": "+91 91234 56789", "relationship": "FAMILY"},
        "consents": CONSENTS,
    }
    body.update(over)
    return body


@pytest.fixture
def make(tmp_path):
    def _make(**kw):
        return TestClient(create_app(Settings(db_path=str(tmp_path / "b.db"), **kw)))
    return _make


@pytest.fixture
def client(make):
    with make() as c:
        yield c


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_register_returns_session_and_records_everything(client):
    r = client.post("/v1/auth/register", json=reg())
    assert r.status_code == 201
    body = r.json()
    u = body["user"]
    assert u["email"] == "ravi@example.com" and u["phone"] == "+919876543210"
    assert u["email_verified"] is False and u["phone_verified"] is False  # no provider: never claimed
    assert u["emergency_contacts"][0]["name"] == "Asha Kumar" and u["emergency_contacts"][0]["phone"] == "+919123456789"
    types = {(c["consent_type"], c["document_version"], c["accepted"]) for c in u["consents"]}
    assert types == {("TERMS_OF_SERVICE", TERMS_VERSION, True), ("PRIVACY_POLICY", PRIVACY_VERSION, True)}
    assert all(c["recorded_at"] for c in u["consents"])
    assert client.get("/v1/auth/me", headers=auth(body["token"])).json()["id"] == u["id"]


def test_password_is_hashed_and_token_not_stored(client):
    token = client.post("/v1/auth/register", json=reg()).json()["token"]
    db = client.app.state.db
    stored = db.one("SELECT password_hash FROM users").__getitem__(0)
    assert stored.startswith("$argon2id$") and PASSWORD not in stored
    rows = [dict(r) for r in db.all("SELECT * FROM sessions")]
    assert token not in str(rows)  # only the hash is stored


def test_terms_required_and_other_consents_not_bundled(client):
    r = client.post("/v1/auth/register", json=reg(consents=[CONSENTS[0]]))
    assert r.status_code == 422 and "privacy" in r.json()["detail"]
    r = client.post("/v1/auth/register", json=reg(consents=[{**CONSENTS[0], "version": "old"}, CONSENTS[1]]))
    assert r.status_code == 422
    r = client.post("/v1/auth/register", json=reg(consents=CONSENTS + [{"type": "LOCATION_TRIP_SHARING", "version": "x", "accepted": True}]))
    assert r.status_code == 422 and "registration" in r.json()["detail"]


@pytest.mark.parametrize("bad", [
    {"email": "not-an-email"},
    {"phone": "123"},
    {"phone": "+919000000001test.trekker@example.com"},  # found on device: letters must not be stripped
    {"password": "short1"},
    {"password": "onlyletters-here"},
    {"password": "ravi-is-12345"},  # contains email name
    {"full_name": "R"},
    {"emergency_contact": {"name": "Asha", "phone": "12", "relationship": "FAMILY"}},
    {"emergency_contact": {"name": "Asha", "phone": "+919123456789", "relationship": "BOSS"}},
])
def test_validation(client, bad):
    assert client.post("/v1/auth/register", json=reg(**bad)).status_code == 422


def test_duplicate_email_or_phone(client):
    client.post("/v1/auth/register", json=reg())
    assert client.post("/v1/auth/register", json=reg(phone="+919999999999")).status_code == 409
    assert client.post("/v1/auth/register", json=reg(email="other@example.com")).status_code == 409


def test_login_by_email_or_phone_and_generic_errors(client):
    client.post("/v1/auth/register", json=reg())
    assert client.post("/v1/auth/login", json={"identifier": "RAVI@example.com", "password": PASSWORD}).status_code == 200
    assert client.post("/v1/auth/login", json={"identifier": "+91 98765 43210", "password": PASSWORD}).status_code == 200
    wrong = client.post("/v1/auth/login", json={"identifier": "ravi@example.com", "password": "nope-12345"})
    unknown = client.post("/v1/auth/login", json={"identifier": "ghost@example.com", "password": "nope-12345"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()  # does not reveal whether the account exists


def test_lockout_after_repeated_failures(client):
    client.post("/v1/auth/register", json=reg())
    for _ in range(5):
        client.post("/v1/auth/login", json={"identifier": "ravi@example.com", "password": "wrong-pass-1"})
    r = client.post("/v1/auth/login", json={"identifier": "ravi@example.com", "password": PASSWORD})
    assert r.status_code == 429  # even the right password waits out the lockout


def test_logout_revokes_session(client):
    token = client.post("/v1/auth/register", json=reg()).json()["token"]
    assert client.post("/v1/auth/logout", headers=auth(token)).status_code == 200
    assert client.get("/v1/auth/me", headers=auth(token)).status_code == 401
    assert client.get("/v1/auth/me").status_code == 401


def test_session_survives_restart(tmp_path):
    s = Settings(db_path=str(tmp_path / "p.db"))
    with TestClient(create_app(s)) as c:
        token = c.post("/v1/auth/register", json=reg()).json()["token"]
    with TestClient(create_app(s)) as c:
        assert c.get("/v1/auth/me", headers=auth(token)).status_code == 200
        assert c.app.state.db.schema_version == 1


def test_forgot_and_reset_password(make, caplog):
    with make(dev_mode=True) as c, caplog.at_level(logging.WARNING, logger="trackmate.backend"):
        token = c.post("/v1/auth/register", json=reg()).json()["token"]
        same_unknown = c.post("/v1/auth/password/forgot", json={"identifier": "ghost@example.com"}).json()
        r = c.post("/v1/auth/password/forgot", json={"identifier": "ravi@example.com"}).json()
        assert r == same_unknown == {"status": "ok", "delivery": "dev-log"}  # no enumeration, code not in response
        code = re.search(r"code for user \S+: (\d{6})", caplog.text).group(1)
        assert c.post("/v1/auth/password/reset", json={"identifier": "ravi@example.com", "code": "000000" if code != "000000" else "111111", "new_password": "new-trail-2027"}).status_code == 400
        assert c.post("/v1/auth/password/reset", json={"identifier": "ravi@example.com", "code": code, "new_password": "weak"}).status_code == 422
        assert c.post("/v1/auth/password/reset", json={"identifier": "ravi@example.com", "code": code, "new_password": "new-trail-2027"}).status_code == 200
        assert c.get("/v1/auth/me", headers=auth(token)).status_code == 401  # old sessions revoked
        assert c.post("/v1/auth/login", json={"identifier": "ravi@example.com", "password": "new-trail-2027"}).status_code == 200
        assert c.post("/v1/auth/password/reset", json={"identifier": "ravi@example.com", "code": code, "new_password": "again-trail-2028"}).status_code == 400  # single use


def test_reset_codes_not_logged_outside_dev_mode(make, caplog):
    with make() as c, caplog.at_level(logging.WARNING, logger="trackmate.backend"):
        c.post("/v1/auth/register", json=reg())
        assert c.post("/v1/auth/password/forgot", json={"identifier": "ravi@example.com"}).json()["delivery"] == "not-configured"
        assert not re.search(r"\b\d{6}\b", caplog.text)


def test_auth_rate_limit_per_ip(make):
    with make(auth_rate_per_minute=3) as c:
        codes = [c.post("/v1/auth/login", json={"identifier": "a@b.co", "password": "x"}).status_code for _ in range(4)]
        assert codes[-1] == 429
        assert c.get("/health").status_code == 200  # non-auth routes unaffected
