import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    node_id: str = "GATEWAY_01"
    db_path: str = "data/gateway.db"
    # Optional server further up the chain (e.g. a cloud backend). When set, every
    # stored SOS is forwarded there with retries; when empty this gateway is the end.
    upstream_url: str | None = None
    node_online_seconds: int = 30
    upstream_retry_seconds: float = 5.0
    overdue_check_seconds: float = 15.0
    cors_origins: list[str] = field(default_factory=lambda: ["*"])


def load_settings() -> Settings:
    env = os.environ.get
    return Settings(
        node_id=env("SIGNALMESH_NODE_ID", "GATEWAY_01"),
        db_path=env("SIGNALMESH_DB_PATH", "data/gateway.db"),
        upstream_url=(env("SIGNALMESH_UPSTREAM_URL") or "").strip().rstrip("/") or None,
        node_online_seconds=int(env("SIGNALMESH_NODE_ONLINE_SECONDS", "30")),
        upstream_retry_seconds=float(env("SIGNALMESH_UPSTREAM_RETRY_SECONDS", "5")),
        overdue_check_seconds=float(env("SIGNALMESH_OVERDUE_CHECK_SECONDS", "15")),
        cors_origins=[o.strip() for o in env("SIGNALMESH_CORS_ORIGINS", "*").split(",") if o.strip()],
    )
