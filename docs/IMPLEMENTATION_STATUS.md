# Implementation status

Updated: 2026-11-21 (Phase 1 decisions). Update this file at the end of every phase.

Test levels: **Unit** · **Integration** (in-process / local services) ·
**Simulated** (mock or fake transport) · **Physical** (real devices) · **Not tested**.

## Phase progress

| Phase | Scope | Status |
|---|---|---|
| 0 | Audit, protect work, docs | **Done** — committed on `signalmesh-prototype` (`60ac176`) |
| 1 | Product spec & architecture | **In progress** — D1–D4 approved (DECISIONS.md); contract v2 specified and reviewed (R1–R9), not implemented; drafts awaiting approval: SCREENS.md (91 screens), DESIGN_SYSTEM.md, APP_ID_MIGRATION.md, DASHBOARD_IMPORT.md; dashboard code location still needed |
| 2 | TrackMate core app | **In progress** — increments 1–2 built and run on Phone 1 (see below) |
| 3 | SignalMesh reliability | Partly exists (prototype) |
| 4 | Fitness / Health Connect | Not started |
| 5 | Co-trackers & groups | Not started |
| 6 | Responder dashboard | Not started (teammate's work not in repo) |
| 7 | Plans & pricing | Not started |
| 8 | Satellite | Research framework only (SATELLITE.md) |
| 9 | Security, testing, pilot | Not started |

## Feature status

| Feature | Built | Highest test level | Notes |
|---|---|---|---|
| Edge gateway: SOS store, dedupe, relay path | Yes | Unit + Integration | 21 pytest PASS |
| Gateway: ack / resolve / ack-status | Yes | Unit + Integration | |
| Gateway: check-ins + overdue detection | Yes | Unit + Integration; Physical (check-in from Phone 1 over USB) | |
| Gateway: relay heartbeats, status, WebSocket | Yes | Unit + Integration | |
| Gateway: upstream forwarding queue | Yes | Unit (fake transport) | No real upstream exists |
| Mobile: offline outbox, ID once, retry | Yes | Simulated ("simulate no signal") — **not physically re-verified on dev build** | |
| Mobile: SOS send → gateway | Yes | Integration (mock + curl); **Physical: not tested** | |
| Mobile: ack shown on phone | Yes | **Not tested physically** | |
| Mobile: check-in timer | Yes | Physical (Phone 1, USB) | |
| Mobile: relay mode | Yes | Unit (HTTP parser) | **Physical: not tested** |
| Phone 1 → Phone 2 → gateway | Yes | **Not tested** | Blocked on shared network (Phone 2 hotspot planned) |
| Custom Android build | Yes | Physical: installs + launches on both phones | |
| Mobile UI (final design) | No | — | Placeholders only |
| Responder dashboard | No | — | |
| Accounts / auth | No | — | |
| Fitness, co-trackers, pricing, satellite | No | — | |

## Phase 2 increments (2026-11-21, Phone 1 = OPPO CPH2793, USB)

| Item | Result | Evidence / notes |
|---|---|---|
| App ID → `com.trackmate.app`, name TrackMate | PASS (Physical) | Built + installed; "TrackMate" icon on launcher. Old `com.signalmesh.app` still installed (queues verified empty) — uninstall after both phones are verified. Play ID free (404); **name "TrackMate" used by ≥13 Play apps — trademark review open** |
| Light design system (`src/ui`) | PASS (Physical) | Screenshots of Home, tracking |
| 5-tab navigation (Home, Explore, Journeys, Safety, Profile) | PASS (Physical) | Tabs switch; labels forced visible |
| Tourist/Trekker mode (first-run + Profile switch) | Built; Profile switch PASS (Physical); first-run welcome screen NOT TESTED (mode was already chosen on device) | |
| Home: SOS entry → Safety tab | PASS (Physical) | |
| Home: real safety status (connection, check-in, waiting messages) | PASS (Physical) | Showed "Not connected" with default URL, connected after setting gateway |
| Explore | Honest "coming soon" (no sample data) | |
| Create journey (form, validation, SQLite) | PASS (Physical) | Trek created via the form, detail page shown |
| Start tracking, live time, current location | PASS (Physical) | Real fix ±13 m; distance correctly "—" while stationary; "open in maps" matched device location |
| Distance filter logic | PASS (Unit) | `scripts/test-geo.mts` |
| Pause / resume / finish, journey history summary | Built; **NOT TESTED physically** | |
| GPS denied / error states | Built; NOT TESTED physically | |
| Altitude | Removed: Android altitude is ellipsoidal, not sea level | Needs MSL source |
| Background tracking | Not built (foreground only, stated in UI) | |
| Existing SOS / queue / check-in / relay | Preserved (`src/lib` logic untouched) | |
| **Inc 3** Safety screen (hold-to-send, help type + urgency, location/connection warnings, check-in, alarm, Call 112) | PASS (Physical) | Screenshot; uses the same `createSos` → outbox → `syncNow` flow |
| Quick tap does not send | PASS (Physical) | Gateway message count stayed 0 |
| Hold 1.5 s sends; status page opens | PASS (Physical) | Gateway stored 1 SOS, GENERAL/LOW, path MOBILE_01→GATEWAY_01, received 0.4 s after creation |
| SOS status page: truthful steps | PASS (Physical) + Unit | "Reached the safety network / waiting" until ack; `scripts/test-sos-status.mts` |
| Responder ack reaches the phone (scenario 6, direct over USB) | PASS (Physical) | `POST /gateway/ack` → phone showed "Acknowledged … Test responder (Mac)" within the 3 s poll |
| Journey check-in uses SignalMesh timer | PASS (Physical) | Starting the trek started a 15-min check-in; Home showed "due in 9 minutes" |
| Pause tracking | PASS (Physical, by user) | Home showed "Tracking paused" |
| Offline queue in new UI (simulate no signal → queued → delivered) | NOT TESTED physically | Logic unchanged from prototype |
| TalkBack activate-to-send on SOS button | Built; NOT TESTED | |
| **Inc 4** SOS history, Help others (relay), Connection settings redesigned (UI only, same calls) | PASS (Physical) | Screenshots on Phone 1; "Test connection" returned "The safety station answered…" |
| v2 review R1 confirmed on device | Known gap | Gateway shows the test SOS RESOLVED, phone still shows Acknowledged: polling stops at ACKNOWLEDGED. Fix scheduled with contract v2 (Phase 3) |
| **Inc 5** Trusted contacts (add, list, remove; stored on phone only) | PASS (Physical) | Added "Test Contact" +910000000000 on Phone 1; validation unit-tested (`scripts/test-sms-text.mts`) |
| Text trusted contacts from an SOS (prefilled SMS, user sends) | PASS (Physical) | Android chooser → Google Messages opened with recipient and prefilled text incl. map link and time. **Not sent**; left as a draft |
| SOS text with no GPS | Unit only | Says "no location", never invents one |
| Automatic SMS sending | Not built by design | Would need SMS permission (restricted by Play policy); the user sends |
| Emergency description field | Not built (needs an additive `description` param on `createSos`; deferred to avoid touching queue logic) | |
| Connection settings save bug | Fixed: field now also saves on blur/Enter | Found on device |

Follow-ups found: block `SYSTEM_ALERT_WINDOW` in release builds (present in generated main manifest); TrackMate on Phone 2 not installed yet.

## Brand & accounts — Increment 1 (2026-11-21, Phone 1 over USB)

| Item | Result | Evidence |
|---|---|---|
| Logo stored unmodified | PASS | `assets/brand/trekmate-logo.webp` checksum = supplied file; PNG copy is format conversion only (1254×1254) |
| Brand name | Decided: **TrackMate** (DECISIONS.md D5) | Logo artwork still reads "TrekMate": TrackMate version of the logo needed from the designer; no production icon until then |
| Brand tokens (contrast computed) | PASS (Unit) | Suggested muted `#708075` failed AA (4.10:1) → `#5E6E63`; leaf green & orange fail as text (≈2.5–2.7:1) → accents only, `#B25300` for orange text |
| Splash | PASS (Physical) | Native splash = warm background only (Android 12+ would clip the logo to a circle); in-app splash shows full logo, name, tagline, then fades |
| Onboarding ×3 with Skip / Back / Continue / Get started | PASS (Physical) | Screenshots of pages 1 and 3 |
| Account backend (`backend/`, FastAPI + SQLite dev, migrations) | PASS (Unit/Integration, 20 tests) | argon2id hashing, hashed session tokens, consent records, lockout, rate limit, enumeration-safe errors, reset codes single-use |
| Registration (details → consent → create) | PASS (Physical) | DB: user, argon2id hash, no plaintext; emergency contact; 2 consent rows with user ID, version, timestamp, source |
| Validation | PASS (Physical + Unit) | Empty form → "Please fix 6 fields"; found & fixed on device: letters in phone numbers were silently stripped (`+919000000001test@…` accepted) — now rejected in app and backend |
| Terms / Privacy / Consent pages | PASS (Physical) | Draft banner + version shown; boxes unticked; Create disabled until both ticked; location/health/escalation consents explicitly separate |
| Session persistence (secure storage) | PASS (Physical) | Force-stop + relaunch stays signed in |
| Logout | PASS (Physical) | Server shows session revoked; app returns to sign-in |
| Login (phone + password), wrong password | PASS (Physical) | Generic error for wrong password; correct one opens Home |
| Forgot password UI | Integration only; **NOT TESTED physically** | No email/SMS provider: dev mode writes codes to server log, otherwise not delivered — UI says so |
| Email / phone verification | Not available | No provider configured; accounts show "not verified" |
| Continue without an account | Built; NOT TESTED physically | SOS and local features work without sign-in |
| App icon | Not changed | Waiting for name decision; adaptive icon would also crop the square logo — needs a foreground-only asset |
| Logo background | Note | Logo file has a white square behind the rounded border; a transparent version would blend with the warm background |

## Single-phone relay check (2026-11-21, Phone 1 as relay over USB, sender simulated from the Mac)

Level: **Physical relay node, simulated sender.** Not the two-phone test.

| Check | Result | Evidence |
|---|---|---|
| Relay starts in the dev build | **FAIL → fixed → PASS** | Bug: `require('react-native-tcp-socket').default` was undefined (package overwrites `module.exports`); error text wrongly blamed Expo Go. Fixed in `relay.ts` (`mod.default ?? mod`, real error shown) |
| Relay serves HTTP on the phone | PASS | `GET /health` → `{"node_id":"MOBILE_01","role":"relay"}` from the phone |
| Relay stores before forwarding, adds itself to path | PASS | Phone SQLite: received 13:05:29.081 → forwarded 13:05:29.219, hops `SIM_SENDER→MOBILE_01`; gateway path `SIM_SENDER→MOBILE_01→GATEWAY_01`, hop_count 1 |
| Relay answers RELAYED, never claims delivery | PASS | `201 {"status":"RELAYED"}` |
| Duplicate retries | PASS | 2 relay retries → `200 duplicate:true`, not re-forwarded; 1 gateway record, 1 relay row |
| Gateway down → relay holds → forwards on return | PASS (after discarding an invalid first attempt*) | Gateway process stopped: relay `PENDING`, 5 attempts, ack-status via relay = `RELAYED`; restart → forwarded ~2 s later after 10 attempts; created_at preserved |
| Ack reaches sender's status query through relay | PASS | Before: `DELIVERED`; after gateway ack: `ACKNOWLEDGED · Test responder (Mac)` via relay |
| Gateway persistence across restart | PASS | All 3 test records present after restart |
| Relay address shown to users | **Known issue** | Shows `192.0.0.2` (mobile-data interface) when Wi-Fi is off; re-check with hotspot in the two-phone test |

\* Removing `adb reverse` did not cut the phone's existing keep-alive connection, so the first "gateway down" run was not a real outage and was not counted.

## Scenario checklist (SignalMesh)

| Scenario | Result |
|---|---|
| 1 Normal delivery via relay | NOT TESTED |
| 2 Gateway unavailable, relay stores and forwards | NOT TESTED (logic unit-tested at gateway upstream level only) |
| 3 Internet unavailable, LAN works | NOT TESTED |
| 4 Duplicate → one record | Unit + Integration PASS (gateway); not physically |
| 5 No GPS accepted, not invented | Unit + Integration PASS (gateway); not physically |
| 6 Responder ack reaches phone | Integration PASS (gateway ack-status); **not physically** |
