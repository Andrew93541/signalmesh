"""SQLite storage for local development, with ordered schema migrations.

Production target is PostgreSQL (DECISIONS.md D1); keep SQL portable.
"""

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

MIGRATIONS = [
    # 1: accounts, sessions, emergency contacts, consents, password resets, login attempts
    """
    CREATE TABLE users (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        phone_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
    );
    CREATE INDEX ix_sessions_user ON sessions(user_id);
    CREATE TABLE emergency_contacts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        relationship TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE consents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id),
        consent_type TEXT NOT NULL,
        document_version TEXT NOT NULL,
        accepted INTEGER NOT NULL,
        recorded_at TEXT NOT NULL,
        source TEXT NOT NULL
    );
    CREATE INDEX ix_consents_user ON consents(user_id);
    CREATE TABLE password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id),
        code_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used_at TEXT
    );
    CREATE TABLE login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identifier TEXT NOT NULL,
        ip TEXT,
        ok INTEGER NOT NULL,
        at TEXT NOT NULL
    );
    CREATE INDEX ix_login_attempts ON login_attempts(identifier, at);
    """,
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Database:
    def __init__(self, path: str):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        with self.lock:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA foreign_keys=ON")
            self._migrate()

    def _migrate(self):
        version = self.conn.execute("PRAGMA user_version").fetchone()[0]
        for i, sql in enumerate(MIGRATIONS[version:], start=version + 1):
            # executescript() would commit on its own, so run statements one by one
            # inside a single transaction: a migration applies fully or not at all.
            self.conn.execute("BEGIN")
            try:
                for statement in (s for s in sql.split(";") if s.strip()):
                    self.conn.execute(statement)
                self.conn.execute(f"PRAGMA user_version = {i}")
                self.conn.execute("COMMIT")
            except Exception:
                self.conn.execute("ROLLBACK")
                raise

    @property
    def schema_version(self) -> int:
        return self.conn.execute("PRAGMA user_version").fetchone()[0]

    def one(self, sql: str, *args):
        with self.lock:
            return self.conn.execute(sql, args).fetchone()

    def all(self, sql: str, *args):
        with self.lock:
            return self.conn.execute(sql, args).fetchall()

    def run(self, sql: str, *args):
        with self.lock:
            return self.conn.execute(sql, args)

    def close(self):
        self.conn.close()
