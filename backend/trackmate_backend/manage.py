"""Admin tasks.

  python -m trackmate_backend.manage create-responder --name "Meera Iyer" --email meera@example.org --phone +919800000000 [--admin]
      (password is asked interactively, or read from TRACKMATE_NEW_PASSWORD)
  python -m trackmate_backend.manage create-gateway GATEWAY_01
      (prints the gateway token ONCE; only its hash is stored)
  TRACKMATE_DEV_MODE=1 python -m trackmate_backend.manage seed-demo [--for-email you@example.org]
      (dev only: demo accounts "… (demo)" @demo.trackmate.test with drawn landscape posts, likes,
       comments; with --for-email they follow you and send one demo message each from two of them)
  python -m trackmate_backend.manage remove-demo     (deletes every demo account and its content)
  TRACKMATE_DEV_MODE=1 python -m trackmate_backend.manage create-test-event --organizer-email you@example.org
      (dev only: one PUBLISHED event titled "[TEST] …" so the Feeds screen can be checked
       before event creation exists in the app; refused outside dev mode)
"""

import argparse
import getpass
import os
import secrets
import sys
import uuid

from . import security
from .config import load_settings
from .db import Database, now_iso
from .models import check_password, normalize_email, normalize_phone


def main(argv=None):
    p = argparse.ArgumentParser(prog="trackmate_backend.manage")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("create-responder")
    r.add_argument("--name", required=True)
    r.add_argument("--email", required=True)
    r.add_argument("--phone", required=True)
    r.add_argument("--admin", action="store_true")
    g = sub.add_parser("create-gateway")
    g.add_argument("gateway_id")
    sd = sub.add_parser("seed-demo")
    sd.add_argument("--for-email")
    sub.add_parser("remove-demo")
    t = sub.add_parser("create-test-event")
    t.add_argument("--organizer-email", required=True)
    t.add_argument("--days-ahead", type=int, default=14)
    args = p.parse_args(argv)
    db = Database(load_settings().db_path)

    if args.cmd == "create-responder":
        email, phone = normalize_email(args.email), normalize_phone(args.phone)
        password = os.environ.get("TRACKMATE_NEW_PASSWORD") or getpass.getpass("Password: ")
        check_password(password, email)
        existing = db.one("SELECT id FROM users WHERE email = ? OR phone = ?", email, phone)
        role = "admin" if args.admin else "responder"
        if existing:
            db.run("UPDATE users SET role = ? WHERE id = ?", role, existing["id"])
            print(f"Existing user {email} is now {role}.")
        else:
            db.run("INSERT INTO users (id, full_name, email, phone, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
                   str(uuid.uuid4()), args.name.strip(), email, phone, security.hash_password(password), now_iso(), role)
            print(f"Created {role} {email}.")
    elif args.cmd == "create-gateway":
        token = secrets.token_urlsafe(32)
        db.run("INSERT OR REPLACE INTO gateways (id, token_hash, created_at) VALUES (?, ?, ?)",
               args.gateway_id, security.token_hash(token), now_iso())
        print(f"Gateway {args.gateway_id} registered. Token (shown once, store it in the gateway's SIGNALMESH_UPSTREAM_TOKEN):")
        print(token)
    elif args.cmd in ("seed-demo", "remove-demo"):
        from pathlib import Path
        from . import demo
        settings = load_settings()
        media = Path(settings.photo_dir).parent / "media"
        if args.cmd == "remove-demo":
            print(demo.remove(db, media))
            return 0
        if not settings.dev_mode:
            print("Refused: seed-demo only runs with TRACKMATE_DEV_MODE=1.", file=sys.stderr)
            return 2
        target = None
        if args.for_email:
            u = db.one("SELECT id FROM users WHERE email = ?", normalize_email(args.for_email))
            if not u:
                print("No user with that email.", file=sys.stderr)
                return 1
            target = u["id"]
        print(demo.seed(db, media, target))
    elif args.cmd == "create-test-event":
        if not load_settings().dev_mode:
            print("Refused: create-test-event only runs with TRACKMATE_DEV_MODE=1.", file=sys.stderr)
            return 2
        u = db.one("SELECT id FROM users WHERE email = ?", normalize_email(args.organizer_email))
        if not u:
            print("No user with that email.", file=sys.stderr)
            return 1
        from datetime import datetime, timedelta, timezone
        start = (datetime.now(timezone.utc) + timedelta(days=args.days_ahead)).replace(hour=0, minute=30, second=0, microsecond=0)
        z = lambda d: d.isoformat(timespec="seconds").replace("+00:00", "Z")  # noqa: E731
        eid, now = str(uuid.uuid4()), now_iso()
        db.run("""INSERT INTO events (id, organizer_id, title, description, category, start_location, destination,
                  start_at, end_at, duration_minutes, difficulty, participant_limit, price_minor, currency, requirements,
                  organizer_contact, visibility, status, published_at, created_at, updated_at)
                  VALUES (?, ?, ?, ?, 'HIKE', 'Test meeting point', 'Test destination', ?, ?, 240, 'EASY', 10, 0, 'INR',
                  'Test requirements text.', 'test contact', 'PUBLIC', 'PUBLISHED', ?, ?, ?)""",
               eid, u["id"], "[TEST] Feeds screen check",
               "Test event created with the admin CLI to check how the Feeds screen shows events. Not a real event.",
               z(start), z(start + timedelta(hours=4)), now, now, now)
        print(f"Created TEST event {eid} (published, organizer {args.organizer_email}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
