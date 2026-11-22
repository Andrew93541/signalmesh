# Satellite communication research (framework)

Status: **research not done.** No device has been chosen, bought or integrated,
and TrackMate must not show any satellite feature until one is. This file sets
out what to compare and what is already known to be risky. Every "To verify"
cell must be filled from a primary source (provider docs, DoT/TRAI notices,
signed quotes) with a link and date before any decision.

## 1. Why this needs care in India ⚖️

- Use of satellite communication devices in India is regulated (Indian Telegraph
  Act / Wireless Telegraphy Act framework, Department of Telecommunications).
  Some consumer satellite phones and satellite messengers are **not authorised**
  for use in India, and there have been reported cases of travellers being
  detained for carrying them. **Confirm the current legal position for each
  device and for both residents and foreign tourists before shortlisting.**
- Any service we offer must be legal for the user's location, not only where
  TrackMate is incorporated.
- Native smartphone satellite messaging/SOS features from phone makers and
  carriers are rolling out market by market. **Check whether any is available in
  India** and whether third-party apps can use it at all (most cannot today).

## 2. Comparison criteria

| Criterion | Why it matters |
|---|---|
| Legal to use in India (residents / foreigners) | Hard blocker |
| Network (e.g. Iridium, Inmarsat, Globalstar, NTN providers) | Coverage, latency |
| Third-party Android SDK or documented Bluetooth protocol | Without this we cannot integrate |
| Custom message payloads (our SOS JSON or a compact form) | Needed for SignalMesh |
| Location included / supported | SOS usefulness |
| Delivery receipts | Needed to report `TRANSMITTED` vs `DELIVERED` honestly |
| Built-in SOS / rescue coordination service | Overlap or conflict with our SOS |
| Provider API for receiving messages server-side | Needed to reach our backend |
| Commercial integration terms | Can we resell / bundle? |
| Device price, service subscription, per-message cost | Pricing page must separate these |
| Battery life, size, ruggedness | Trekker use |
| Coverage limits (sky view, latitude, terrain) | Honest user guidance |

## 3. Candidate categories (all details to verify)

| Category | Examples to research | Known concerns |
|---|---|---|
| Two-way satellite messengers (Bluetooth to phone) | Garmin inReach series, ZOLEO, SPOT X, Bivy Stick | Legality in India — reported restrictions on some devices; SDK access often limited to enterprise programs |
| Satellite phones | Inmarsat-based service offered in India by BSNL; Iridium/Thuraya handsets | Some handset/network combinations are restricted in India; voice-centric, limited data APIs |
| Satellite IoT modems | Iridium Short Burst Data modules, other NTN/IoT modems | Hardware development needed; certification; good for a custom TrackMate beacon |
| Native phone satellite (NTN) | Phone-maker or carrier satellite SOS/messaging | Market availability in India unknown; third-party app access usually not provided |

| Device / service | Legal in India | Android SDK / BT protocol | Custom payload | Delivery receipt | Server API | Device cost | Service cost | Per-message | Source + date |
|---|---|---|---|---|---|---|---|---|---|
| *(fill in during Phase 8)* | To verify | To verify | To verify | To verify | To verify | To verify | To verify | To verify | |

## 4. Integration shape (provider-independent)

Satellite plugs into SignalMesh as one more `TransportAdapter`
(`satellite-external` for a Bluetooth device, `satellite-native` for phone
features). The communication manager treats it as a high-cost, low-bandwidth
route: used for SOS and check-ins only when cheaper routes are unavailable, with
compact payloads and explicit cost rules. Provider-specific code stays inside the
adapter and a matching server-side receiver.

## 5. Satellite simulator vs real satellite connectivity

**Today: no satellite simulator exists in the code** (checked 2026-11-21: the
only simulation is the "Simulate no signal" demo switch, which pauses sending).

A simulator may be built later to test the satellite adapter's queueing, compact
payloads, cost rules and delayed receipts without hardware. If it is, it must be
impossible to confuse with a real satellite link:

| Rule | Requirement |
|---|---|
| Separate identity | Transport id `satellite-simulated`, never `satellite-external` / `satellite-native`. A message's `TransportAttempt` records `simulated: true`. |
| Never a real state | A simulated send never sets `delivery_state` to `TRANSMITTED` or `DELIVERED`; it records the attempt only as `SIMULATED` on the attempt, and the message stays `QUEUED` unless a real route carries it. |
| Off in release builds | Compiled out of / disabled in release and Play builds; available only in debug/dev builds behind a developer setting. |
| Labelled everywhere | Any screen, log line, dashboard row or report touching it says **"Simulated satellite (not real)"**. Consumer screens never show it. |
| Not in evidence | Test reports list simulator results under **Simulated**, never under **Physically tested** (IMPLEMENTATION_STATUS.md levels). |
| Not in marketing or pricing | Plans & pricing show satellite as "not available" until §6 is met, regardless of simulator status. |
| Gateway side | If the gateway ever accepts simulated traffic, it is tagged and excluded from incident counts and responder views by default. |

## 6. Decision gate

A device is chosen only with: written confirmation of legality for the target
users, a usable SDK/API, delivery receipts, commercial terms, and a physical test
plan. Until then the pricing page lists satellite as "not available".
