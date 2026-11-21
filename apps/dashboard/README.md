# TrackMate responder dashboard

Next.js 16 + TypeScript. Emergency command centre for responders: live SOS
incidents, map, incident detail with acknowledge / dispatch / resolve, relay
network, gateway health and audit history. All data comes from the TrackMate
backend (`backend/`); nothing is mocked.

Run: see [`docs/RUNBOOK.md`](../../docs/RUNBOOK.md) §3.

## Security model

- Sign-in goes through `/api/auth/login`; only `responder`/`admin` accounts get a session.
- The backend session token is kept in an **httpOnly** cookie and never reaches browser code.
- `/api/backend/*` forwards only to the backend's `/v1/admin/*` routes, adding the token; the backend checks the role on every call.
- Live updates: a 30-second, single-use WebSocket ticket from the backend; polling every 10 s as fallback; automatic reconnect with backoff.
- `src/proxy.ts` redirects to `/login` without a session (an optimistic check; real authorization is in the backend).

## Pages

`/` Command Center · `/incidents` Live SOS (filters) · `/incidents/[id]` detail + actions ·
`/map` Emergency Map (real coordinates only; stale > 15 min shown faded) ·
`/response` Response Management · `/network` Relay Network · `/gateways` Gateway Health · `/audit` Audit History.

Map tiles: OpenStreetMap (needs internet; check the tile usage policy before production).
