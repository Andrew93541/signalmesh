"""Editable profile (milestone Part E).

Rules:
- Only the fields in ProfileIn can be changed through PATCH; anything else (id, role,
  verification flags, email, phone) is rejected with 422, never silently ignored.
- Email and phone changes need the current password plus a 6-digit code sent to the
  NEW address/number. No email/SMS provider is configured: in dev mode the code goes
  to the server log, otherwise it is not delivered (the API says which).
- Password change is a separate endpoint, needs the current password and signs out
  every other session.
"""

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from . import security
from .db import Database, now_iso
from .models import EmergencyContactIn, Name, check_password, normalize_email, normalize_phone

MAX_CONTACTS = 5
MAX_PHOTO_BYTES = 2 * 1024 * 1024
PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
# File signatures, so a renamed non-image is refused.
MAGIC = {"jpg": (b"\xff\xd8\xff",), "png": (b"\x89PNG\r\n\x1a\n",), "webp": (b"RIFF",)}
CODE_MINUTES = 15
Text = lambda n: Annotated[str, StringConstraints(strip_whitespace=True, max_length=n)]  # noqa: E731
Experience = Literal["NONE", "BEGINNER", "INTERMEDIATE", "EXPERIENCED", "EXPERT"]


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: Name | None = None
    travel_preferences: Text(300) | None = None
    trekking_experience: Experience | None = None
    intro: Text(500) | None = None


class ContactChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class CodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: Annotated[str, StringConstraints(pattern=r"^\d{6}$")]


class PasswordChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: str


class ContactIn(EmergencyContactIn):
    model_config = ConfigDict(extra="forbid")


def register(app: FastAPI, db: Database, settings, current_user, user_json, deliver_code, photo_dir: Path):
    photo_dir.mkdir(parents=True, exist_ok=True)

    def require_password(user_id: str, password: str):
        u = db.one("SELECT password_hash FROM users WHERE id = ?", user_id)
        if not security.verify_password(u["password_hash"], password):
            raise HTTPException(403, "Current password is incorrect.")

    def touch(user_id: str):
        db.run("UPDATE users SET updated_at = ? WHERE id = ?", now_iso(), user_id)

    # ---- profile fields ---------------------------------------------------------

    @app.patch("/v1/users/me")
    def update_profile(body: ProfileIn, auth=Depends(current_user)):
        changes = body.model_dump(exclude_unset=True)
        if "full_name" in changes and changes["full_name"] is None:
            raise HTTPException(422, "Full name cannot be empty.")
        if changes:
            cols = ", ".join(f"{k} = ?" for k in changes)  # keys come from ProfileIn only
            db.run(f"UPDATE users SET {cols}, updated_at = ? WHERE id = ?", *[v or None for v in changes.values()], now_iso(), auth[0])
        return user_json(auth[0])

    # ---- photo ------------------------------------------------------------------

    @app.put("/v1/users/me/photo")
    async def upload_photo(request: Request, auth=Depends(current_user)):
        ext = PHOTO_TYPES.get(request.headers.get("content-type", "").split(";")[0].strip())
        if not ext:
            raise HTTPException(415, "Photo must be JPEG, PNG or WebP.")
        data = await request.body()
        if not data:
            raise HTTPException(422, "Photo is empty.")
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(413, "Photo must be 2 MB or smaller.")
        if not data.startswith(MAGIC[ext]):
            raise HTTPException(415, "File is not a valid image of that type.")
        old = db.one("SELECT photo_path FROM users WHERE id = ?", auth[0])["photo_path"]
        name = f"{auth[0]}-{uuid.uuid4().hex[:8]}.{ext}"  # server-chosen name, never the client's
        (photo_dir / name).write_bytes(data)
        db.run("UPDATE users SET photo_path = ?, updated_at = ? WHERE id = ?", name, now_iso(), auth[0])
        if old:
            (photo_dir / old).unlink(missing_ok=True)
        return user_json(auth[0])

    @app.get("/v1/users/me/photo")
    def get_photo(auth=Depends(current_user)):
        name = db.one("SELECT photo_path FROM users WHERE id = ?", auth[0])["photo_path"]
        if not name or not (photo_dir / name).exists():
            raise HTTPException(404, "No photo.")
        return FileResponse(photo_dir / name, headers={"Cache-Control": "private, no-store"})

    @app.delete("/v1/users/me/photo")
    def delete_photo(auth=Depends(current_user)):
        name = db.one("SELECT photo_path FROM users WHERE id = ?", auth[0])["photo_path"]
        if name:
            (photo_dir / name).unlink(missing_ok=True)
        db.run("UPDATE users SET photo_path = NULL, updated_at = ? WHERE id = ?", now_iso(), auth[0])
        return user_json(auth[0])

    # ---- emergency contacts -----------------------------------------------------

    def own_contact(user_id: str, contact_id: str):
        c = db.one("SELECT id FROM emergency_contacts WHERE id = ? AND user_id = ?", contact_id, user_id)
        if not c:
            raise HTTPException(404, "Contact not found.")

    @app.post("/v1/users/me/emergency-contacts", status_code=201)
    def add_contact(body: ContactIn, auth=Depends(current_user)):
        n = db.one("SELECT COUNT(*) AS n FROM emergency_contacts WHERE user_id = ?", auth[0])["n"]
        if n >= MAX_CONTACTS:
            raise HTTPException(409, f"You can have at most {MAX_CONTACTS} emergency contacts.")
        db.run("INSERT INTO emergency_contacts (id, user_id, name, phone, relationship, created_at) VALUES (?, ?, ?, ?, ?, ?)",
               str(uuid.uuid4()), auth[0], body.name, body.phone, body.relationship, now_iso())
        touch(auth[0])
        return user_json(auth[0])

    @app.put("/v1/users/me/emergency-contacts/{contact_id}")
    def edit_contact(contact_id: str, body: ContactIn, auth=Depends(current_user)):
        own_contact(auth[0], contact_id)
        db.run("UPDATE emergency_contacts SET name = ?, phone = ?, relationship = ? WHERE id = ?",
               body.name, body.phone, body.relationship, contact_id)
        touch(auth[0])
        return user_json(auth[0])

    @app.delete("/v1/users/me/emergency-contacts/{contact_id}")
    def delete_contact(contact_id: str, auth=Depends(current_user)):
        own_contact(auth[0], contact_id)
        n = db.one("SELECT COUNT(*) AS n FROM emergency_contacts WHERE user_id = ?", auth[0])["n"]
        if n <= 1:
            raise HTTPException(409, "Keep at least one emergency contact. Add another before removing this one.")
        db.run("DELETE FROM emergency_contacts WHERE id = ?", contact_id)
        touch(auth[0])
        return user_json(auth[0])

    # ---- email / phone change with a code to the new address ---------------------

    def start_change(kind: Literal["email", "phone"], body: ContactChangeIn, user_id: str):
        try:
            value = normalize_email(body.value) if kind == "email" else normalize_phone(body.value)
        except ValueError as e:
            raise HTTPException(422, str(e).capitalize() + ".")
        require_password(user_id, body.current_password)
        if db.one(f"SELECT 1 FROM users WHERE {kind} = ? AND id = ?", value, user_id):
            raise HTTPException(422, f"That is already your {kind}.")
        if db.one(f"SELECT 1 FROM users WHERE {kind} = ?", value):
            raise HTTPException(409, f"Another account already uses this {kind}.")
        code, now = security.new_code(), datetime.now(timezone.utc)
        db.run("UPDATE contact_changes SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL", now_iso(), user_id, kind)
        db.run("INSERT INTO contact_changes (user_id, kind, new_value, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
               user_id, kind, value, security.token_hash(code), now_iso(), (now + timedelta(minutes=CODE_MINUTES)).isoformat())
        deliver_code(user_id, f"{kind} change", code)
        return {"status": "code_sent", "kind": kind, "expires_in_minutes": CODE_MINUTES,
                "delivery": "dev-log" if settings.dev_mode else "not-configured"}

    def confirm_change(kind: str, body: CodeIn, user_id: str):
        bad = HTTPException(400, "The code is wrong or has expired. Request a new one.")
        r = db.one("SELECT * FROM contact_changes WHERE user_id = ? AND kind = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1", user_id, kind)
        if not r or r["attempts"] >= 5 or datetime.fromisoformat(r["expires_at"]) < datetime.now(timezone.utc):
            raise bad
        if not security.same(r["code_hash"], security.token_hash(body.code)):
            db.run("UPDATE contact_changes SET attempts = attempts + 1 WHERE id = ?", r["id"])
            raise bad
        if db.one(f"SELECT 1 FROM users WHERE {kind} = ? AND id != ?", r["new_value"], user_id):
            raise HTTPException(409, f"Another account already uses this {kind}.")
        db.run(f"UPDATE users SET {kind} = ?, {kind}_verified = 1, updated_at = ? WHERE id = ?", r["new_value"], now_iso(), user_id)
        db.run("UPDATE contact_changes SET used_at = ? WHERE id = ?", now_iso(), r["id"])
        return user_json(user_id)

    @app.post("/v1/users/me/email-change")
    def email_change(body: ContactChangeIn, auth=Depends(current_user)):
        return start_change("email", body, auth[0])

    @app.post("/v1/users/me/email-change/confirm")
    def email_confirm(body: CodeIn, auth=Depends(current_user)):
        return confirm_change("email", body, auth[0])

    @app.post("/v1/users/me/phone-change")
    def phone_change(body: ContactChangeIn, auth=Depends(current_user)):
        return start_change("phone", body, auth[0])

    @app.post("/v1/users/me/phone-change/confirm")
    def phone_confirm(body: CodeIn, auth=Depends(current_user)):
        return confirm_change("phone", body, auth[0])

    # ---- password ---------------------------------------------------------------

    @app.post("/v1/users/me/password")
    def change_password(body: PasswordChangeIn, auth=Depends(current_user)):
        require_password(auth[0], body.current_password)
        email = db.one("SELECT email FROM users WHERE id = ?", auth[0])["email"]
        try:
            check_password(body.new_password, email)
        except ValueError as e:
            raise HTTPException(422, str(e).capitalize() + ".")
        if body.new_password == body.current_password:
            raise HTTPException(422, "New password must be different.")
        now = now_iso()
        db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", security.hash_password(body.new_password), now, auth[0])
        # Sign out every other device; this one stays signed in.
        db.run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash != ?", now, auth[0], auth[1])
        return {"status": "ok", "other_sessions_signed_out": True}
