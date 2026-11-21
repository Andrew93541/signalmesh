# Decision log

Approved decisions. Each entry: what, why, consequences. Change a decision by
adding a new entry that supersedes it, not by editing old ones.

## D1 — Separate TrackMate backend; keep the edge gateway (2026-11-21, approved)

**Decision.** `gateway/` stays the portable SignalMesh edge gateway (FastAPI +
SQLite, works with no internet, runs on a laptop or Raspberry Pi). A new
`backend/` service (FastAPI + PostgreSQL/PostGIS, Alembic migrations) holds
accounts, journeys, tracking, social, fitness, incidents and billing.

**Why.** Field hardware must not carry account, payment or social data, and it
must keep working offline. The gateway already has an upstream retry queue
(`SIGNALMESH_UPSTREAM_URL`) to hand SOS messages to the backend.

**Consequences.** Two Python services. SignalMesh message models must be shared
or kept in sync between them. The gateway gains an authenticated upstream link
later (device credentials).

## D2 — Contract v2: separate delivery state and incident state, v1 compatible (2026-11-21, approved)

**Decision.** Add `delivery_state` (`QUEUED → RELAYED → TRANSMITTED → DELIVERED`)
and `incident_state` (`OPEN → ACKNOWLEDGED → DISPATCHED → RESOLVED`). Keep the v1
`status` field in responses, derived from the two, so the current app and relay
keep working. Spec: `docs/CONTRACT.md` § v2. **Not implemented yet** (Phase 3).

**Why.** "How far did the message get" and "what are responders doing" are
different questions with different owners; mixing them caused the "delivered vs
acknowledged" ambiguity.

**Consequences.** Gateway, relay and app migrate one at a time. `DISPATCHED`
requires responder evidence.

## D3 — Teammate's dashboard moves into this repo (2026-11-21, approved)

**Decision.** The responder dashboard lives at `apps/dashboard` in this monorepo,
replacing the unused Next.js starter in `apps/web` once imported.

**Pending.** The location of the teammate's code (repo URL/branch, folder, or
ZIP). Import keeps its history if it is a git repo. Its stack (expected React +
Vite + Tailwind) is reviewed on import; it is then connected to real gateway /
backend data (Phase 6).

## D4 — Rename the app to TrackMate at the start of Phase 2 (2026-11-21, approved)

**Decision.** Before building TrackMate screens: app display name "TrackMate",
workspace package `trackmate-mobile` (or similar), Android application id
changed from `com.signalmesh.app` (proposed `com.trackmate.app` — **confirm
the final id; it is permanent once published on Play**). "SignalMesh" remains
the name of the communication engine, gateway and contract.

**Update (2026-11-21):** done — app id `com.trackmate.app`, name TrackMate.

**Consequences.** Both test phones need the app reinstalled once (new app id =
new app, local data not carried over). Repo name can stay `signalmesh` or be
renamed on GitHub separately.

## D5 — Product name is TrackMate (2026-11-21, confirmed by owner)

**Decision.** The product name is **TrackMate**, as used in the app, code and docs.

**Consequence.** The supplied logo artwork reads "TrekMate". It is used unmodified
in the app for now (splash, onboarding, sign-in) but cannot be the production
brand asset. Needed from the designer before release: the same logo with the
"TrackMate" wordmark, plus (1) a transparent-background version and (2) a
foreground-only mark for the Android adaptive app icon. Code is not changed to
alter the artwork.
