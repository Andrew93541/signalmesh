# Implementation status

Updated: 2026-11-21 (Phase 1 decisions). Update this file at the end of every phase.

Test levels: **Unit** · **Integration** (in-process / local services) ·
**Simulated** (mock or fake transport) · **Physical** (real devices) · **Not tested**.

## Phase progress

| Phase | Scope | Status |
|---|---|---|
| 0 | Audit, protect work, docs | **Done** — committed on `signalmesh-prototype` (`60ac176`) |
| 1 | Product spec & architecture | **In progress** — D1–D4 approved (DECISIONS.md); contract v2 specified and reviewed (R1–R9), not implemented; drafts awaiting approval: SCREENS.md (91 screens), DESIGN_SYSTEM.md, APP_ID_MIGRATION.md, DASHBOARD_IMPORT.md; dashboard code location still needed |
| 2 | TrackMate core app | Not started |
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

## Scenario checklist (SignalMesh)

| Scenario | Result |
|---|---|
| 1 Normal delivery via relay | NOT TESTED |
| 2 Gateway unavailable, relay stores and forwards | NOT TESTED (logic unit-tested at gateway upstream level only) |
| 3 Internet unavailable, LAN works | NOT TESTED |
| 4 Duplicate → one record | Unit + Integration PASS (gateway); not physically |
| 5 No GPS accepted, not invented | Unit + Integration PASS (gateway); not physically |
| 6 Responder ack reaches phone | Integration PASS (gateway ack-status); **not physically** |
