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

## Relay networking + responder dashboard (2026-11-21)

| Test | Level | Result | Evidence |
|---|---|---|---|
| Relay receives SOS, stores before replying, dedupes | Unit (parser) + Physical (Phone 1 relay, simulated sender, USB) | PASS | Earlier single-phone check; again today: `201 RELAYED` then gateway path `SIM_SENDER→MOBILE_01→GATEWAY_01` |
| Relay shows a confirmed LAN address | Built | NOT TESTED on Wi-Fi | Detects the interface used to reach the next hop; over USB it correctly shows "not confirmed" (`192.0.0.2`) |
| Gateway → backend with gateway token | Unit + Integration + Physical | PASS | `upstream.sync_ok: true`; bad token keeps message queued (test) |
| Rejected message does not block queue | Unit | PASS | New test |
| **Real SOS from Phone 1 app → gateway → backend → dashboard** | **Physical** (USB, no relay phone) | **PASS** | Gateway 14:02:39.295 → backend 14:02:39.450, path `MOBILE_01→GATEWAY_01→BACKEND_01`; dashboard Command Center + detail |
| **Dashboard acknowledge → Phone 1** | **Physical** | **PASS** | Ack 19:33:28 (local) → Phone 1 DB `ACKNOWLEDGED/Dev Responder/14:03:31Z`; phone screen "A responder has acknowledged your request" |
| Duplicate retry → one incident | Integration (real services) | PASS | 2 retries → `duplicate:true`; backend 1 incident, events `RECEIVED, ACKNOWLEDGED` |
| Backend offline → gateway holds → delivers on return | Integration with **physical phone relay** | PASS | `pending:1, reachable:false` → after restart backend has `SIM_SENDER→MOBILE_01→GATEWAY_01→BACKEND_01`, created_at preserved, null GPS kept |
| Gateway offline → relay holds | Physical (earlier today) | PASS | Single-phone relay check |
| Null GPS | Unit + Integration | PASS | Stored null, dashboard says "No location is shown rather than a guess" |
| Acknowledge / dispatch (team required) / resolve (note required), never backwards | Unit | PASS | `backend/tests/test_incidents.py` |
| Acknowledge from dashboard UI | Physical (browser) | PASS | |
| Dispatch / resolve from dashboard UI | Built | NOT TESTED in browser | API tested |
| Unauthorized admin actions fail | Unit + Integration | PASS | 401 without session, 403 for normal users (API and dashboard login) |
| WebSocket live updates + polling fallback | Unit (ticket, push) + Browser | PASS | Dashboard showed "Live updates connected" |
| **Phone 1 → Phone 2 → gateway (two phones, Wi-Fi)** | Physical | **NOT TESTED** | Phone 2 not connected; Mac on college network |
| Relay offline (sender holds) | Physical | NOT TESTED in this run | Sender outbox logic tested earlier with "simulate no signal" |
| App restart during delivery | — | NOT TESTED | |
| Location accuracy / location timestamp in SOS | — | **Not in contract** | Needs contract change (approval) |
| Relay/gateway request authentication | — | **Not implemented** | Any LAN device can post to relay/gateway |
| Background relay (screen off / app backgrounded) | — | Not implemented | Foreground + keep-awake only |

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

## Portable online + offline build (2026-11-21, in progress, not committed)

Labels: **unit** = automated test, **integration** = real processes on the Mac, **physical** = on a phone.

| Item | Result | Evidence |
|---|---|---|
| GPS metadata (accuracy, capture time, source, last-known) phone → gateway → backend | PASS (unit + integration) | gateway 27 tests, backend 57 tests; SOS `SM-CHECK-7e6734ea2f82` sent through the running gateway, backend `/location` returned accuracy 14.5 m, capture time unchanged, receipt time separate, freshness CURRENT |
| Mock locations refused, no IP/demo/random fallback | PASS (code review) / NOT TESTED physically | `location.ts` returns no fix for `mocked` positions |
| Dashboard: accuracy, capture vs receipt time, Current / Last-known / No location, copy coordinates | PASS (integration, browser) | incident page for the check SOS |
| Authenticated location endpoint `GET /v1/admin/incidents/{id}/location` | PASS (unit + integration) | |
| Profile editing API (fields, photo, up to 5 emergency contacts, email/phone change with code, password change) | PASS (unit) | `tests/test_profile.py`, 20 tests; protected fields (id, role, verification, email, phone) rejected with 422 |
| Profile editing screens in the app | Built, type-checked; NOT TESTED physically | `profile/edit`, `profile/contact`, `profile/change`, `profile/password` |
| Email/phone codes delivered | NOT AVAILABLE | no email/SMS provider; dev mode writes codes to the server log only |
| Connection modes: online gateway (https) first, then local network; mode shown on Safety tab | Built; NOT TESTED physically | `sync.ts` |
| Backoff 3 s → 60 s, retry on network change / app foreground | PASS (unit) / NOT TESTED physically | `scripts/test-backoff.mts` |
| Relay forwarder backoff, heartbeat every 15 s instead of 3 s | Built; NOT TESTED physically | `relay.ts` |
| No localhost / IP defaults in release builds | PASS (code review) | addresses come from `EXPO_PUBLIC_*` or the phone's settings |
| Standalone release APK (local Gradle `assembleRelease`, arm64) | PASS (physical, Phone 1) | `app-release.apk`, versionCode 1 / 1.0.0, 37.9 MB, sha256 `d9ad233b…f399`; installed over the dev build with data kept, launched with **no Metro and no adb reverse**, no crash; detected mobile data + internet; showed "Not connected" because its saved addresses still point at the Mac over USB |
| EAS cloud build | NOT RUN | needs `eas login`; profile `preview` (APK) is in `apps/mobile/eas.json` |
| Hosted HTTPS gateway/backend | NOT DONE | needs a hosting account |
| Nearby mesh (Nearby Connections: Bluetooth / Wi-Fi Direct, no shared network) | **PASS (physical, 3 phones)** | 2026-11-21 20:12–21:57. Phone 1 (OPPO, `MOBILE_01`) and Phone 2 (Samsung SM-S942B, `MOBILE_0DF5`) connected in ~5 s with no common network; reconnected after reinstall. 12 SOS delivered to the gateway via a third phone `MOBILE_42CB` over the internet tunnel: 6 × `MOBILE_0DF5 > MOBILE_01 > MOBILE_42CB > GATEWAY_01`, 5 × `MOBILE_01 > MOBILE_0DF5 > MOBILE_42CB > GATEWAY_01`, 1 × `MOBILE_0DF5 > MOBILE_42CB > GATEWAY_01`. SOS held on Phone 2 while it had no route were delivered later (store-and-forward). Real GPS on all (±4–12 m, current at SOS). |
| Acknowledgement back to the sender over the mesh | **PASS (physical)** | SOS `…e248c55e` acknowledged on the dashboard at 21:56:49; the sender `MOBILE_0DF5` showed "acknowledged" on its Safety tab (reported by the tester after reopening the app). |
| Online mode through a public HTTPS gateway | PASS (physical) | Cloudflare quick tunnels for gateway and account server; phones on mobile data reached them. Temporary: addresses change when the tunnels restart. |
| Release 1.0.1 (build 2) | Built | sha256 `2f302bd7…dc2f62`; tunnel addresses built in. Drive upload not done from here (connector limit 10 MB, APK 38 MB). |
| Two-phone LAN relay test (shared Wi-Fi / hotspot, RUNBOOK §5) | NOT TESTED | superseded in practice by the mesh test above; LAN relay code is unchanged |

## Scenario checklist (SignalMesh)

| Scenario | Result |
|---|---|
| 1 Normal delivery via relay | NOT TESTED |
| 2 Gateway unavailable, relay stores and forwards | NOT TESTED (logic unit-tested at gateway upstream level only) |
| 3 Internet unavailable, LAN works | NOT TESTED |
| 4 Duplicate → one record | Unit + Integration PASS (gateway); not physically |
| 5 No GPS accepted, not invented | Unit + Integration PASS (gateway); not physically |
| 6 Responder ack reaches phone | Integration PASS (gateway ack-status); **not physically** |

## FEEDS — Increment 1 (2026-11-22, not committed)

| Feature | Result | Type / evidence |
|---|---|---|
| Bottom navigation Home · Explore · **Feeds** · Safety · Profile (newspaper icon) | Built; NOT TESTED on a phone | Journeys moved from a tab to a normal screen, opened from Home ("All journeys") and Profile ("Journeys"); `journey/new` and `journey/[id]` unchanged |
| Backend migration 4: `event_categories`, `events`, `event_applications` (lifecycle and application statuses in separate tables; indexes on status+visibility+start, organizer, lat/lon, category) | PASS (unit) | schema_version 4 on the running backend |
| `GET /v1/events` Discover: only PUBLISHED + PUBLIC + not finished; search, category, location, date range, difficulty, seats-available filters | PASS (unit + integration) | `tests/test_events.py`; read through the public tunnel |
| Organizer contact never in public responses | PASS (unit) | |
| `GET /v1/events/mine` (all statuses + private fields, own events only), `GET /v1/events/{id}` (unpublished = 404 for others), `GET /v1/event-categories`, cover endpoint | PASS (unit) | |
| Available seats = limit − ACCEPTED applications (pending does not hold a seat) | PASS (unit) | |
| Feeds screen: Discover / My Events / Applied, event cards, filters, empty and error states, pull to refresh | Built, type-checked; NOT TESTED on a phone | release 1.0.2 build 3 |
| Event detail screen | Built; NOT TESTED on a phone | |
| Applied tab | Placeholder (applications are Increment 4) | |
| Creating events | NOT BUILT (Increment 2) | My Events says so |
| Dev-only `manage.py create-test-event` | PASS | refuses without `TRACKMATE_DEV_MODE=1`; one `[TEST] Feeds screen check` event exists in the dev database |

## Recipient SOS alerts (siren) — 2026-11-22, not committed

Implemented = code written and built. Automated = unit/integration tests. Physical = two real phones.

| Feature | Implemented | Automated | Physical |
|---|---|---|---|
| Original siren (synthesised by `apps/mobile/scripts/make-siren.py`, 2.4 s loop) | Yes | — | NOT TESTED |
| Native alert on SOS receipt (mesh path in Kotlin, Wi-Fi relay path via JS), deduplicated by incident ID across restarts | Yes | — (native) | NOT TESTED |
| High-importance channel "Nearby SOS alerts", persistent notification, Acknowledge / View location / Call sender actions | Yes | — | NOT TESTED |
| Siren loops (alarm stream, in-app volume) + vibration until acknowledged / responder acted / 10 min | Yes | — | NOT TESTED |
| No siren when notifications/channel are off or Do Not Disturb is on (honest warnings in Help others) | Yes | — | NOT TESTED |
| Full-screen intent only when Android allows (`canUseFullScreenIntent`), else heads-up; lock screen shows "Emergency SOS nearby" only (private) | Yes | — | NOT TESTED |
| Foreground service (connectedDevice) while the nearby mesh is on | Yes | — | NOT TESTED |
| Pop-up screen: red SOS heading, name/initials, type, incident ID, received time, coordinates with Current / Last-known / None, distance | Yes | freshness rule: PASS (unit) | NOT TESTED |
| Local acknowledgement saved (commit) before siren stops; LOCAL vs CONFIRMED shown | Yes | — | NOT TESTED |
| Acknowledgement queued and delivered: mesh PEER_ACK frames toward the sender + gateway `POST /gateway/peer-ack` when a route exists | Yes | gateway: PASS (6 tests) | NOT TESTED |
| Gateway → backend forwarding, retried until the backend has the SOS; recorded as `PEER_ACK` event, incident state unchanged | Yes | PASS (gateway + backend tests); PASS (live integration via the public tunnel) | — |
| `ack-status` gains `seen_by` (additive); sender's SOS page shows "Seen by N nearby TrackMate users" (nearby vs server-confirmed) | Yes | gateway: PASS | NOT TESTED |
| Dashboard history labels nearby acknowledgements as "not a responder" | Yes | tsc/eslint PASS | — |
| CALL SENDER only when the sender opted in ("Let nearby TrackMate users call me", off by default); the gateway drops the number | Yes | live check: number not stored by gateway | NOT TESTED |
| TRANSMITTED state | Not added (decision 4): RELAYED already covers it | — | — |
| Alerts for faraway contacts (push) | Not built (decision 6) | — | — |

## Final hackathon integration — 2026-11-22 (app 1.0.4 build 5, not committed)

Columns: UI = screen built · Backend = connected to real APIs · Automated = tests · Physical = on a phone (none connected this session).

| Area | UI | Backend | Automated | Physical |
|---|---|---|---|---|
| Bottom nav: Home · Feed · Analytics · Safety · Profile (Explore and Journeys kept as screens) | Yes | — | type check | NOT TESTED |
| Feed: Discover / Following posts, paginated, pull to refresh | Yes | Yes | backend PASS | NOT TESTED |
| Create post with photos/videos (streamed upload, type + size + signature checked), caption, location name, opt-in exact coordinates | Yes | Yes | backend PASS | NOT TESTED |
| Like/unlike, comments (delete own; post owner can moderate), edit caption, delete post (files removed) | Yes | Yes | backend PASS | NOT TESTED |
| Follow/unfollow, followers/following lists, open profiles from posts | Yes | Yes | backend PASS | NOT TESTED |
| Report and block (block hides both ways, removes follows; Settings → Blocked users) | Yes | Yes | backend PASS | NOT TESTED |
| Share post | Yes (system share sheet, text only; there are no public post links) | — | — | NOT TESTED |
| Events inside Feed (Upcoming / My Events / Applied) | Yes (unchanged Increment 1) | Yes | backend PASS | NOT TESTED |
| Event creation, admin approval, organizer applicant approval (Increments 2–5) | NOT BUILT | NOT BUILT | — | — |
| Instagram-style profile: photo, name, username, bio, shown home location, interests, counts, grid, follow / edit | Yes | Yes | privacy test PASS (no email/phone/contacts/role) | NOT TESTED |
| Analytics: Health Connect steps, distance, calories (labelled source; never estimated), active minutes (logged workouts), weekly chart, goal, date selector, recent activity | Yes | native Health Connect (read only, nothing sent to server) | helpers PASS | NOT TESTED |
| Analytics: TrackMate GPS trek time and distance, labelled separately | Yes | local | helpers PASS | NOT TESTED |
| Plan & pricing: Free; Premium per trip ₹199 bundle (3 group passes), ₹149 community, ₹149 active SOS | Yes | Yes | PASS (prices, no duplicates, never ACTIVE without payment) | NOT TESTED |
| Payment | Not integrated (no provider configured); requests stay PENDING_PAYMENT / NOT_CONFIGURED | | | |
| Settings (gear on Profile): account, safety, notifications, privacy, blocked users, terms, privacy policy, help, version, sign out at bottom with confirmation | Yes | sign-out revokes session (existing) | existing auth tests PASS | NOT TESTED |
| Safety options (defaults on; escalation needs consent + a contact; offline queue always on) wired to siren/notification/vibration, trek GPS and contact texting; synced to account | Yes | Yes | backend PASS | NOT TESTED |
| Android permission status + request + open settings (notifications, location, nearby devices; background location / SMS / microphone not used) | Yes | — | — | NOT TESTED |
| Regression: SOS, relay, gateway, offline queue, alerts | unchanged code paths | | gateway 33, backend 82, mobile 9 scripts PASS | NOT RE-TESTED on phones |

## Cloud fix, messaging, demo data — 2026-11-22 (app 1.0.5 build 6, not committed)

| Item | Result |
|---|---|
| Cause of "can't post / cloud not working" | The Mac had stopped all services and both quick tunnels (530 from Cloudflare). Restarted; servers and tunnels now run under `caffeinate -i` so idle sleep does not stop them (closing the lid still does). New tunnel addresses are built into 1.0.5. |
| Follower messaging: inbox, chat (refreshes every 4 s), Message button on profiles of people who follow you, unread badge on Feed | Backend PASS (4 tests); UI built; NOT TESTED on a phone yet |
| Rules: start a chat only with someone who follows you; either side can reply; blocking stops it; only the two people can read it | PASS (unit) |
| Dev-only demo data: 4 "… (demo)" accounts @demo.trackmate.test (unusable passwords), 6 posts with landscapes drawn in code, likes, comments, demo messages; `manage.py remove-demo` deletes all of it | PASS (unit); seeded for jivitesh@test.com and test.trekker@example.com |
| Feed, demo images, like/unlike, post detail + comments over the public tunnel from a phone on mobile data | PASS (physical, Phone 1: backend log + screenshot) |
| Creating a post (photo upload) on the phone | NOT TESTED yet |
