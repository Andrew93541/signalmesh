import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    db_path: str = "data/backend.db"
    session_days: int = 30
    # No email/SMS provider is configured yet. In dev mode, verification and
    # password-reset codes are written to the server log so the flow can be
    # tested; in any other mode they are not delivered at all.
    dev_mode: bool = False
    cors_origins: tuple[str, ...] = ("*",)
    auth_rate_per_minute: int = 30  # per client IP, /v1/auth/*
    lockout_failures: int = 5  # failed logins per identifier...
    lockout_minutes: int = 15  # ...within this window


# Legal document versions the app must accept. Drafts until legal review.
TERMS_VERSION = "2026-11-21-draft"
PRIVACY_VERSION = "2026-11-21-draft"
REQUIRED_CONSENTS = {"TERMS_OF_SERVICE": TERMS_VERSION, "PRIVACY_POLICY": PRIVACY_VERSION}
# Consents that are NEVER implied by accepting the terms; requested separately when needed.
SEPARATE_CONSENTS = {"LOCATION_TRIP_SHARING", "HEALTH_DATA", "AUTO_ESCALATION"}


def load_settings() -> Settings:
    env = os.environ.get
    return Settings(
        db_path=env("TRACKMATE_DB_PATH", "data/backend.db"),
        session_days=int(env("TRACKMATE_SESSION_DAYS", "30")),
        dev_mode=env("TRACKMATE_DEV_MODE", "0") == "1",
        cors_origins=tuple(o.strip() for o in env("TRACKMATE_CORS_ORIGINS", "*").split(",") if o.strip()),
        auth_rate_per_minute=int(env("TRACKMATE_AUTH_RATE_PER_MINUTE", "30")),
    )
