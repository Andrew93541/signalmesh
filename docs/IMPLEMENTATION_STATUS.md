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
| Existing SOS / queue / check-in / relay | Preserved (logic files untouched); Safety tab is the old SOS screen in light colours | Redesign = Increment 3 |
| Connection settings save bug | Fixed: field now also saves on blur/Enter | Found on device |

Follow-ups found: block `SYSTEM_ALERT_WINDOW` in release builds (present in generated main manifest); TrackMate on Phone 2 not installed yet.

## Scenario checklist (SignalMesh)

| Scenario | Result |
|---|---|
| 1 Normal delivery via relay | NOT TESTED |
| 2 Gateway unavailable, relay stores and forwards | NOT TESTED (logic unit-tested at gateway upstream level only) |
| 3 Internet unavailable, LAN works | NOT TESTED |
| 4 Duplicate → one record | Unit + Integration PASS (gateway); not physically |
| 5 No GPS accepted, not invented | Unit + Integration PASS (gateway); not physically |
| 6 Responder ack reaches phone | Integration PASS (gateway ack-status); **not physically** |
