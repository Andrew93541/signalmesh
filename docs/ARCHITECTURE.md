# Architecture (current and proposed)

## 1. Today (prototype)

```
Phone (Expo app) ──HTTP/LAN──▶ [Relay phone] ──HTTP/LAN──▶ Edge gateway (FastAPI + SQLite)
   outbox (SQLite)               relay queue (SQLite)          messages, events, check-ins, nodes
                                                               └─▶ optional upstream (not built)
```
Every hop exposes the same SOS endpoints (`docs/CONTRACT.md`), so senders need
one next-hop URL. No accounts, no auth, no dashboard in the repo.

## 2. Principles

- **SignalMesh is independent of TrackMate UI.** It is a library in the app plus the edge gateway, with its own contract.
- **Keep working code.** Wrap existing outbox/sync/relay in adapters rather than rewriting.
- **Separate data domains:** safety/SOS, location, journeys, social, fitness, billing each get their own tables and API groups.
- **Server-side authority** for permissions and entitlements; the UI only reflects them.

## 3. Proposed target (needs approval)

```
                         ┌──────────────── TrackMate backend (new) ───────────────┐
TrackMate app ──HTTPS──▶ │ FastAPI /v1 · PostgreSQL + PostGIS · auth · journeys · │◀── Responder / organizer
  ├─ UI modules          │ social · fitness · billing · incidents · audit log     │     web dashboard
  └─ SignalMesh client   └───────────────▲────────────────────────────────────────┘
      ├─ InternetAdapter ────────────────┘ (when online)
      ├─ RelayAdapter ──▶ relay phone ──▶ Edge gateway (existing, SQLite) ──upstream──▶ backend
      ├─ SmsAdapter (later, research)
      └─ SatelliteAdapter (later, research)
```

- **Edge gateway** stays the existing `gateway/` (portable, SQLite, works with no internet). It forwards upstream to the backend using its existing retry queue (`SIGNALMESH_UPSTREAM_URL`).
- **TrackMate backend** is a new service (proposed `backend/`), not a rewrite of the gateway, because accounts, billing and social features do not belong on a field device. Risk: two Python services to maintain; mitigated by sharing the SignalMesh message models.

## 4. SignalMesh client: transport abstraction

```ts
interface TransportAdapter {
  id: 'internet' | 'relay' | 'sms' | 'satellite-external' | 'satellite-native';
  getStatus(): Promise<TransportStatus>;          // available? cost? latency class?
  send(message: SignalMessage): Promise<TransportResult>;  // accepted | rejected | unreachable
}
```
Communication manager: picks an available adapter by priority and policy,
applies retries with backoff and expiry, keeps `message_id` stable, dedupes,
records every `TransportAttempt` and relay hop, and treats "accepted by a
transport" (`TRANSMITTED`) differently from "stored by a gateway"
(`DELIVERED`).

Mapping from today's code: `outbox.ts` → persistent queue; `gateway.ts` +
`sync.ts` → InternetAdapter/LAN path; `relay.ts` → relay node behaviour (a
phone acting as a hop) and the target of the RelayAdapter.

## 5. Message and incident state (contract v2 proposal)

Today one `status` field mixes delivery and incident progress. Proposal:

| Field | Values | Owner |
|---|---|---|
| `delivery_state` | `QUEUED → RELAYED → TRANSMITTED → DELIVERED` | SignalMesh |
| `incident_state` | `OPEN → ACKNOWLEDGED → DISPATCHED → RESOLVED` | Backend / responders |

Compatibility: v1 `status` stays in responses for existing clients, derived as
`incident_state` if past `OPEN`, else `delivery_state`. New routes under `/v2`
or a version field; v1 routes unchanged until all clients move. `DISPATCHED`
requires evidence (who, when, which team).

## 6. Data model (backend)

Separate tables, grouped by domain:

- **Identity:** User, TrustedContact, (Device)
- **Journeys & tracking:** Journey, JourneyMember, TrackingSession, LocationEvent (PostGIS geometry), CheckIn
- **Safety:** SOSIncident, ResponderAction
- **SignalMesh:** SignalMessage, TransportAttempt, RelayNode, SatelliteDevice
- **Social:** CoTrackerProfile, ConnectionRequest, GroupJourney, GroupMembership, Block, Report
- **Fitness:** FitnessConnection, FitnessActivity
- **Billing:** SubscriptionPlan, PlanFeature, BillingPeriod, UserSubscription, PaymentTransaction, SubscriptionEntitlement
- **Audit:** AuditLog

Migrations with Alembic. SQLite allowed for local dev of the backend only if
PostGIS-specific features are behind an interface; otherwise use Postgres in
Docker locally. The edge gateway keeps SQLite.

## 7. API groups (`/v1`)

`/auth /users /journeys /tracking /checkins /sos /signalmesh /devices /fitness
/co-trackers /connections /groups /plans /subscriptions /payments /admin`

Every route: request validation, authentication, per-resource authorization,
rate limiting on social and auth routes, audit logging on safety, location,
health and billing changes.

## 8. Mobile app structure (proposed)

```
src/app/(tabs)/home | explore | journeys | safety | profile
src/features/<module>/      screens, components, hooks per module
src/signalmesh/             existing lib/ code moved here unchanged, plus adapters
src/services/               api client, auth, location, fitness provider
src/ui/                     design system (tokens, components)
```
Move existing `src/lib` files without editing logic (path changes only).

## 9. Fitness

`FitnessProvider` interface → `HealthConnectAdapter` (Android). `FitnessSyncService`
reads only permitted types; `ActivityRepository` stores locally; server sync is
opt-in and minimal. Fitness never flows into SOS or responder views by default.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Background tracking/relay killed by Android battery management | Foreground service with notification; physical tests with battery saver |
| Scope (14 modules) vs team size | Phase gates; MVP per module |
| Stranger safety in co-tracker discovery | Coarse location only, consent, block/report, moderation before launch |
| Payment/platform policy | Research + legal review before integration |
| Health data policy | Minimal permissions, Play declaration, privacy policy |
