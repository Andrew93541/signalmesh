# Roadmap

Each phase ends with: tests run, PASS / FAIL / NOT TESTED report, changed files
listed, IMPLEMENTATION_STATUS.md updated, and **approval before the next major phase**.

| Phase | Goal | Exit criteria |
|---|---|---|
| **0 Audit** | Protect work, document reality | Docs written, backup taken, approval to proceed (this phase) |
| **0.5 Finish SignalMesh validation** *(carried over)* | Physical Phone 1 → Phone 2 → gateway test | Scenarios 1–6 physically PASS or documented FAIL |
| **1 Spec & architecture** | Approve PRODUCT.md, ARCHITECTURE.md, contract v2, backend split | Signed-off specs; screen list and design system tokens |
| **2 TrackMate core app** | Accounts, Tourist/Trekker modes, journeys, GPS tracking sessions, trusted contacts, check-ins, SOS, offline queue, new navigation and light design | Core flows physically tested on Android, battery-aware tracking verified |
| **3 SignalMesh reliability** | Transport abstraction around existing code; internet + relay adapters; persistent queue, dedupe, delivery vs incident state | All SignalMesh scenarios pass physically; no regression in relay |
| **4 Fitness** | Health Connect research, permission flow, connect/disconnect, steps/distance/sessions, dashboard | Works on a Health Connect device; denied/unavailable paths tested |
| **5 Co-trackers** | Profiles, search, requests, groups, consented group tracking, block/report, privacy, moderation | Abuse paths tested; no exact location visible to strangers |
| **6 Responder dashboard** | Web dashboard on real backend data | Incidents, map, ack/dispatch/resolve, relay/gateway status working |
| **7 Plans & pricing** | Plan config, entitlements, pricing page; payment research then integration | Server-side entitlement tests; SOS unaffected by plan state |
| **8 Satellite** | Provider research → decision → adapter | Only with a chosen, legal, available device and documented evidence |
| **9 Security & pilot** | Threat review, pen-test checklist, privacy docs, pilot with a trekking organizer | Pilot sign-off; legal review items closed |

## Immediate next steps (proposed)

1. Commit current work to a branch (approval needed).
2. Run the physical relay test (Phase 0.5).
3. Phase 1 decisions: backend split, contract v2, app rename, dashboard location.
