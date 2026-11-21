# Security and privacy plan

Status: plan. **Nothing below is implemented yet** except where noted. Items
marked ⚖️ need qualified legal review before launch.

## 1. Current state (honest)

- No authentication or authorization anywhere. Gateway ack/resolve are open to anyone on the LAN.
- All traffic is plain HTTP on the local network (cleartext allowed in the Android build for the prototype).
- Data on phones (SQLite) and gateway (SQLite) is not encrypted at rest.
- No rate limiting, audit log, retention or deletion policy.

Acceptable only for a closed demo. Must change before any real user data.

## 2. Data classes

| Class | Examples | Handling |
|---|---|---|
| Safety | SOS, check-ins, incident actions | Retain for incident review period; access: the user, their trusted contacts (if chosen), authorized responders |
| Location | Tracking points, last-known location | Consent per session; coarse for discovery; precise only to consented viewers; short default retention |
| Health | Steps, sessions, heart rate | Read only permitted types; on-device by default; never to responders by default |
| Identity | Name, phone, email, photo, verification | Minimise; verification results only (not documents) unless required |
| Social | Profiles, requests, blocks, reports | Visibility settings; reports kept for moderation |
| Payment | Subscription state, transactions | Card data never stored; provider tokens only |

## 3. Controls to build

- **Auth:** short-lived access tokens + refresh tokens; tokens in Android Keystore-backed secure storage; device binding for relay/gateway nodes.
- **Authorization:** roles (user, group leader, organizer admin, responder, platform admin); per-resource checks on every private route; leaders get member location only via each member's consent.
- **Transport:** TLS for all internet traffic. LAN relay/gateway: signed messages (per-device key) so relays cannot alter content; consider payload encryption to the gateway.
- **At rest:** encrypted backups; database encryption where supported; field-level encryption for the most sensitive fields.
- **Abuse:** rate limits on auth, discovery and connection requests; block and report; moderation queue; request limits per day.
- **Audit log:** location shares, consent changes, incident actions, admin actions, billing changes.
- **Secrets:** environment / secrets manager, never in the repo.
- **Retention & deletion:** user data export and account deletion; scheduled purge of old location points.

## 4. Compliance to research ⚖️

- India: Digital Personal Data Protection Act 2023 and its Rules — consent, notice, children's data, breach reporting, data principal rights.
- Google Play: Health Connect / health-data policy and declaration; location (background) permission policy; payments policy for digital subscriptions in India.
- RBI rules for recurring payments / e-mandates if a non-Play payment path is ever used.
- Satellite communication rules in India (see SATELLITE.md).
- Other launch countries: GDPR (EU/UK) if applicable.
- Safety disclaimers, terms of service, privacy policy.

## 5. Safety-specific rules

- SOS works without login if the device has never signed in (store and forward with device identity).
- SOS never depends on subscription state.
- Never display exact live location to strangers.
- Never claim "verified" without a completed verification.
- Never claim rescue or dispatch without responder evidence.
