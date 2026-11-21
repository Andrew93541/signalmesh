# TrackMate mobile screen list (draft for approval)

Every screen uses the design system in `DESIGN_SYSTEM.md`. IDs are stable
references for design, tickets and tests.

**Columns:** Mode = Tourist (T), Trekker (K), or both (·). Plan = lowest plan
that unlocks it (F = Free). **States** every data screen must design: loading,
empty, offline, error, success — listed only where they need special handling.

**Global rules**
- SOS is reachable from every screen in ≤ 1 tap (persistent SOS button in the
  Safety tab bar item + Home), and SOS is **Free on every plan**.
- The bottom tabs: **Home · Explore · Journeys · Safety · Profile**.
- Consumer copy never shows networking jargon (no "gateway", "hop", "relay node").
  The plain-language mapping is in DESIGN_SYSTEM.md § Status language.

## A. First run and account

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| A1 | Splash | · | F | Logo, loads stored session; if an SOS is queued, opens F4 directly | Queued SOS → skip to F4 |
| A2 | Welcome (3 short cards) | · | F | What TrackMate does; "SOS works without an account"; Get started / Log in | |
| A3 | Choose your mode | · | F | Tourist or Trekker, with one-line explanation; changeable later (K9) | |
| A4 | Sign up | · | F | Name, phone or email, password or OTP; links to terms & privacy | Validation, rate-limit message |
| A5 | Log in | · | F | Phone/email + password/OTP; "Forgot password" | Locked account |
| A6 | Verify phone/email | · | F | OTP entry, resend timer | Expired code |
| A7 | Permissions primer | · | F | Why location and notifications are needed; asked just-in-time, not all at once | Denied → explain how to enable |
| A8 | Add trusted contacts (skippable) | · | F | Pick from contacts or enter; explains what they will receive | Zero contacts warning on Safety |
| A9 | Emergency info (optional) | · | F | Optional notes the user chooses to include with an SOS (e.g. allergies). Off by default; never pulled from fitness data | |

## B. Home

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| B1 | Home — Tourist | T | F | Current/next journey card, safety status strip (contacts, check-in, connectivity), quick SOS, shortcuts: Explore, Co-travellers, Fitness | No journey → "Plan a trip" |
| B2 | Home — Trekker | K | F | Active trek card (time, distance, last fix), Start tracking, check-in countdown, quick SOS, shortcuts: Fitness, Group | Tracking active → live card |
| B3 | Notifications | · | F | Check-in reminders, connection requests, group invites, SOS updates | Empty |

## C. Explore (Tourist focus, usable by both)

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| C1 | Explore | · | F | Search, destinations, public group journeys, co-traveller entry | Offline → cached only |
| C2 | Search results | · | F | Destinations, treks, groups; filters | No results |
| C3 | Destination detail | T | F | Overview, safety notes, nearby co-travellers count (not identities), "Plan journey here", Save | |
| C4 | Trek detail | K | F | Route summary, difficulty, distance, elevation (if source exists), "Plan this trek" | No elevation data → say so |
| C5 | Saved places | · | F | Saved destinations and treks | Empty |

## D. Journeys

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| D1 | Journeys | · | F | Upcoming, active, past; groups I'm in | Empty |
| D2 | New journey (stepper) | · | F | Type (trip/trek) → destination/route → dates → stops/itinerary → companions → safety (contacts, check-in interval) → review | Limit reached → J1 (non-safety only) |
| D3 | Journey detail | · | F | Itinerary timeline, members, safety settings, share with contacts, Start | |
| D4 | Edit itinerary | T | F | Reorder stops, notes, times | |
| D5 | Route map | · | F | Planned route, stops, last-known location | Offline map unavailable → list view |
| D6 | Share journey | · | F | Choose trusted contacts, what they see (plan only / live location), duration; revocable | |
| D7 | Journey history detail | · | F (basic) / Plus (extended) | Track, stats, check-ins, incidents | Beyond Free history window → J1 |

## E. Trekker tracking

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| E1 | New trek | K | F | Route, difficulty, expected duration, turnaround time, check-in interval, group | |
| E2 | Before you go | K | F | Checklist: battery, offline info saved, contacts told, check-in set; shows battery-saver impact | Low battery warning |
| E3 | Tracking — active | K | F | Start/Pause/Resume/Stop, duration, distance, elevation (if available), last GPS fix time and accuracy, battery mode (Normal/Saver), SOS | GPS lost → last-known + time |
| E4 | Tracking — paused | K | F | Paused banner, resume, stop; check-in timer still runs | |
| E5 | Stop tracking confirm | K | F | Confirm, keep check-in on/off | |
| E6 | Trek summary | K | F (basic) / Plus (advanced stats) | Map, distance, duration, elevation gain (if available), check-ins | |
| E7 | Offline trek info | K | F (basic) / Adventure (offline maps) | Saved route, stops, contacts, emergency numbers | Not downloaded |
| E8 | Leader controls | K | F (join) / Plus+ (lead) | Group roster, members' sharing status (only consented), group check-in, turnaround reminder | Member not sharing → shown as "not sharing" |

## F. Safety

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| F1 | Safety hub | · | F | Big SOS, check-in card, trusted contacts, connectivity status, SOS history | No contacts → prompt |
| F2 | SOS — hold to send | · | F | Press-and-hold ring (1.5 s), haptic; optional quick category; **Send now** always first | — |
| F3 | SOS — details (optional) | · | F | Category, short description, include emergency info (A9) toggle; "Send now" stays visible; never blocks sending | — |
| F4 | SOS — status | · | F | Plain-language progress: saved → passed to a nearby device → reached the safety network → acknowledged → team assigned; location shared (or "location unavailable"); local alarm; cancel ("I'm safe") | Offline: "We're saving your message and will keep trying" |
| F5 | How your message travelled | · | F | Step-by-step path with times ("Your phone → Priya's phone → Base camp station"), honest about what is not confirmed | |
| F6 | Check-in timer | · | F | Countdown, interval, "I'm OK" button, who is alerted if missed | Overdue state |
| F7 | "Are you safe?" prompt | · | F | Full-screen prompt when a check-in is due: I'm OK / Need help (→ F2) | |
| F8 | Trusted contacts | · | F | List, invite status (pending/verified), what each can see | Empty |
| F9 | Add / edit contact | · | F | Name, phone, relationship, what they receive; sends verification invite | Unverified contact badge |
| F10 | Connectivity | · | F | "Internet: available / not available", "Nearby help devices: 2", "Messages waiting: 1"; no jargon | All paths down |
| F11 | Help others (relay mode) | · | F | Explain, switch on, keep phone awake/plugged in, messages passed on count | Not supported on build |
| F12 | SOS history | · | F | Past SOS with final status | Empty |
| F13 | Local alarm | · | F | Sound + vibration + flashlight strobe toggle, stop button | |
| F14 | Location status | · | F | Permission state, last fix time/accuracy, "location unavailable" explained, fix-it actions | Permission denied |

## G. Fitness (Health Connect)

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| G1 | Fitness dashboard | · | F (basic) / Plus (enhanced) | Today: steps, distance, active time; recent activities; weekly summary chart; hikes/treks; data source chip | Not connected → G2 |
| G2 | Connect Health Connect | · | F | What TrackMate reads and why, what it never does (no sharing with responders by default), Connect | Health Connect not installed/unsupported → G7 |
| G3 | Choose data to share | · | F | Per-type toggles (steps, distance, exercise sessions, active calories, heart rate optional); then system permission sheet | Partial grant |
| G4 | Connection & sync | · | F | Status, last successful sync, granted types, manage permissions, disconnect, delete synced data | Sync error |
| G5 | Activity detail | · | F | Session type, duration, distance, source app | Metric missing → "not provided by your device" |
| G6 | Weekly summary | · | Plus | Steps/distance/active time per day, trend | Sparse data |
| G7 | Health Connect unavailable | · | F | Explains requirement, link to install/update where applicable | |
| G8 | Permission denied | · | F | What still works, how to grant later | |

## H. Co-travellers / co-trekkers

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| H1 | Discover | · | F (basic) / Plus (more filters) | Cards: display name, photo, destination/route, dates, activity, experience; **region-level only**, never exact location | No matches |
| H2 | Filters | · | F/Plus | Destination, route, dates, activity, difficulty, experience, group size, languages (if supplied), interests; sort | |
| H3 | Public profile | · | F | Intro, interests, experience, upcoming public journeys, verification status (only if real), Connect, Block/Report | Blocked/hidden |
| H4 | My public profile | · | F | Edit fields, choose visibility (hidden / connections / public), preview as others see it | Hidden by default |
| H5 | Send connection request | · | F | Short note, daily limit shown, safety reminder | Limit reached |
| H6 | Requests | · | F | Incoming / outgoing, accept / decline / withdraw | Empty |
| H7 | Connections | · | F | Accepted connections, message, invite to journey, remove | Empty |
| H8 | Conversation | · | F | Only after acceptance; report/block in header; safety tips banner on first message | Blocked |
| H9 | Before you meet | · | F | Safety guidance: meet in public, tell a trusted contact, share journey (D6) | |
| H10 | Block / report | · | F | Reason, details, confirmation; block is immediate | |
| H11 | Verification | · | F/Plus | Available verification options and status; never shows "verified" without a completed check | Provider not configured |

## I. Group journeys

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| I1 | Groups | · | F | My groups, invites, public groups to join | Empty |
| I2 | Create group journey | · | Plus (lead) | Journey details, size, visibility, join approval, leader | |
| I3 | Invite members | · | Plus | From connections or link; pending invites | |
| I4 | Join requests | · | Plus | Approve / decline | Empty |
| I5 | Group detail | · | F | Members, roles, journey, group check-in status, leave | |
| I6 | Group map | · | F | Only members currently sharing (consented); everyone sees who is sharing | No one sharing |
| I7 | Share my location with group | · | F | Explicit consent sheet: who, how precise, how long; always-visible "Sharing now" indicator; stop anytime | |
| I8 | Group check-in | · | F | Leader asks, members respond; non-responders listed by name only | |
| I9 | Group emergency | · | F | A member's SOS shown to the group (their choice in settings) with status | |
| I10 | Leave group / remove member | · | F | Confirmation; leader cannot see a removed member's data afterwards | |

## J. Plans & pricing

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| J1 | Plans & pricing | · | — | Plan cards from server config, monthly/annual toggle, current plan badge, "SOS is free on every plan" note | Prices not configured → "Coming soon" |
| J2 | Compare plans | · | — | Feature comparison table (from PlanFeature) | |
| J3 | My subscription | · | — | Status, renewal date, entitlement list, manage | Expired / grace period |
| J4 | Change plan | · | — | Upgrade/downgrade confirmation with what changes and when | Payment pending/failed (never assumed successful) |
| J5 | Billing history | · | — | Transactions from the provider | Empty |
| J6 | Cancel & renewal | · | — | What happens on cancel, refund rules link | |
| J7 | Pricing FAQ & terms | · | — | FAQ, terms, satellite clearly separate ("not available" until real) | |

## K. Profile & settings

| ID | Screen | Mode | Plan | Purpose and key elements | Special states |
|---|---|---|---|---|---|
| K1 | Profile | · | F | Account, mode, plan, fitness connection, co-traveller profile, settings | |
| K2 | Edit account | · | F | Name, photo, phone/email | |
| K3 | Privacy | · | F | Profile visibility, discovery on/off, who can send requests, blocked users | |
| K4 | Location sharing | · | F | All active shares (contacts, groups, journeys) with stop buttons; history of shares | None active |
| K5 | Notifications | · | F | Per-type toggles; safety alerts cannot be fully disabled while a check-in is active (explained) | |
| K6 | Advanced connectivity | · | F | For organizers/technical users: site station address, device ID, relay port. Hidden under "Advanced" | |
| K7 | Your data | · | F | Export, delete fitness data, delete account | |
| K8 | About & legal | · | F | Terms, privacy policy, safety disclaimer ("TrackMate is not an emergency service"), licences | |
| K9 | Switch mode | · | F | Tourist ↔ Trekker | |

## Screen count

A 9 · B 3 · C 5 · D 7 · E 8 · F 14 · G 8 · H 11 · I 10 · J 7 · K 9 = **91 screens**.

**Suggested MVP for Phase 2** (TrackMate core): A1–A8, B1–B2, D1–D3, D6, E1–E6,
F1–F12, F14, K1–K5, K8–K9. Fitness (G), co-travellers (H), groups (I) and plans
(J) follow in their own phases.
