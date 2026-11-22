"""Dev-only demo content for the community feed (hackathon demo).

Everything created here is clearly marked and removable:
- accounts are named "… (demo)" with emails on the reserved .test domain and an unusable password,
- photos are landscapes drawn by this file (no copied images),
- captions say they are demo posts.
`seed(...)` refuses to run outside TRACKMATE_DEV_MODE=1; `remove(...)` deletes all of it.
"""

import json
import math
import random
import secrets
import struct
import uuid
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import security
from .db import Database

DOMAIN = "demo.trackmate.test"

PEOPLE = [
    ("Asha Naik (demo)", "asha.demo", "Sahyadri weekends and monsoon waterfalls.", ["Sahyadri", "Monsoon treks", "Photography"]),
    ("Kabir Sethi (demo)", "kabir.demo", "Himalayan trails, slow travel, good chai.", ["Himalaya", "High altitude", "Camping"]),
    ("Meher Iyer (demo)", "meher.demo", "Sunrise hikes before work. Always carrying a first-aid kit.", ["Sunrise hikes", "First aid", "Day hikes"]),
    ("Rohan Pillai (demo)", "rohan.demo", "Leading beginner groups on Western Ghats forts.", ["Forts", "Group treks", "Beginners"]),
]
POSTS = [
    (0, "Demo post: mist rolling over the ridge at Rajmachi. Carry a rain cover!", "Rajmachi Fort", 0),
    (1, "Demo post: day 3 at base camp, the sky finally cleared.", "Kedarkantha base camp", 1),
    (2, "Demo post: 5:40 am, worth the alarm.", "Kalsubai summit", 2),
    (3, "Demo post: first-timers group made it to the top together.", "Harishchandragad", 3),
    (0, "Demo post: waterfall stop on the way down.", "Bhimashankar trail", 4),
    (1, "Demo post: tents up before the wind picked up.", "Tungnath meadows", 5),
]
PALETTES = [  # sky top, sky bottom, sun, ridge far, ridge near, ground
    ((52, 82, 120), (244, 188, 120), (255, 220, 150), (88, 104, 120), (52, 74, 70), (7, 92, 59)),
    ((24, 44, 90), (120, 160, 210), (255, 245, 220), (150, 170, 190), (80, 100, 120), (40, 70, 60)),
    ((255, 140, 60), (255, 220, 160), (255, 250, 200), (180, 110, 90), (110, 70, 60), (6, 69, 47)),
    ((90, 150, 210), (200, 230, 250), (255, 255, 230), (104, 181, 46), (60, 130, 50), (7, 92, 59)),
    ((70, 110, 100), (180, 210, 190), (240, 250, 230), (90, 130, 110), (50, 90, 70), (25, 56, 44)),
    ((30, 30, 70), (240, 123, 11), (255, 200, 120), (60, 50, 80), (35, 30, 50), (20, 30, 30)),
]
COMMENTS = ["Demo comment: stunning view!", "Demo comment: which route did you take?", "Demo comment: adding this to my list.", "Demo comment: great shot."]


def _png(width: int, height: int, rows: list[bytes]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + r for r in rows)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")


def landscape(seed: int, size: int = 640) -> bytes:
    """A simple mountain landscape: gradient sky, sun, two ridges, forest floor."""
    sky_t, sky_b, sun, far, near, ground = PALETTES[seed % len(PALETTES)]
    rnd = random.Random(seed)
    sx, sy, sr = rnd.uniform(0.2, 0.8) * size, rnd.uniform(0.18, 0.4) * size, size * rnd.uniform(0.06, 0.1)
    ph = [rnd.uniform(0, 6.28) for _ in range(6)]

    def ridge(x: float, base: float, amp: float, k: int) -> float:
        t = x / size
        return base + amp * (0.55 * math.sin(6.3 * t * (1 + k) + ph[k]) + 0.3 * math.sin(17 * t + ph[k + 2]) + 0.15 * math.sin(41 * t + ph[k + 4]))

    far_y = [ridge(x, size * 0.55, size * 0.08, 0) for x in range(size)]
    near_y = [ridge(x, size * 0.7, size * 0.07, 1) for x in range(size)]
    rows = []
    for y in range(size):
        t = y / size
        row = bytearray()
        for x in range(size):
            if y > size * 0.86 + 6 * math.sin(x / 23 + ph[3]):
                c = ground
            elif y > near_y[x]:
                c = near
            elif y > far_y[x]:
                c = far
            elif (x - sx) ** 2 + (y - sy) ** 2 < sr * sr:
                c = sun
            else:
                c = tuple(int(sky_t[i] + (sky_b[i] - sky_t[i]) * min(1, t * 1.6)) for i in range(3))
            row += bytes(c)
        rows.append(bytes(row))
    return _png(size, size, rows)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def seed(db: Database, media_dir: Path, for_user_id: str | None) -> dict:
    media_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    ids = []
    for name, username, bio, interests in PEOPLE:
        email = f"{username}@{DOMAIN}"
        row = db.one("SELECT id FROM users WHERE email = ?", email)
        if row:
            ids.append(row["id"])
            continue
        uid = str(uuid.uuid4())
        phone = "+9100000" + str(random.randint(10000, 99999))
        db.run("INSERT INTO users (id, full_name, email, phone, password_hash, created_at, role, username, intro, interests) VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, ?)",
               uid, name, email, phone, security.hash_password(secrets.token_urlsafe(24)), _iso(now), username, bio, json.dumps(interests))
        ids.append(uid)
    made = 0
    for i, (who, caption, place, pal) in enumerate(POSTS):
        if db.one("SELECT 1 FROM posts WHERE user_id = ? AND caption = ? AND deleted_at IS NULL", ids[who], caption):
            continue
        at = _iso(now - timedelta(hours=3 + i * 7))
        pid, mid = str(uuid.uuid4()), str(uuid.uuid4())
        data = landscape(pal * 7 + 3)
        (media_dir / f"{mid}.png").write_bytes(data)
        db.run("INSERT INTO posts (id, user_id, caption, location_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", pid, ids[who], caption, place, at, at)
        db.run("INSERT INTO media (id, owner_id, post_id, kind, mime, size_bytes, path, sort, created_at) VALUES (?, ?, ?, 'IMAGE', 'image/png', ?, ?, 0, ?)",
               mid, ids[who], pid, len(data), f"{mid}.png", at)
        for j, liker in enumerate(ids):
            if liker != ids[who] and (i + j) % 2 == 0:
                db.run("INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)", pid, liker, at)
        commenter = ids[(who + 1) % len(ids)]
        db.run("INSERT INTO post_comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
               str(uuid.uuid4()), pid, commenter, COMMENTS[i % len(COMMENTS)], at)
        made += 1
    for a in ids:  # demo accounts follow each other
        for b in ids:
            if a != b:
                db.run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", a, b, _iso(now))
    greeted = 0
    if for_user_id:  # demo accounts follow the real user, so messaging can be shown
        for k, uid in enumerate(ids):
            db.run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", uid, for_user_id, _iso(now))
            if k < 2:
                a, b = sorted((uid, for_user_id))
                conv = db.one("SELECT id FROM conversations WHERE user_a = ? AND user_b = ?", a, b)
                if not conv:
                    cid = str(uuid.uuid4())
                    db.run("INSERT INTO conversations (id, user_a, user_b, created_at, last_message_at) VALUES (?, ?, ?, ?, ?)", cid, a, b, _iso(now), _iso(now))
                    db.run("INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)", str(uuid.uuid4()), cid, uid,
                           "Demo message: hi! Are you joining the next weekend trek?", _iso(now - timedelta(minutes=5 + k)))
                    greeted += 1
    return {"demo_users": len(ids), "new_posts": made, "messages": greeted}


def remove(db: Database, media_dir: Path) -> dict:
    users = [r["id"] for r in db.all("SELECT id FROM users WHERE email LIKE ?", f"%@{DOMAIN}")]
    if not users:
        return {"removed_users": 0}
    qm = ",".join("?" * len(users))
    for m in db.all(f"SELECT path FROM media WHERE owner_id IN ({qm})", *users):
        (media_dir / m["path"]).unlink(missing_ok=True)
    posts = [r["id"] for r in db.all(f"SELECT id FROM posts WHERE user_id IN ({qm})", *users)]
    if posts:
        qp = ",".join("?" * len(posts))
        db.run(f"DELETE FROM post_likes WHERE post_id IN ({qp})", *posts)
        db.run(f"DELETE FROM post_comments WHERE post_id IN ({qp})", *posts)
    convs = [r["id"] for r in db.all(f"SELECT id FROM conversations WHERE user_a IN ({qm}) OR user_b IN ({qm})", *users, *users)]
    if convs:
        db.run(f"DELETE FROM messages WHERE conversation_id IN ({','.join('?' * len(convs))})", *convs)
        db.run(f"DELETE FROM conversations WHERE id IN ({','.join('?' * len(convs))})", *convs)
    for sql in (f"DELETE FROM media WHERE owner_id IN ({qm})", f"DELETE FROM posts WHERE user_id IN ({qm})",
                f"DELETE FROM post_likes WHERE user_id IN ({qm})", f"DELETE FROM post_comments WHERE user_id IN ({qm})",
                f"DELETE FROM follows WHERE follower_id IN ({qm}) OR followee_id IN ({qm})", f"DELETE FROM blocks WHERE blocker_id IN ({qm}) OR blocked_id IN ({qm})",
                f"DELETE FROM sessions WHERE user_id IN ({qm})", f"DELETE FROM users WHERE id IN ({qm})"):
        db.run(sql, *(users * sql.count(f"({qm})")))
    return {"removed_users": len(users), "removed_posts": len(posts)}
