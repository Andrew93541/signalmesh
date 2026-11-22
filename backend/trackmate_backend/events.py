"""FEEDS: events (increment 1 — Discover and My Events, read side).

Event lifecycle (events.status):
  DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED, plus REJECTED / SUSPENDED / CANCELLED / COMPLETED.
Participant applications (event_applications.status) are a separate state machine:
  PENDING / ACCEPTED / REJECTED / WITHDRAWN.

Public Discover lists only PUBLISHED events with PUBLIC visibility. PUBLISHED is reachable only
after an admin approved the event (later increment), so "approved and published" both hold.
The organizer's private contact is never in public responses.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse

from .db import Database

STATUSES = ("DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "SUSPENDED", "CANCELLED", "COMPLETED")
APPLICATION_STATUSES = ("PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN")
DIFFICULTIES = ("EASY", "MODERATE", "HARD", "EXPERT")
VISIBILITIES = ("PUBLIC", "UNLISTED")
PUBLIC_STATUSES = ("PUBLISHED",)

_SELECT = """
SELECT e.*, c.label AS category_label, u.full_name AS organizer_name,
       (SELECT COUNT(*) FROM event_applications a WHERE a.event_id = e.id AND a.status = 'ACCEPTED') AS seats_taken
FROM events e
JOIN event_categories c ON c.code = e.category
JOIN users u ON u.id = e.organizer_id
"""


def event_json(r, *, owner: bool = False) -> dict:
    limit = r["participant_limit"]
    taken = r["seats_taken"]
    out = {
        "id": r["id"],
        "title": r["title"],
        "description": r["description"],
        "category": {"code": r["category"], "label": r["category_label"]},
        "organizer": {"id": r["organizer_id"], "name": r["organizer_name"]},  # name only; contact is private
        "start_location": r["start_location"],
        "destination": r["destination"],
        "start_lat": r["start_lat"],
        "start_lon": r["start_lon"],
        "start_at": r["start_at"],
        "end_at": r["end_at"],
        "duration_minutes": r["duration_minutes"],
        "difficulty": r["difficulty"],
        "participant_limit": limit,
        "seats_taken": taken,
        "seats_available": None if limit is None else max(0, limit - taken),
        "price_minor": r["price_minor"],
        "currency": r["currency"],
        "requirements": r["requirements"],
        "visibility": r["visibility"],
        "status": r["status"],
        "has_cover": bool(r["cover_path"]),
        "published_at": r["published_at"],
        "updated_at": r["updated_at"],
    }
    if owner:
        out.update({
            "organizer_contact": r["organizer_contact"],
            "approval_mode": r["approval_mode"],
            "status_reason": r["status_reason"],
            "submitted_at": r["submitted_at"],
            "reviewed_at": r["reviewed_at"],
            "created_at": r["created_at"],
        })
    return out


def register(app: FastAPI, db: Database, settings, current_user):
    cover_dir = Path(settings.photo_dir).parent / "event-covers"

    def optional_user(request: Request) -> str | None:
        if not request.headers.get("authorization"):
            return None
        try:
            return current_user(request)[0]
        except HTTPException:
            return None

    @app.get("/v1/event-categories")
    def categories():
        return [dict(r) for r in db.all("SELECT code, label FROM event_categories ORDER BY sort")]

    @app.get("/v1/events")
    def discover(
        q: str | None = Query(None, max_length=100),
        category: str | None = Query(None, max_length=20),
        location: str | None = Query(None, max_length=100),
        date_from: str | None = Query(None, description="YYYY-MM-DD"),
        date_to: str | None = Query(None, description="YYYY-MM-DD"),
        difficulty: Literal["EASY", "MODERATE", "HARD", "EXPERT"] | None = None,
        has_seats: bool = False,
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        where = ["e.status IN ('PUBLISHED')", "e.visibility = 'PUBLIC'",
                 # past events drop out of Discover
                 "(e.end_at IS NULL OR e.end_at >= ?)"]
        args: list = [datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")]
        if q:
            where.append("(e.title LIKE ? OR e.description LIKE ?)")
            args += [f"%{q.strip()}%"] * 2
        if category:
            where.append("e.category = ?")
            args.append(category)
        if location:
            where.append("(e.start_location LIKE ? OR e.destination LIKE ?)")
            args += [f"%{location.strip()}%"] * 2
        for name, val, op in (("date_from", date_from, ">="), ("date_to", date_to, "<")):
            if val:
                try:
                    d = datetime.strptime(val, "%Y-%m-%d")
                except ValueError:
                    raise HTTPException(422, f"{name} must be YYYY-MM-DD.")
                if op == "<":
                    d += timedelta(days=1)  # inclusive end date
                where.append(f"e.start_at {op} ?")
                args.append(d.strftime("%Y-%m-%dT00:00:00"))
        if difficulty:
            where.append("e.difficulty = ?")
            args.append(difficulty)
        sql = _SELECT + " WHERE " + " AND ".join(where)
        if has_seats:
            sql = f"SELECT * FROM ({sql}) WHERE participant_limit IS NULL OR seats_taken < participant_limit"
        rows = db.all(sql + " ORDER BY start_at IS NULL, start_at LIMIT ? OFFSET ?", *args, limit, offset)
        return [event_json(r) for r in rows]

    @app.get("/v1/events/mine")
    def my_events(auth=Depends(current_user)):
        rows = db.all(_SELECT + " WHERE e.organizer_id = ? ORDER BY e.updated_at DESC", auth[0])
        return [event_json(r, owner=True) for r in rows]

    def visible_row(event_id: str, user_id: str | None):
        r = db.one(_SELECT + " WHERE e.id = ?", event_id)
        if not r:
            raise HTTPException(404, "Event not found.")
        if r["organizer_id"] == user_id:
            return r, True
        if r["status"] not in PUBLIC_STATUSES:  # drafts, pending, rejected… only for the organizer
            raise HTTPException(404, "Event not found.")
        return r, False

    @app.get("/v1/events/{event_id}")
    def event_detail(event_id: str, request: Request):
        r, owner = visible_row(event_id, optional_user(request))
        return event_json(r, owner=owner)

    @app.get("/v1/events/{event_id}/cover")
    def event_cover(event_id: str, request: Request):
        r, _ = visible_row(event_id, optional_user(request))
        if not r["cover_path"] or not (cover_dir / r["cover_path"]).exists():
            raise HTTPException(404, "No cover image.")
        return FileResponse(cover_dir / r["cover_path"], headers={"Cache-Control": "public, max-age=300"})
