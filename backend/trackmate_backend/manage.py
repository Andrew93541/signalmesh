"""Admin tasks.

  python -m trackmate_backend.manage create-responder --name "Meera Iyer" --email meera@example.org --phone +919800000000 [--admin]
      (password is asked interactively, or read from TRACKMATE_NEW_PASSWORD)
  python -m trackmate_backend.manage create-gateway GATEWAY_01
      (prints the gateway token ONCE; only its hash is stored)
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
