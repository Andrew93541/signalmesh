# TrackMate product specification (draft)

Status: Phase 0 draft for review. Nothing here is built unless IMPLEMENTATION_STATUS.md says so.

## 1. What TrackMate is

An Android-first app for tourists, travellers and trekkers that combines
journey planning, live tracking, fitness, finding travel companions, and
personal safety. **SignalMesh** is the communication engine underneath: it gets
check-ins and SOS messages out over whatever path is available.

TrackMate is **not** an emergency service. It helps people ask for help and
share where they are; it never promises rescue.

## 2. Users

| Persona | Needs |
|---|---|
| Tourist / traveller | Plan a trip, share location with trusted people, check in, SOS, meet co-travellers |
| Solo traveller | Find a group, safety check-ins, trusted contacts |
| Trekker / hiker | Trek planning, GPS track, distance/elevation, offline info, check-in timer, SOS |
| Trek leader / organizer | Group roster, member status (with consent), group check-ins, incident handling |
| Responder / organizer staff | See incidents, acknowledge, dispatch, resolve (web dashboard) |

## 3. Product principles

1. **SOS is never paywalled** and never hidden behind a mode, login wall or plan.
2. **Consent before location.** Live location is shared only after an explicit, visible, revocable action. Group leaders do not get automatic access.
3. **Honest status.** The app says exactly how far a message got ("saved on your phone", "passed to a nearby device", "reached the gateway", "a responder acknowledged"). Never "help is on the way" unless a responder dispatched.
4. **One app, two modes.** Tourist and Trekker modes share account, journeys, contacts and safety; they change defaults and emphasis, not the product.
5. **Plain language.** No networking jargon in the consumer UI.
6. **Sensitive data minimised.** Location, health, identity and payment data are collected only for a feature the user turned on.

## 4. Modules

| # | Module | MVP scope | Later |
|---|---|---|---|
| 1 | Home | Mode switch, current journey, safety status, quick SOS | Personalised feed |
| 2 | Tourist mode | Destinations, itinerary, saved places | Recommendations |
| 3 | Trekker mode | Trek creation, route, start/pause/resume/stop tracking | Elevation profiles, leader tools |
| 4 | Journey planning | Create journey, dates, stops, members | Route optimisation |
| 5 | Live tracking | Battery-aware tracking session, last-known location | Breadcrumb sharing over SignalMesh |
| 6 | Co-trackers | Public profile, search/filters, connection requests, block/report | Verification, communities |
| 7 | Group journeys | Create/invite/join, members, consented group tracking, group check-in | Organizer dashboard |
| 8 | Fitness | Health Connect connect/disconnect, steps, distance, sessions, weekly summary | More providers |
| 9 | Safety & SOS | SOS, trusted contacts, check-in timer, missed check-in alerts, local alarm | Escalation chains |
| 10 | SignalMesh | Internet + nearby relay transports, offline queue, delivery status | SMS, satellite adapters |
| 11 | Offline navigation | Offline journey info, last-known location | Offline maps (licensing TBD) |
| 12 | Plans & pricing | Pricing page from config, entitlements | Payments (after research) |
| 13 | Profile & settings | Account, privacy, location sharing controls, data export/delete | |
| 14 | Responder dashboard | Incidents, map, ack/dispatch/resolve, relay/gateway status | Organizer analytics |

## 5. Navigation (proposed)

Bottom tabs: **Home · Explore · Journeys · Safety · Profile**.

- **Home:** current journey, safety status, quick SOS, shortcuts to Fitness and Co-trackers.
- **Explore:** destinations, treks, co-trackers, public group journeys.
- **Journeys:** my journeys, tracking sessions, history, groups.
- **Safety:** SOS, trusted contacts, check-in timer, message status, connectivity.
- **Profile:** account, fitness connection, plans, privacy, settings.
- SOS is reachable from every screen (persistent button or gesture — decide in design).

## 6. Plans (structure only — no prices decided)

| | Free | Plus | Adventure / Pro | Group / Organizer |
|---|---|---|---|---|
| SOS, trusted contacts, check-ins | ✓ | ✓ | ✓ | ✓ |
| Journeys | Basic | More saved | Advanced | Org-wide |
| History | Basic | Extended | Extended + analytics | Reports |
| Fitness | Basic | Enhanced | Enhanced | — |
| Co-tracker discovery | Basic | ✓ | ✓ | ✓ |
| Offline | Basic info | More | Offline maps (licensing TBD) | ✓ |
| Group tools | Join | Expanded | Extended | Admin + responder workflows |

Prices, markets and currencies come from server configuration. Satellite is a
**separate** hardware + service offering and is not part of any plan until a
real device, provider and agreement exist.

## 7. Out of scope until decided

- Final prices and payment provider.
- In-app chat implementation choice.
- Offline map provider and licensing.
- Identity verification provider.
- Any satellite device or provider.
