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
    # 2: responder roles, gateways, incidents (from the SignalMesh gateway), incident events, audit log
    """
    ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
    CREATE TABLE gateways (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen TEXT,
        status_json TEXT
    );
    CREATE TABLE incidents (
        message_id TEXT PRIMARY KEY,
        gateway_id TEXT NOT NULL REFERENCES gateways(id),
        device_id TEXT NOT NULL,
        worker_name TEXT NOT NULL,
        category TEXT NOT NULL,
        priority TEXT NOT NULL,
        description TEXT,
        latitude REAL,
        longitude REAL,
        created_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        hops TEXT NOT NULL,
        hop_count INTEGER NOT NULL,
        incident_state TEXT NOT NULL,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        dispatched_by TEXT,
        dispatched_at TEXT,
        dispatch_team TEXT,
        dispatch_note TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        resolution_note TEXT
    );
    CREATE INDEX ix_incidents_received ON incidents(received_at);
    CREATE TABLE incident_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL REFERENCES incidents(message_id),
        kind TEXT NOT NULL,
        actor TEXT,
        detail TEXT,
        at TEXT NOT NULL
    );
    CREATE INDEX ix_incident_events_msg ON incident_events(message_id);
    CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT,
        actor_name TEXT,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        ip TEXT,
        at TEXT NOT NULL
    );
    """,
    # 3: location metadata + account link on incidents; editable profile; email/phone change verification
    """
    ALTER TABLE incidents ADD COLUMN location_accuracy_m REAL;
    ALTER TABLE incidents ADD COLUMN location_recorded_at TEXT;
    ALTER TABLE incidents ADD COLUMN location_source TEXT;
    ALTER TABLE incidents ADD COLUMN location_is_last_known INTEGER;
    ALTER TABLE incidents ADD COLUMN user_id TEXT;
    ALTER TABLE users ADD COLUMN travel_preferences TEXT;
    ALTER TABLE users ADD COLUMN trekking_experience TEXT;
    ALTER TABLE users ADD COLUMN intro TEXT;
    ALTER TABLE users ADD COLUMN photo_path TEXT;
    ALTER TABLE users ADD COLUMN updated_at TEXT;
    CREATE TABLE contact_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL,
        new_value TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used_at TEXT
    );
    """,
    # 4: FEEDS — events. Event lifecycle (events.status) and participant applications
    # (event_applications.status) are separate state machines in separate tables.
    """
    CREATE TABLE event_categories (
        code TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        sort INTEGER NOT NULL
    );
    INSERT INTO event_categories (code, label, sort) VALUES
        ('TREK', 'Trek', 1), ('HIKE', 'Day hike', 2), ('CAMPING', 'Camping', 3), ('CYCLING', 'Cycling', 4),
        ('CITY_WALK', 'City walk', 5), ('CULTURAL', 'Cultural tour', 6), ('VOLUNTEER', 'Volunteering', 7), ('OTHER', 'Other', 8);
    CREATE TABLE events (
        id TEXT PRIMARY KEY,
        organizer_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL REFERENCES event_categories(code),
        cover_path TEXT,
        start_location TEXT NOT NULL DEFAULT '',
        destination TEXT NOT NULL DEFAULT '',
        start_lat REAL,
        start_lon REAL,
        start_at TEXT,
        end_at TEXT,
        duration_minutes INTEGER,
        difficulty TEXT,
        participant_limit INTEGER,
        price_minor INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'INR',
        requirements TEXT NOT NULL DEFAULT '',
        organizer_contact TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL DEFAULT 'PUBLIC',
        approval_mode TEXT NOT NULL DEFAULT 'MANUAL',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        status_reason TEXT,
        submitted_at TEXT,
        reviewed_by TEXT REFERENCES users(id),
        reviewed_at TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX ix_events_status_start ON events(status, visibility, start_at);
    CREATE INDEX ix_events_organizer ON events(organizer_id, updated_at);
    CREATE INDEX ix_events_location ON events(start_lat, start_lon);
    CREATE INDEX ix_events_category ON events(category);
    CREATE TABLE event_applications (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'PENDING',
        message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (event_id, user_id)
    );
    CREATE INDEX ix_event_applications_event ON event_applications(event_id, status);
    """,
    # 5: social feed, public profile fields, plans/entitlements, safety preferences.
    # Media files live on disk (data/media); rows hold only metadata and a server-chosen file name.
    """
    ALTER TABLE users ADD COLUMN username TEXT;
    ALTER TABLE users ADD COLUMN interests TEXT;
    ALTER TABLE users ADD COLUMN home_location TEXT;
    ALTER TABLE users ADD COLUMN show_home_location INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN safety_prefs TEXT;
    CREATE UNIQUE INDEX ux_users_username ON users(username) WHERE username IS NOT NULL;
    CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        caption TEXT NOT NULL DEFAULT '',
        location_name TEXT,
        latitude REAL,
        longitude REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
    );
    CREATE INDEX ix_posts_created ON posts(created_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX ix_posts_user ON posts(user_id, created_at DESC);
    CREATE TABLE media (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id),
        post_id TEXT REFERENCES posts(id),
        kind TEXT NOT NULL,
        mime TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        path TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE INDEX ix_media_post ON media(post_id, sort);
    CREATE TABLE post_likes (
        post_id TEXT NOT NULL REFERENCES posts(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        PRIMARY KEY (post_id, user_id)
    );
    CREATE TABLE post_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT
    );
    CREATE INDEX ix_comments_post ON post_comments(post_id, created_at);
    CREATE TABLE follows (
        follower_id TEXT NOT NULL REFERENCES users(id),
        followee_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        PRIMARY KEY (follower_id, followee_id)
    );
    CREATE INDEX ix_follows_followee ON follows(followee_id, created_at DESC);
    CREATE TABLE blocks (
        blocker_id TEXT NOT NULL REFERENCES users(id),
        blocked_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id)
    );
    CREATE TABLE reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL REFERENCES users(id),
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN',
        created_at TEXT NOT NULL
    );
    CREATE INDEX ix_reports_status ON reports(status, created_at);
    CREATE TABLE plan_products (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        billing TEXT NOT NULL,
        includes TEXT NOT NULL,
        sort INTEGER NOT NULL
    );
    INSERT INTO plan_products (code, name, description, price_minor, currency, billing, includes, sort) VALUES
        ('TRIP_BUNDLE', 'Complete Trip Bundle', 'Community access and active SOS sending for one trek, with three group passes.', 19900, 'INR', 'PER_TRIP', '["COMMUNITY","ACTIVE_SOS","GROUP_PASS_3"]', 1),
        ('COMMUNITY_ADDON', 'Community add-on', 'Community access for one trek.', 14900, 'INR', 'PER_TRIP', '["COMMUNITY"]', 2),
        ('SOS_ADDON', 'Active SOS add-on', 'Active SOS sending for one trek.', 14900, 'INR', 'PER_TRIP', '["ACTIVE_SOS"]', 3);
    CREATE TABLE trip_entitlements (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        trip_ref TEXT NOT NULL,
        product_code TEXT NOT NULL REFERENCES plan_products(code),
        status TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        valid_from TEXT,
        valid_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX ux_entitlement_live ON trip_entitlements(user_id, trip_ref, product_code) WHERE status IN ('PENDING_PAYMENT', 'ACTIVE');
    """,
    # 6: direct messages between people who follow each other (or where the recipient follows the sender).
    """
    CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        user_a TEXT NOT NULL REFERENCES users(id),
        user_b TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        last_message_at TEXT,
        UNIQUE (user_a, user_b)
    );
    CREATE INDEX ix_conversations_a ON conversations(user_a, last_message_at DESC);
    CREATE INDEX ix_conversations_b ON conversations(user_b, last_message_at DESC);
    CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        sender_id TEXT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT
    );
    CREATE INDEX ix_messages_conv ON messages(conversation_id, created_at DESC);
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
