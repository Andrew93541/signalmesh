"""Community feed: posts with photos/videos, likes, comments, follows, blocks, reports,
public profiles.

Privacy rules enforced here:
- Every endpoint needs a signed-in user.
- Public profile/post JSON never includes email, phone, emergency contacts or account flags.
- A post carries coordinates only when its author explicitly chose to share them.
- Blocking hides both people from each other everywhere and removes follows both ways.
- Media files are stored on disk under a server-chosen name; type and size are checked,
  including the file signature, before anything is kept.
"""

import json
import re
import uuid
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .db import Database, now_iso

IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
VIDEO_TYPES = {"video/mp4": "mp4", "video/quicktime": "mov"}
MAX_IMAGE = 10 * 1024 * 1024
MAX_VIDEO = 60 * 1024 * 1024
MAX_MEDIA_PER_POST = 10
PAGE = 20


def _signature_ok(ext: str, head: bytes) -> bool:
    if ext == "jpg":
        return head.startswith(b"\xff\xd8\xff")
    if ext == "png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == "webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if ext in ("mp4", "mov"):
        return head[4:8] == b"ftyp"
    return False


Text = lambda n: Annotated[str, StringConstraints(strip_whitespace=True, max_length=n)]  # noqa: E731


class PostIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: Text(2200) = ""
    location_name: Text(100) | None = None
    share_location: bool = False  # exact coordinates are opt-in per post
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    media_ids: list[str] = Field(min_length=1, max_length=MAX_MEDIA_PER_POST)

    @model_validator(mode="after")
    def _coords(self):
        if self.share_location and (self.latitude is None or self.longitude is None):
            raise ValueError("coordinates are required when share_location is true")
        return self


class PostPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: Text(2200) | None = None
    location_name: Text(100) | None = None
    share_location: Literal[False] | None = None  # can only be turned off after posting


class CommentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class ReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_type: Literal["POST", "COMMENT", "USER", "EVENT"]
    target_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    reason: Literal["SPAM", "HARASSMENT", "INAPPROPRIATE", "DANGEROUS", "FALSE_INFORMATION", "OTHER"]
    details: Text(500) | None = None


def register(app: FastAPI, db: Database, settings, current_user):
    media_dir = Path(settings.photo_dir).parent / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    photo_dir = Path(settings.photo_dir)

    def me(auth=Depends(current_user)) -> str:
        return auth[0]

    # ---- helpers --------------------------------------------------------------------

    def blocked_between(a: str, b: str) -> bool:
        return bool(db.one("SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", a, b, b, a))

    def public_user(u) -> dict:
        """Only public fields. Never email, phone, emergency contacts or role."""
        return {"id": u["id"], "name": u["full_name"], "username": u["username"], "has_photo": bool(u["photo_path"])}

    def post_json(p, viewer: str) -> dict:
        author = db.one("SELECT id, full_name, username, photo_path FROM users WHERE id = ?", p["user_id"])
        media = db.all("SELECT id, kind, mime FROM media WHERE post_id = ? ORDER BY sort", p["id"])
        likes = db.one("SELECT COUNT(*) n FROM post_likes WHERE post_id = ?", p["id"])["n"]
        comments = db.one(
            "SELECT COUNT(*) n FROM post_comments c WHERE c.post_id = ? AND c.deleted_at IS NULL AND NOT EXISTS "
            "(SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = c.user_id) OR (b.blocker_id = c.user_id AND b.blocked_id = ?))",
            p["id"], viewer, viewer)["n"]
        return {
            "id": p["id"],
            "author": public_user(author),
            "caption": p["caption"],
            "location_name": p["location_name"],
            "latitude": p["latitude"],  # only set when the author chose to share exact coordinates
            "longitude": p["longitude"],
            "media": [dict(m) for m in media],
            "like_count": likes,
            "comment_count": comments,
            "liked_by_me": bool(db.one("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?", p["id"], viewer)),
            "is_mine": p["user_id"] == viewer,
            "created_at": p["created_at"],
            "updated_at": p["updated_at"],
        }

    def visible_post(post_id: str, viewer: str):
        p = db.one("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL", post_id)
        if not p or blocked_between(viewer, p["user_id"]):
            raise HTTPException(404, "Post not found.")
        return p

    def own_post(post_id: str, viewer: str):
        p = visible_post(post_id, viewer)
        if p["user_id"] != viewer:
            raise HTTPException(403, "You can only change your own posts.")
        return p

    def page(rows, key="created_at"):
        return {"items": rows, "next_before": rows[-1][key] if len(rows) == PAGE else None}

    # ---- media --------------------------------------------------------------------------

    @app.post("/v1/media", status_code=201)
    async def upload_media(request: Request, viewer: str = Depends(me)):
        mime = request.headers.get("content-type", "").split(";")[0].strip().lower()
        ext = IMAGE_TYPES.get(mime) or VIDEO_TYPES.get(mime)
        if not ext:
            raise HTTPException(415, "Upload a JPEG, PNG or WebP photo, or an MP4/MOV video.")
        kind = "IMAGE" if mime in IMAGE_TYPES else "VIDEO"
        limit = MAX_IMAGE if kind == "IMAGE" else MAX_VIDEO
        mid = str(uuid.uuid4())
        name = f"{mid}.{ext}"
        dest = media_dir / name
        size, head = 0, b""
        try:
            with dest.open("wb") as f:
                async for chunk in request.stream():  # streamed to disk, never held whole in memory
                    size += len(chunk)
                    if size > limit:
                        raise HTTPException(413, f"{'Photos' if kind == 'IMAGE' else 'Videos'} must be {limit // (1024 * 1024)} MB or smaller.")
                    if len(head) < 16:
                        head += chunk[: 16 - len(head)]
                    f.write(chunk)
            if size == 0:
                raise HTTPException(422, "The file is empty.")
            if not _signature_ok(ext, head):
                raise HTTPException(415, "The file is not a valid file of that type.")
        except HTTPException:
            dest.unlink(missing_ok=True)
            raise
        db.run("INSERT INTO media (id, owner_id, kind, mime, size_bytes, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
               mid, viewer, kind, mime, size, name, now_iso())
        return {"id": mid, "kind": kind, "mime": mime, "size_bytes": size}

    @app.get("/v1/media/{media_id}")
    def get_media(media_id: str, viewer: str = Depends(me)):
        m = db.one("SELECT m.*, p.user_id AS author, p.deleted_at FROM media m LEFT JOIN posts p ON p.id = m.post_id WHERE m.id = ?", media_id)
        if not m:
            raise HTTPException(404, "Not found.")
        if m["owner_id"] != viewer and (m["post_id"] is None or m["deleted_at"] or blocked_between(viewer, m["author"])):
            raise HTTPException(404, "Not found.")
        return FileResponse(media_dir / m["path"], media_type=m["mime"], headers={"Cache-Control": "private, max-age=3600"})

    # ---- posts ----------------------------------------------------------------------------

    @app.post("/v1/posts", status_code=201)
    def create_post(body: PostIn, viewer: str = Depends(me)):
        ids = list(dict.fromkeys(body.media_ids))
        rows = db.all(f"SELECT id FROM media WHERE id IN ({','.join('?' * len(ids))}) AND owner_id = ? AND post_id IS NULL", *ids, viewer)
        if len(rows) != len(ids):
            raise HTTPException(422, "Some media is missing, already used, or not yours. Upload it again.")
        pid, now = str(uuid.uuid4()), now_iso()
        with db.lock:
            db.run("BEGIN")
            try:
                db.run("INSERT INTO posts (id, user_id, caption, location_name, latitude, longitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                       pid, viewer, body.caption, body.location_name or None,
                       body.latitude if body.share_location else None, body.longitude if body.share_location else None, now, now)
                for i, mid in enumerate(ids):
                    db.run("UPDATE media SET post_id = ?, sort = ? WHERE id = ?", pid, i, mid)
                db.run("COMMIT")
            except Exception:
                db.run("ROLLBACK")
                raise
        return post_json(visible_post(pid, viewer), viewer)

    @app.get("/v1/posts/{post_id}")
    def get_post(post_id: str, viewer: str = Depends(me)):
        return post_json(visible_post(post_id, viewer), viewer)

    @app.patch("/v1/posts/{post_id}")
    def edit_post(post_id: str, body: PostPatch, viewer: str = Depends(me)):
        own_post(post_id, viewer)
        ch = body.model_dump(exclude_unset=True)
        if "caption" in ch:
            db.run("UPDATE posts SET caption = ? WHERE id = ?", ch["caption"] or "", post_id)
        if "location_name" in ch:
            db.run("UPDATE posts SET location_name = ? WHERE id = ?", ch["location_name"] or None, post_id)
        if ch.get("share_location") is False:
            db.run("UPDATE posts SET latitude = NULL, longitude = NULL WHERE id = ?", post_id)
        db.run("UPDATE posts SET updated_at = ? WHERE id = ?", now_iso(), post_id)
        return post_json(visible_post(post_id, viewer), viewer)

    @app.delete("/v1/posts/{post_id}")
    def delete_post(post_id: str, viewer: str = Depends(me)):
        own_post(post_id, viewer)
        for m in db.all("SELECT path FROM media WHERE post_id = ?", post_id):
            (media_dir / m["path"]).unlink(missing_ok=True)
        db.run("DELETE FROM media WHERE post_id = ?", post_id)
        db.run("UPDATE posts SET deleted_at = ?, caption = '', latitude = NULL, longitude = NULL WHERE id = ?", now_iso(), post_id)
        return {"status": "deleted"}

    @app.get("/v1/feed")
    def feed(scope: Literal["discover", "following"] = "discover", before: str | None = Query(None, max_length=40), viewer: str = Depends(me)):
        sql = ("SELECT p.* FROM posts p WHERE p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM blocks b WHERE "
               "(b.blocker_id = ? AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = ?))")
        args: list = [viewer, viewer]
        if scope == "following":
            sql += " AND p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)"
            args.append(viewer)
        if before:
            sql += " AND p.created_at < ?"
            args.append(before)
        rows = db.all(sql + " ORDER BY p.created_at DESC LIMIT ?", *args, PAGE)
        return page([post_json(r, viewer) for r in rows])

    # ---- likes & comments ----------------------------------------------------------------------

    @app.post("/v1/posts/{post_id}/like")
    def like(post_id: str, viewer: str = Depends(me)):
        visible_post(post_id, viewer)
        db.run("INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)", post_id, viewer, now_iso())
        return post_json(visible_post(post_id, viewer), viewer)

    @app.delete("/v1/posts/{post_id}/like")
    def unlike(post_id: str, viewer: str = Depends(me)):
        visible_post(post_id, viewer)
        db.run("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", post_id, viewer)
        return post_json(visible_post(post_id, viewer), viewer)

    def comment_json(c, post_owner: str, viewer: str) -> dict:
        u = db.one("SELECT id, full_name, username, photo_path FROM users WHERE id = ?", c["user_id"])
        return {"id": c["id"], "author": public_user(u), "body": c["body"], "created_at": c["created_at"],
                "can_delete": viewer in (c["user_id"], post_owner)}

    @app.get("/v1/posts/{post_id}/comments")
    def comments(post_id: str, viewer: str = Depends(me)):
        p = visible_post(post_id, viewer)
        rows = db.all(
            "SELECT * FROM post_comments c WHERE c.post_id = ? AND c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM blocks b WHERE "
            "(b.blocker_id = ? AND b.blocked_id = c.user_id) OR (b.blocker_id = c.user_id AND b.blocked_id = ?)) ORDER BY c.created_at LIMIT 200",
            post_id, viewer, viewer)
        return [comment_json(c, p["user_id"], viewer) for c in rows]

    @app.post("/v1/posts/{post_id}/comments", status_code=201)
    def add_comment(post_id: str, body: CommentIn, viewer: str = Depends(me)):
        p = visible_post(post_id, viewer)
        cid = str(uuid.uuid4())
        db.run("INSERT INTO post_comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)", cid, post_id, viewer, body.body, now_iso())
        return comment_json(db.one("SELECT * FROM post_comments WHERE id = ?", cid), p["user_id"], viewer)

    @app.delete("/v1/comments/{comment_id}")
    def delete_comment(comment_id: str, viewer: str = Depends(me)):
        c = db.one("SELECT c.*, p.user_id AS post_owner FROM post_comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ? AND c.deleted_at IS NULL", comment_id)
        if not c:
            raise HTTPException(404, "Comment not found.")
        if viewer not in (c["user_id"], c["post_owner"]):
            raise HTTPException(403, "You can delete your own comments, or comments on your own posts.")
        db.run("UPDATE post_comments SET deleted_at = ?, body = '' WHERE id = ?", now_iso(), comment_id)
        return {"status": "deleted"}

    # ---- people ---------------------------------------------------------------------------------

    def visible_user(user_id: str, viewer: str):
        u = db.one("SELECT * FROM users WHERE id = ?", user_id)
        if not u or (user_id != viewer and blocked_between(viewer, user_id)):
            raise HTTPException(404, "User not found.")
        return u

    @app.get("/v1/users/{user_id}/profile")
    def profile(user_id: str, viewer: str = Depends(me)):
        u = visible_user(user_id, viewer)
        n = lambda sql: db.one(sql, user_id)["n"]  # noqa: E731
        return {
            **public_user(u),
            "bio": u["intro"],
            "interests": json.loads(u["interests"]) if u["interests"] else [],
            "home_location": u["home_location"] if u["show_home_location"] else None,  # only if they chose to show it
            "posts_count": n("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND deleted_at IS NULL"),
            "followers_count": n("SELECT COUNT(*) n FROM follows WHERE followee_id = ?"),
            "following_count": n("SELECT COUNT(*) n FROM follows WHERE follower_id = ?"),
            "is_me": user_id == viewer,
            "is_following": bool(db.one("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", viewer, user_id)),
            "follows_me": bool(db.one("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", user_id, viewer)),
        }

    @app.get("/v1/users/{user_id}/photo")
    def user_photo(user_id: str, viewer: str = Depends(me)):
        u = visible_user(user_id, viewer)
        if not u["photo_path"] or not (photo_dir / u["photo_path"]).exists():
            raise HTTPException(404, "No photo.")
        return FileResponse(photo_dir / u["photo_path"], headers={"Cache-Control": "private, max-age=600"})

    @app.get("/v1/users/{user_id}/posts")
    def user_posts(user_id: str, before: str | None = Query(None, max_length=40), viewer: str = Depends(me)):
        visible_user(user_id, viewer)
        sql, args = "SELECT * FROM posts WHERE user_id = ? AND deleted_at IS NULL", [user_id]
        if before:
            sql += " AND created_at < ?"
            args.append(before)
        rows = db.all(sql + " ORDER BY created_at DESC LIMIT ?", *args, PAGE)
        return page([post_json(r, viewer) for r in rows])

    def people(sql: str, user_id: str, before: str | None, viewer: str):
        args = [user_id, viewer, viewer]
        q = sql + (" AND f.created_at < ?" if before else "") + " ORDER BY f.created_at DESC LIMIT ?"
        if before:
            args.append(before)
        rows = db.all(q, *args, PAGE)
        return page([{**public_user(r), "followed_at": r["followed_at"],
                       "is_following": bool(db.one("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", viewer, r["id"]))}
                      for r in rows], key="followed_at")

    _NOT_BLOCKED_U = ("NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))")

    @app.get("/v1/users/{user_id}/followers")
    def followers(user_id: str, before: str | None = Query(None, max_length=40), viewer: str = Depends(me)):
        visible_user(user_id, viewer)
        return people("SELECT u.*, f.created_at AS followed_at FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? AND "
                      + _NOT_BLOCKED_U, user_id, before, viewer)

    @app.get("/v1/users/{user_id}/following")
    def following(user_id: str, before: str | None = Query(None, max_length=40), viewer: str = Depends(me)):
        visible_user(user_id, viewer)
        return people("SELECT u.*, f.created_at AS followed_at FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? AND "
                      + _NOT_BLOCKED_U, user_id, before, viewer)

    @app.post("/v1/users/{user_id}/follow")
    def follow(user_id: str, viewer: str = Depends(me)):
        if user_id == viewer:
            raise HTTPException(422, "You can't follow yourself.")
        visible_user(user_id, viewer)
        db.run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", viewer, user_id, now_iso())
        return profile(user_id, viewer)

    @app.delete("/v1/users/{user_id}/follow")
    def unfollow(user_id: str, viewer: str = Depends(me)):
        db.run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", viewer, user_id)
        return {"status": "ok"}

    @app.post("/v1/users/{user_id}/block")
    def block(user_id: str, viewer: str = Depends(me)):
        if user_id == viewer:
            raise HTTPException(422, "You can't block yourself.")
        if not db.one("SELECT 1 FROM users WHERE id = ?", user_id):
            raise HTTPException(404, "User not found.")
        db.run("INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", viewer, user_id, now_iso())
        db.run("DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)", viewer, user_id, user_id, viewer)
        return {"status": "blocked"}

    @app.delete("/v1/users/{user_id}/block")
    def unblock(user_id: str, viewer: str = Depends(me)):
        db.run("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?", viewer, user_id)
        return {"status": "ok"}

    @app.get("/v1/users/me/blocks")
    def my_blocks(viewer: str = Depends(me)):
        rows = db.all("SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC", viewer)
        return [public_user(r) for r in rows]

    @app.post("/v1/reports", status_code=201)
    def report(body: ReportIn, viewer: str = Depends(me)):
        rid = str(uuid.uuid4())
        db.run("INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
               rid, viewer, body.target_type, body.target_id, body.reason, body.details, now_iso())
        return {"id": rid, "status": "received"}


USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,30}$")
