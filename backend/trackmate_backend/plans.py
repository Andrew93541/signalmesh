"""Free plan, per-trip Premium products, entitlements; and synced safety preferences.

No payment provider is configured. Choosing a Premium product creates an entitlement in
PENDING_PAYMENT with payment_status NOT_CONFIGURED: it never becomes ACTIVE and nothing
claims a payment succeeded. Emergency features (receiving SOS, relaying, SOS queue) are in
the Free plan and are never gated.
"""

import json
import uuid
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, StringConstraints

from .db import Database, now_iso

FREE_FEATURES = [
    "Free account registration and verification",
    "Core trekking: plan a trek, start tracking, basecamp check-ins",
    "Health and activity analytics where your phone supports it",
    "Receive SOS alerts from people near you",
    "Receive and relay Bluetooth SOS signals",
    "Basic profile and public feed access",
]
SAFETY_KEYS = {
    "sos_alerts", "emergency_notification", "emergency_sound", "emergency_vibration", "checkin_reminders",
    "missed_checkin_escalation", "gps_during_trek", "offline_sos_queue", "trusted_contact_notifications",
}
LIVE = ("PENDING_PAYMENT", "ACTIVE")


class EntitlementIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_code: Annotated[str, StringConstraints(max_length=40)]
    trip_ref: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class SafetyPrefsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prefs: dict[str, bool]


def register(app: FastAPI, db: Database, current_user):
    def products():
        return [{**dict(r), "includes": json.loads(r["includes"])} for r in db.all("SELECT * FROM plan_products ORDER BY sort")]

    @app.get("/v1/plans")
    def plans():
        return {
            "free": {"name": "Free", "price_minor": 0, "currency": "INR", "features": FREE_FEATURES},
            "premium": {"name": "Premium", "billing": "PER_TRIP", "products": products()},
            "payment_provider": None,  # none configured: purchases cannot complete yet
        }

    def ent_json(r) -> dict:
        return {k: r[k] for k in ("id", "trip_ref", "product_code", "status", "payment_status", "valid_from", "valid_until", "created_at")}

    @app.get("/v1/users/me/entitlements")
    def my_entitlements(auth=Depends(current_user)):
        return [ent_json(r) for r in db.all("SELECT * FROM trip_entitlements WHERE user_id = ? ORDER BY created_at DESC", auth[0])]

    @app.post("/v1/users/me/entitlements", status_code=202)
    def start_purchase(body: EntitlementIn, auth=Depends(current_user)):
        p = db.one("SELECT * FROM plan_products WHERE code = ?", body.product_code)
        if not p:
            raise HTTPException(422, "Unknown product.")
        wanted = set(json.loads(p["includes"])) - {"GROUP_PASS_3"}
        live = db.all(
            f"SELECT e.product_code, pp.includes FROM trip_entitlements e JOIN plan_products pp ON pp.code = e.product_code "
            f"WHERE e.user_id = ? AND e.trip_ref = ? AND e.status IN {LIVE}", auth[0], body.trip_ref)
        for r in live:
            if wanted & set(json.loads(r["includes"])):
                raise HTTPException(409, "This trip already has that access (or a pending purchase for it).")
        eid, now = str(uuid.uuid4()), now_iso()
        db.run("INSERT INTO trip_entitlements (id, user_id, trip_ref, product_code, status, payment_status, created_at, updated_at) "
               "VALUES (?, ?, ?, ?, 'PENDING_PAYMENT', 'NOT_CONFIGURED', ?, ?)", eid, auth[0], body.trip_ref, body.product_code, now, now)
        return {**ent_json(db.one("SELECT * FROM trip_entitlements WHERE id = ?", eid)),
                "message": "Payments are not set up yet. Nothing was charged and this access is not active."}

    @app.delete("/v1/users/me/entitlements/{eid}")
    def cancel_pending(eid: str, auth=Depends(current_user)):
        r = db.one("SELECT * FROM trip_entitlements WHERE id = ? AND user_id = ?", eid, auth[0])
        if not r:
            raise HTTPException(404, "Not found.")
        if r["status"] != "PENDING_PAYMENT":
            raise HTTPException(409, "Only a pending purchase can be cancelled here.")
        db.run("UPDATE trip_entitlements SET status = 'CANCELLED', updated_at = ? WHERE id = ?", now_iso(), eid)
        return ent_json(db.one("SELECT * FROM trip_entitlements WHERE id = ?", eid))

    # ---- safety preferences (in-app choices only; Android permissions are separate) ----------

    @app.get("/v1/users/me/safety-prefs")
    def get_safety(auth=Depends(current_user)):
        raw = db.one("SELECT safety_prefs FROM users WHERE id = ?", auth[0])["safety_prefs"]
        return {"prefs": json.loads(raw) if raw else {}}

    @app.put("/v1/users/me/safety-prefs")
    def put_safety(body: SafetyPrefsIn, auth=Depends(current_user)):
        unknown = set(body.prefs) - SAFETY_KEYS
        if unknown:
            raise HTTPException(422, f"Unknown setting: {', '.join(sorted(unknown))}")
        db.run("UPDATE users SET safety_prefs = ? WHERE id = ?", json.dumps(body.prefs), auth[0])
        return {"prefs": body.prefs}
