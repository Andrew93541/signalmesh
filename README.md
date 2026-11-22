# TrackMate · powered by SignalMesh

TrackMate is an Android safety and community app for trekkers and travellers.
Its core is **SignalMesh**, an offline-first SOS relay: an SOS hops phone to phone
over Bluetooth / Wi-Fi Direct until any phone with a connection delivers it to a
gateway, which forwards it to the responder dashboard. Acknowledgements travel back
the same way.

> TrackMate is not an emergency service and cannot guarantee a response.

## What it does

| Area | Highlights |
|---|---|
| **SOS** | Offline queue with retry and backoff, real GPS with accuracy and capture time (current vs last-known, never invented), statuses QUEUED → RELAYED → DELIVERED → ACKNOWLEDGED → RESOLVED |
| **Nearby mesh** | Google Nearby Connections (Bluetooth / BLE / Wi-Fi Direct), store-and-forward, no shared network needed; also a LAN relay over shared Wi-Fi/hotspot |
| **Recipient alerts** | Native high-priority alert with an original siren and vibration, deduplicated by incident ID, acknowledge from the notification, lock-screen aware, respects notification permission and Do Not Disturb |
| **Online mode** | Phones try a hosted HTTPS gateway first, then the local network |
| **Responder dashboard** | Live incidents, map, location freshness, copy coordinates, acknowledge / dispatch / resolve, audit log |
| **Feed** | Photo/video posts, likes, comments, follow, report/block, events (Upcoming / My Events / Applied) |
| **Messages** | Direct messages with people who follow you |
| **Profile** | Instagram-style profile with posts grid; edit profile, username, interests, optional home location |
| **Analytics** | Android Health Connect (steps, distance, calories, workouts; read-only) plus TrackMate GPS trek time and distance |
| **Plans** | Free plan; per-trip Premium (₹199 bundle, ₹149 add-ons). Receiving and relaying SOS is always free. Payments are not integrated yet |
| **Settings** | Safety options (on by default where safe), Android permission status, privacy, blocked users, sign out |

## Architecture

```
 Phone ──(Bluetooth / Wi-Fi Direct mesh)──► Phone ──(internet or LAN)──► Gateway ──► Backend ──► Dashboard
   ▲                                                                       (FastAPI)   (FastAPI)   (Next.js)
   └──────────────── acknowledgement / status back the same way ◄──────────────────────────────┘
```

| Folder | What |
|---|---|
| `apps/mobile` | TrackMate Android app: Expo SDK 58, React Native, expo-router. Native module `modules/signalmesh-nearby` (Nearby mesh, SOS alerts, foreground service, Health Connect) |
| `apps/dashboard` | Responder dashboard: Next.js 16, Tailwind, Leaflet map |
| `apps/web` | Website scaffold |
| `gateway` | SignalMesh edge gateway: FastAPI + SQLite, store-and-forward to the backend |
| `backend` | TrackMate backend: accounts, incidents, events, feed, messages, plans; FastAPI + SQLite with migrations |
| `packages/shared` | Shared TypeScript code |
| `docs` | Contract, runbook, decisions, status and more |

## Run it locally

Requirements: Node 20+, Python 3.12+, Android SDK + JDK 17 (for APK builds).

```bash
npm install
```

**Backend** (port 8100)

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
TRACKMATE_DEV_MODE=1 .venv/bin/uvicorn trackmate_backend.app:app --host 0.0.0.0 --port 8100
```

Create a responder account and a gateway credential:

```bash
.venv/bin/python -m trackmate_backend.manage create-responder --name "Your Name" --email you@example.org --phone +910000000000
.venv/bin/python -m trackmate_backend.manage create-gateway GATEWAY_01   # prints the token once
```

**Gateway** (port 8000): copy `gateway/.env.example` to `gateway/.env`, set the upstream URL and token, then:

```bash
cd gateway
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn signalmesh_gateway.app:app --host 0.0.0.0 --port 8000 --env-file .env
```

**Dashboard** (port 3100)

```bash
npm run dev -w dashboard
```

**Android app**: see [docs/RUNBOOK.md](docs/RUNBOOK.md) for dev builds, the standalone release APK and the two-phone test. Server addresses are not hard-coded: set them at build time (`EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_ONLINE_GATEWAY_URL`, `EXPO_PUBLIC_LOCAL_GATEWAY_URL`) or on the phone.

### Reaching the Mac from phones on any network

For demos, expose the gateway and backend with Cloudflare quick tunnels:

```bash
cloudflared tunnel --url http://localhost:8000
cloudflared tunnel --url http://localhost:8100
```

Quick-tunnel addresses change on every restart (rebuild the app or enter the new address on the phone). Anyone with the gateway address can post an SOS, so use a fixed, protected address for anything beyond a demo.

### Demo content (development only)

```bash
cd backend
TRACKMATE_DEV_MODE=1 .venv/bin/python -m trackmate_backend.manage seed-demo --for-email you@example.org
.venv/bin/python -m trackmate_backend.manage remove-demo
```

Creates clearly labelled "… (demo)" accounts on the reserved `demo.trackmate.test` domain with generated landscape images; `remove-demo` deletes all of it.

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q      # accounts, incidents, events, feed, messages, plans
cd gateway && .venv/bin/python -m pytest -q      # SOS store-and-forward, upstream, nearby acknowledgements
for t in apps/mobile/scripts/test-*.mts; do node $t; done   # mobile logic (backoff, alerts, analytics, …)
npx tsc --noEmit -p apps/mobile && npx tsc --noEmit -p apps/dashboard
```

## Privacy and safety rules

- Locations are never invented; last-known locations are labelled as such.
- Public profiles never show email, phone, emergency contacts or exact live location.
- Exact coordinates on posts are opt-in per post.
- The app respects Android permissions and Do Not Disturb and never changes system settings.
- Secrets (`gateway/.env`, `backend/data/`), databases, media and build output are git-ignored.

## Status

Feature-by-feature status, including what is tested on real phones and what is not, is kept in
[docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md). Not built yet: event creation and
approval, payments, push notifications for faraway contacts.
