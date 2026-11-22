"""Direct messages between TrackMate users.

Who can message whom: you can start a conversation with someone who follows you, or with
someone you both follow each other with. Once a conversation exists either side can reply,
unless one has blocked the other. Messages are private to the two people; nothing here is
shown on public profiles.
"""

import uuid
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, StringConstraints

from .db import Database, now_iso

PAGE = 30


class StartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


def register(app: FastAPI, db: Database, current_user):
    def me(auth=Depends(current_user)) -> str:
        return auth[0]

    def blocked(a: str, b: str) -> bool:
        return bool(db.one("SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", a, b, b, a))

    def follows(a: str, b: str) -> bool:
        return bool(db.one("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", a, b))

    def can_start(viewer: str, other: str) -> bool:
        # They follow you (they opted in to you), or you follow each other.
        return follows(other, viewer)

    def other_of(c, viewer: str) -> str:
        return c["user_b"] if c["user_a"] == viewer else c["user_a"]

    def mine(conv_id: str, viewer: str):
        c = db.one("SELECT * FROM conversations WHERE id = ? AND (user_a = ? OR user_b = ?)", conv_id, viewer, viewer)
        if not c:
            raise HTTPException(404, "Conversation not found.")
        return c

    def conv_json(c, viewer: str) -> dict:
        o = db.one("SELECT id, full_name, username, photo_path FROM users WHERE id = ?", other_of(c, viewer))
        last = db.one("SELECT sender_id, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1", c["id"])
        unread = db.one("SELECT COUNT(*) n FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL", c["id"], viewer)["n"]
        return {
            "id": c["id"],
            "other": {"id": o["id"], "name": o["full_name"], "username": o["username"], "has_photo": bool(o["photo_path"])},
            "last_message": dict(last) if last else None,
            "unread": unread,
            "blocked": blocked(viewer, o["id"]),
            "updated_at": c["last_message_at"] or c["created_at"],
        }

    def msg_json(m, viewer: str) -> dict:
        return {"id": m["id"], "body": m["body"], "created_at": m["created_at"], "mine": m["sender_id"] == viewer, "read_at": m["read_at"]}

    @app.get("/v1/conversations")
    def inbox(viewer: str = Depends(me)):
        rows = db.all("SELECT * FROM conversations WHERE (user_a = ? OR user_b = ?) AND last_message_at IS NOT NULL "
                      "ORDER BY last_message_at DESC LIMIT 100", viewer, viewer)
        return [conv_json(c, viewer) for c in rows if not blocked(viewer, other_of(c, viewer))]

    @app.get("/v1/conversations/unread-count")
    def unread_count(viewer: str = Depends(me)):
        n = db.one("SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id = m.conversation_id "
                   "WHERE (c.user_a = ? OR c.user_b = ?) AND m.sender_id != ? AND m.read_at IS NULL", viewer, viewer, viewer)["n"]
        return {"unread": n}

    @app.post("/v1/conversations")
    def start(body: StartIn, viewer: str = Depends(me)):
        other = body.user_id
        if other == viewer:
            raise HTTPException(422, "You can't message yourself.")
        if not db.one("SELECT 1 FROM users WHERE id = ?", other) or blocked(viewer, other):
            raise HTTPException(404, "User not found.")
        a, b = sorted((viewer, other))
        c = db.one("SELECT * FROM conversations WHERE user_a = ? AND user_b = ?", a, b)
        if not c:
            if not can_start(viewer, other):
                raise HTTPException(403, "You can message people who follow you.")
            cid = str(uuid.uuid4())
            db.run("INSERT INTO conversations (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)", cid, a, b, now_iso())
            c = db.one("SELECT * FROM conversations WHERE id = ?", cid)
        return conv_json(c, viewer)

    @app.get("/v1/conversations/{conv_id}/messages")
    def messages(conv_id: str, before: str | None = Query(None, max_length=40), viewer: str = Depends(me)):
        mine(conv_id, viewer)
        sql, args = "SELECT * FROM messages WHERE conversation_id = ?", [conv_id]
        if before:
            sql += " AND created_at < ?"
            args.append(before)
        rows = db.all(sql + " ORDER BY created_at DESC LIMIT ?", *args, PAGE)
        return {"items": [msg_json(m, viewer) for m in reversed(rows)], "next_before": rows[-1]["created_at"] if len(rows) == PAGE else None}

    @app.post("/v1/conversations/{conv_id}/messages", status_code=201)
    def send(conv_id: str, body: MessageIn, viewer: str = Depends(me)):
        c = mine(conv_id, viewer)
        if blocked(viewer, other_of(c, viewer)):
            raise HTTPException(403, "You can't message this person.")
        mid, now = str(uuid.uuid4()), now_iso()
        db.run("INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)", mid, conv_id, viewer, body.body, now)
        db.run("UPDATE conversations SET last_message_at = ? WHERE id = ?", now, conv_id)
        return msg_json(db.one("SELECT * FROM messages WHERE id = ?", mid), viewer)

    @app.post("/v1/conversations/{conv_id}/read")
    def mark_read(conv_id: str, viewer: str = Depends(me)):
        mine(conv_id, viewer)
        db.run("UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL", now_iso(), conv_id, viewer)
        return {"status": "ok"}
