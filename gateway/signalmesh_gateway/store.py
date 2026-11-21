"""SQLite persistence. Standard library only, so it runs anywhere Python does."""

import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .models import CheckinIn, NodeHeartbeatIn, SosIn

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    message_id      TEXT PRIMARY KEY,
    device_id       TEXT NOT NULL,
    worker_name     TEXT NOT NULL,
    category        TEXT NOT NULL,
    priority        TEXT NOT NULL,
    description     TEXT,
    latitude        REAL,
    longitude       REAL,
    created_at      TEXT NOT NULL,
    received_at     TEXT NOT NULL,
    hop_count       INTEGER NOT NULL,
    hops            TEXT NOT NULL,
    received_from   TEXT,
    status          TEXT NOT NULL,
    acknowledged_by TEXT,
    acknowledged_at TEXT,
    resolved_by     TEXT,
    resolved_at     TEXT,
    resolution_note TEXT,
    upstream_state  TEXT NOT NULL DEFAULT 'NONE',
    upstream_attempts INTEGER NOT NULL DEFAULT 0,
    upstream_error  TEXT
);
CREATE INDEX IF NOT EXISTS ix_messages_received ON messages(received_at);

CREATE TABLE IF NOT EXISTS message_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    kind       TEXT NOT NULL,
    actor      TEXT,
    detail     TEXT,
    at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_events_message ON message_events(message_id);

CREATE TABLE IF NOT EXISTS checkins (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id        TEXT NOT NULL,
    worker_name      TEXT NOT NULL,
    latitude         REAL,
    longitude        REAL,
    checked_in_at    TEXT NOT NULL,
    interval_minutes INTEGER NOT NULL,
    received_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_checkins_device ON checkins(device_id, checked_in_at);

CREATE TABLE IF NOT EXISTS nodes (
    node_id    TEXT PRIMARY KEY,
    role       TEXT NOT NULL,
    label      TEXT,
    queue_size INTEGER NOT NULL DEFAULT 0,
    address    TEXT,
    last_seen  TEXT NOT NULL
);
"""

OPEN_STATUSES = ("RELAYED", "DELIVERED", "ACKNOWLEDGED")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _message(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["hops"] = json.loads(d["hops"])
    return d


class Store:
    def __init__(self, path: str):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.executescript(SCHEMA)

    def ping(self) -> bool:
        try:
            with self._lock:
                self._db.execute("SELECT 1")
            return True
        except sqlite3.Error:
            return False

    def close(self):
        self._db.close()

    # ---- SOS -------------------------------------------------------------

    def _event(self, message_id: str, kind: str, actor: str | None, detail, at: str):
        self._db.execute(
            "INSERT INTO message_events (message_id, kind, actor, detail, at) VALUES (?, ?, ?, ?, ?)",
            (message_id, kind, actor, json.dumps(detail) if detail is not None else None, at),
        )

    def _get(self, message_id: str) -> dict | None:
        row = self._db.execute("SELECT * FROM messages WHERE message_id = ?", (message_id,)).fetchone()
        return _message(row) if row else None

    def save_sos(self, sos: SosIn, node_id: str, status: str, upstream: bool) -> tuple[dict, bool]:
        """Store an SOS once. Returns (record, duplicate)."""
        now = iso(utcnow())
        received_from = sos.hops[-1] if sos.hops else sos.device_id
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                existing = self._get(sos.message_id)
                if existing:
                    self._event(sos.message_id, "DUPLICATE", received_from, {"hops": sos.hops}, now)
                    self._db.execute("COMMIT")
                    return existing, True
                path = [*sos.hops, node_id] if sos.hops else [sos.device_id, node_id]
                self._db.execute(
                    """INSERT INTO messages (message_id, device_id, worker_name, category, priority,
                       description, latitude, longitude, created_at, received_at, hop_count, hops,
                       received_from, status, upstream_state)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (sos.message_id, sos.device_id, sos.worker_name, sos.category, sos.priority,
                     sos.description, sos.latitude, sos.longitude, sos.created_at, now, sos.hop_count,
                     json.dumps(path), received_from, status, "PENDING" if upstream else "NONE"),
                )
                self._event(sos.message_id, "RECEIVED", received_from, {"hops": sos.hops}, now)
                self._db.execute("COMMIT")
            except Exception:
                self._db.execute("ROLLBACK")
                raise
            return self._get(sos.message_id), False

    def get_message(self, message_id: str, with_events: bool = False) -> dict | None:
        with self._lock:
            msg = self._get(message_id)
            if msg and with_events:
                rows = self._db.execute(
                    "SELECT kind, actor, detail, at FROM message_events WHERE message_id = ? ORDER BY id",
                    (message_id,),
                ).fetchall()
                msg["events"] = [
                    {**dict(r), "detail": json.loads(r["detail"]) if r["detail"] else None} for r in rows
                ]
        return msg

    def list_messages(self, statuses=None, category=None, priority=None, limit=200) -> list[dict]:
        sql, args = "SELECT * FROM messages WHERE 1=1", []
        if statuses:
            sql += f" AND status IN ({','.join('?' * len(statuses))})"
            args += statuses
        if category:
            sql += " AND category = ?"
            args.append(category)
        if priority:
            sql += " AND priority = ?"
            args.append(priority)
        sql += " ORDER BY received_at DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            return [_message(r) for r in self._db.execute(sql, args).fetchall()]

    def acknowledge(self, message_id: str, by: str) -> tuple[dict | None, bool]:
        """Returns (record, changed). Acknowledging twice is a no-op."""
        now = iso(utcnow())
        with self._lock:
            msg = self._get(message_id)
            if not msg or msg["status"] in ("ACKNOWLEDGED", "RESOLVED"):
                return msg, False
            self._db.execute(
                "UPDATE messages SET status = 'ACKNOWLEDGED', acknowledged_by = ?, acknowledged_at = ? WHERE message_id = ?",
                (by, now, message_id),
            )
            self._event(message_id, "ACKNOWLEDGED", by, None, now)
            return self._get(message_id), True

    def resolve(self, message_id: str, by: str, note: str | None) -> tuple[dict | None, bool]:
        now = iso(utcnow())
        with self._lock:
            msg = self._get(message_id)
            if not msg or msg["status"] == "RESOLVED":
                return msg, False
            self._db.execute(
                """UPDATE messages SET status = 'RESOLVED', resolved_by = ?, resolved_at = ?, resolution_note = ?,
                   acknowledged_by = COALESCE(acknowledged_by, ?), acknowledged_at = COALESCE(acknowledged_at, ?)
                   WHERE message_id = ?""",
                (by, now, note, by, now, message_id),
            )
            self._event(message_id, "RESOLVED", by, {"note": note} if note else None, now)
            return self._get(message_id), True

    def counts(self) -> dict:
        with self._lock:
            r = self._db.execute(
                """SELECT COUNT(*) AS total,
                   SUM(status IN ('RELAYED','DELIVERED','ACKNOWLEDGED')) AS open,
                   SUM(status IN ('RELAYED','DELIVERED','ACKNOWLEDGED') AND priority = 'HIGH') AS critical_open,
                   SUM(status IN ('RELAYED','DELIVERED')) AS awaiting_ack,
                   SUM(status = 'ACKNOWLEDGED') AS acknowledged,
                   SUM(status = 'RESOLVED') AS resolved,
                   SUM(upstream_state = 'PENDING') AS upstream_pending,
                   SUM(upstream_state = 'REJECTED') AS upstream_rejected
                   FROM messages"""
            ).fetchone()
        return {k: (r[k] or 0) for k in r.keys()}

    # ---- upstream forwarding ----------------------------------------------

    def pending_upstream(self, limit: int = 20) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                """SELECT * FROM messages WHERE upstream_state = 'PENDING'
                   ORDER BY CASE priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, received_at
                   LIMIT ?""",
                (limit,),
            ).fetchall()
        return [_message(r) for r in rows]

    def mark_upstream(self, message_id: str, ok: bool, error: str | None = None):
        with self._lock:
            self._db.execute(
                """UPDATE messages SET upstream_state = ?, upstream_attempts = upstream_attempts + 1,
                   upstream_error = ? WHERE message_id = ?""",
                ("SENT" if ok else "PENDING", error, message_id),
            )
            if ok:
                self._event(message_id, "FORWARDED_UPSTREAM", None, None, iso(utcnow()))

    def mark_upstream_rejected(self, message_id: str, error: str):
        """Upstream refused this payload permanently; keep it locally, stop retrying."""
        with self._lock:
            self._db.execute(
                "UPDATE messages SET upstream_state = 'REJECTED', upstream_attempts = upstream_attempts + 1, upstream_error = ? WHERE message_id = ?",
                (error, message_id),
            )
            self._event(message_id, "UPSTREAM_REJECTED", None, {"error": error}, iso(utcnow()))

    # ---- check-ins ----------------------------------------------------------

    def save_checkin(self, c: CheckinIn) -> str:
        due = iso(parse(c.checked_in_at) + timedelta(minutes=c.interval_minutes))
        with self._lock:
            self._db.execute(
                """INSERT INTO checkins (device_id, worker_name, latitude, longitude, checked_in_at,
                   interval_minutes, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (c.device_id, c.worker_name, c.latitude, c.longitude, c.checked_in_at,
                 c.interval_minutes, iso(utcnow())),
            )
        return due

    def latest_checkins(self) -> list[dict]:
        now = utcnow()
        with self._lock:
            rows = self._db.execute(
                """SELECT c.* FROM checkins c JOIN (
                     SELECT device_id, MAX(id) AS id FROM checkins GROUP BY device_id
                   ) last ON last.id = c.id ORDER BY c.device_id"""
            ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            due = parse(d["checked_in_at"]) + timedelta(minutes=d["interval_minutes"])
            d["due_at"] = iso(due)
            d["overdue"] = now > due
            out.append(d)
        return out

    # ---- nodes --------------------------------------------------------------

    def heartbeat(self, hb: NodeHeartbeatIn, address: str | None):
        with self._lock:
            self._db.execute(
                """INSERT INTO nodes (node_id, role, label, queue_size, address, last_seen)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(node_id) DO UPDATE SET role = excluded.role, label = excluded.label,
                   queue_size = excluded.queue_size, address = excluded.address, last_seen = excluded.last_seen""",
                (hb.node_id, hb.role, hb.label, hb.queue_size, address, iso(utcnow())),
            )

    def nodes(self, online_seconds: int) -> list[dict]:
        cutoff = utcnow() - timedelta(seconds=online_seconds)
        with self._lock:
            rows = self._db.execute("SELECT * FROM nodes ORDER BY node_id").fetchall()
        return [{**dict(r), "online": parse(r["last_seen"]) >= cutoff} for r in rows]
