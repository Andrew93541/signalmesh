# SignalMesh gateway

FastAPI + SQLite service that receives SOS messages from relays and phones,
stores them, tracks acknowledgements and check-ins, and serves the responder
dashboard. API: [`docs/CONTRACT.md`](../docs/CONTRACT.md).

Depends only on FastAPI and uvicorn, and stores data with Python's built-in
`sqlite3`, so the same code runs on a laptop or a Raspberry Pi.

## Setup (once)

```bash
cd gateway
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt        # add -dev for tests
cp .env.example .env                              # optional
```

## Run

```bash
.venv/bin/uvicorn signalmesh_gateway.app:app --host 0.0.0.0 --port 8000
```
With settings from `.env`: add `--env-file .env`.

`--host 0.0.0.0` makes it reachable from phones on the same Wi-Fi at
`http://<this-machine's-IP>:8000`. On macOS, allow incoming connections for
Python if the firewall asks.

Data lives in `data/gateway.db` and survives restarts. Delete that file to
start a demo from empty.

## Settings (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `SIGNALMESH_NODE_ID` | `GATEWAY_01` | This node's ID, added to every relay path |
| `SIGNALMESH_DB_PATH` | `data/gateway.db` | SQLite file |
| `SIGNALMESH_UPSTREAM_URL` | empty | Optional server further up. Stored SOS are forwarded there with retries; nothing is lost while it is down |
| `SIGNALMESH_NODE_ONLINE_SECONDS` | `30` | A relay counts as online if it sent a heartbeat this recently |
| `SIGNALMESH_CORS_ORIGINS` | `*` | Dashboard origins allowed to call the API |
| `SIGNALMESH_LOG_LEVEL` | `INFO` | Logs every SOS, duplicate, ack, resolve, check-in and overdue alert |

## Tests

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```
Covers: storage and relay path, duplicates (one record), missing GPS (stored as
null), validation, acknowledgement and resolve, filters and counts, restart
persistence, overdue check-ins, relay heartbeats, the live WebSocket feed, and
the upstream retry queue.

## Quick manual check

```bash
curl localhost:8000/gateway/status
curl localhost:8000/gateway/messages
curl -X POST localhost:8000/gateway/ack/<message_id> -H 'content-type: application/json' -d '{"acknowledged_by":"Meera"}'
```

## Not done yet

- **Responder authentication:** the ack/resolve endpoints are open on the LAN.
  Admin login comes with the dashboard phase.
- **Relay mode:** see the relay decision in the project notes.
