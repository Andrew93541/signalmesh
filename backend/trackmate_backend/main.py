"""TrackMate backend: accounts, sessions, consents (DECISIONS.md D1).

Separate from the SignalMesh edge gateway; the gateway keeps working without it.
"""

import logging
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pathlib import Path

from . import incidents, profile, security
from .config import REQUIRED_CONSENTS, SEPARATE_CONSENTS, Settings, load_settings
from .db import Database, now_iso
from .models import ForgotIn, LoginIn, RegisterIn, ResetIn, check_password, identifier_key

log = logging.getLogger("trackmate.backend")
GENERIC_LOGIN_ERROR = "Email/phone or password is incorrect."


def _utc(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    db = Database(settings.db_path)
    app = FastAPI(title="TrackMate Backend", version="0.1.0")
    app.state.db = db
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])

    # ---- rate limiting (per client IP, auth routes only) ----------------------
    hits: dict[str, deque] = defaultdict(deque)

    @app.middleware("http")
    async def auth_rate_limit(request: Request, call_next):
        if request.url.path.startswith("/v1/auth/"):
            ip = request.client.host if request.client else "?"
            q, now = hits[ip], time.monotonic()
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= settings.auth_rate_per_minute:
                log.warning("rate limit: %s %s", ip, request.url.path)
                return JSONResponse({"detail": "Too many requests. Try again in a minute."}, status_code=429)
            q.append(now)
        return await call_next(request)

    # ---- helpers ----------------------------------------------------------------

    def user_json(user_id: str) -> dict:
        u = db.one("SELECT id, full_name, email, phone, email_verified, phone_verified, created_at, role, "
                   "travel_preferences, trekking_experience, intro, photo_path, updated_at FROM users WHERE id = ?", user_id)
        contacts = db.all("SELECT id, name, phone, relationship FROM emergency_contacts WHERE user_id = ? ORDER BY created_at", user_id)
        consents = db.all(
            "SELECT consent_type, document_version, accepted, recorded_at FROM consents WHERE user_id = ? ORDER BY id", user_id)
        return {
            "id": u["id"], "full_name": u["full_name"], "email": u["email"], "phone": u["phone"],
            "email_verified": bool(u["email_verified"]), "phone_verified": bool(u["phone_verified"]),
            "created_at": u["created_at"],
            "role": u["role"],
            "travel_preferences": u["travel_preferences"], "trekking_experience": u["trekking_experience"],
            "intro": u["intro"], "has_photo": bool(u["photo_path"]), "updated_at": u["updated_at"],
            "emergency_contacts": [dict(c) for c in contacts],
            "consents": [{**dict(c), "accepted": bool(c["accepted"])} for c in consents],
        }

    def issue_session(user_id: str) -> str:
        token = security.new_token()
        now = datetime.now(timezone.utc)
        db.run(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            security.token_hash(token), user_id, now_iso(),
            (now + timedelta(days=settings.session_days)).isoformat(timespec="seconds").replace("+00:00", "Z"),
        )
        return token

    def current_user(request: Request) -> tuple[str, str]:
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            raise HTTPException(401, "Not signed in.")
        th = security.token_hash(auth[7:].strip())
        s = db.one("SELECT user_id, expires_at, revoked_at FROM sessions WHERE token_hash = ?", th)
        if not s or s["revoked_at"] or _utc(s["expires_at"]) < datetime.now(timezone.utc):
            raise HTTPException(401, "Session expired. Please sign in again.")
        return s["user_id"], th

    def find_user(identifier: str):
        try:
            kind, value = identifier_key(identifier)
        except ValueError:
            return None, identifier.strip().lower()
        return db.one(f"SELECT * FROM users WHERE {kind} = ?", value), value

    def locked_out(key: str) -> bool:
        since = (datetime.now(timezone.utc) - timedelta(minutes=settings.lockout_minutes)).isoformat()
        n = db.one("SELECT COUNT(*) AS n FROM login_attempts WHERE identifier = ? AND ok = 0 AND at >= ?", key, since)["n"]
        return n >= settings.lockout_failures

    def deliver_code(user_id: str, purpose: str, code: str):
        # No email/SMS provider is configured. Never return codes in API responses.
        if settings.dev_mode:
            log.warning("DEV ONLY — %s code for user %s: %s (no email/SMS provider configured)", purpose, user_id, code)
        else:
            log.warning("%s code created for user %s but no email/SMS provider is configured; not delivered", purpose, user_id)

    # ---- routes -----------------------------------------------------------------

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "trackmate-backend", "schema_version": db.schema_version}

    @app.get("/v1/legal/documents")
    def legal_documents():
        return {"required": REQUIRED_CONSENTS, "separate_consents": sorted(SEPARATE_CONSENTS)}

    @app.post("/v1/auth/register", status_code=201)
    def register(body: RegisterIn, request: Request):
        accepted = {c.type: c.version for c in body.consents if c.accepted}
        missing = [t for t, v in REQUIRED_CONSENTS.items() if accepted.get(t) != v]
        if missing:
            raise HTTPException(422, f"You must accept the current {', '.join(missing).replace('_', ' ').lower()}.")
        if any(c.type not in REQUIRED_CONSENTS for c in body.consents):
            # Location, health and escalation consents are requested separately, never at sign-up.
            raise HTTPException(422, "Only the terms and privacy policy can be accepted at registration.")
        if db.one("SELECT 1 FROM users WHERE email = ?", body.email):
            raise HTTPException(409, "An account with this email already exists.")
        if db.one("SELECT 1 FROM users WHERE phone = ?", body.phone):
            raise HTTPException(409, "An account with this phone number already exists.")

        user_id, now = str(uuid.uuid4()), now_iso()
        ip = request.client.host if request.client else None
        with db.lock:
            db.run("BEGIN")
            try:
                db.run("INSERT INTO users (id, full_name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                       user_id, body.full_name, body.email, body.phone, security.hash_password(body.password), now)
                ec = body.emergency_contact
                db.run("INSERT INTO emergency_contacts (id, user_id, name, phone, relationship, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                       str(uuid.uuid4()), user_id, ec.name, ec.phone, ec.relationship, now)
                for t, v in REQUIRED_CONSENTS.items():
                    db.run("INSERT INTO consents (user_id, consent_type, document_version, accepted, recorded_at, source) VALUES (?, ?, ?, 1, ?, ?)",
                           user_id, t, v, now, f"registration ip={ip}")
                db.run("COMMIT")
            except Exception:
                db.run("ROLLBACK")
                raise
        log.info("registered user %s", user_id)
        return {"user": user_json(user_id), "token": issue_session(user_id)}

    @app.post("/v1/auth/login")
    def login(body: LoginIn, request: Request):
        user, key = find_user(body.identifier)
        ip = request.client.host if request.client else None
        if locked_out(key):
            raise HTTPException(429, f"Too many failed attempts. Try again in {settings.lockout_minutes} minutes or reset your password.")
        ok = security.verify_password(user["password_hash"] if user else None, body.password)
        db.run("INSERT INTO login_attempts (identifier, ip, ok, at) VALUES (?, ?, ?, ?)", key, ip, int(ok), now_iso())
        if user and user["role"] in incidents.RESPONDER_ROLES:
            app.state.audit({"id": user["id"], "full_name": user["full_name"]},
                            "responder.login" if ok else "responder.login_failed", user["id"], None, request)
        if not ok:
            log.info("failed login for %s from %s", key, ip)
            raise HTTPException(401, GENERIC_LOGIN_ERROR)
        if security.needs_rehash(user["password_hash"]):
            db.run("UPDATE users SET password_hash = ? WHERE id = ?", security.hash_password(body.password), user["id"])
        return {"user": user_json(user["id"]), "token": issue_session(user["id"])}

    @app.post("/v1/auth/logout")
    def logout(auth=Depends(current_user)):
        db.run("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", now_iso(), auth[1])
        return {"status": "ok"}

    @app.get("/v1/auth/me")
    def me(auth=Depends(current_user)):
        return user_json(auth[0])

    @app.post("/v1/auth/password/forgot")
    def forgot(body: ForgotIn):
        user, _ = find_user(body.identifier)
        if user:
            code = security.new_code()
            now = datetime.now(timezone.utc)
            db.run("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL", now_iso(), user["id"])
            db.run("INSERT INTO password_resets (user_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
                   user["id"], security.token_hash(code), now_iso(), (now + timedelta(minutes=15)).isoformat())
            deliver_code(user["id"], "password reset", code)
        # Same answer whether or not the account exists (no account enumeration).
        return {"status": "ok", "delivery": "dev-log" if settings.dev_mode else "not-configured"}

    @app.post("/v1/auth/password/reset")
    def reset(body: ResetIn):
        user, _ = find_user(body.identifier)
        bad = HTTPException(400, "The code is wrong or has expired. Request a new one.")
        if not user:
            raise bad
        r = db.one("SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1", user["id"])
        if not r or r["attempts"] >= 5 or datetime.fromisoformat(r["expires_at"]) < datetime.now(timezone.utc):
            raise bad
        if not security.same(r["code_hash"], security.token_hash(body.code)):
            db.run("UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?", r["id"])
            raise bad
        try:
            check_password(body.new_password, user["email"])
        except ValueError as e:
            raise HTTPException(422, str(e).capitalize() + ".")
        now = now_iso()
        db.run("UPDATE users SET password_hash = ? WHERE id = ?", security.hash_password(body.new_password), user["id"])
        db.run("UPDATE password_resets SET used_at = ? WHERE id = ?", now, r["id"])
        db.run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", now, user["id"])  # sign out everywhere
        return {"status": "ok"}

    profile.register(app, db, settings, current_user, user_json, deliver_code, Path(settings.photo_dir))
    app.state.hub = incidents.register(app, db, settings, current_user)
    return app
