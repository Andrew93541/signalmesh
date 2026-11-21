# TrackMate design system (light theme, v1 draft)

Calm, clear and trustworthy. White and light-grey surfaces, deep navy text, one
blue for actions, red **only** for SOS and critical alerts. Designed for people
who may be scared, injured, cold or in bright sunlight.

Applies to the mobile app first; the responder dashboard uses the same tokens.

## 1. Colour tokens

Contrast ratios below were **computed** (WCAG 2.x formula) for the pairs listed.
Use tokens, never raw hex in components.

| Token | Hex | Use | Measured contrast |
|---|---|---|---|
| `bg` | `#FFFFFF` | App background | — |
| `surface` | `#F6F7F9` | Grouped backgrounds, cards on white | — |
| `surface-2` | `#EEF1F5` | Pressed rows, skeletons | — |
| `border` | `#E2E6EC` | Dividers, card outlines (decorative only) | — |
| `border-strong` | `#7D8799` | Input and control borders | 3.62:1 on bg, 3.38:1 on surface (≥ 3:1 for UI) |
| `text` | `#0F1B2D` | Primary text (deep navy) | 17.28:1 on bg, 16.12:1 on surface |
| `text-2` | `#475467` | Secondary text | 7.69:1 on bg, 7.17:1 on surface |
| `text-3` | `#667085` | Captions, hints | 4.97:1 on bg, 4.64:1 on surface |
| `primary` | `#1D5FD1` | Buttons, links, focus ring, selected tab | 5.82:1 vs white (both directions) |
| `primary-pressed` | `#174EAD` | Pressed state | 7.69:1 with white text |
| `primary-soft` | `#EAF1FD` | Selected chips, info banners | `primary` text on it 5.12:1 |
| `sos` | `#C8261B` | SOS button, critical alert fill | white text 5.60:1 |
| `sos-text` / `sos-soft` | `#B42318` / `#FDECEA` | Critical banner text / background | 5.75:1 |
| `success` / `success-soft` | `#1A7346` / `#E7F5EE` | Acknowledged, saved, connected | 5.86:1 on bg, 5.21:1 on soft |
| `warning-text` / `warning-soft` | `#8A4B00` / `#FFF3DC` | Waiting, queued, low battery | 6.19:1 on soft, 6.80:1 on bg |

Rules:
- **Red means emergency.** Never use `sos` for errors in forms, delete buttons or decoration; use `sos-text` on `sos-soft` for genuine critical alerts only. Form errors use `sos-text` text with an icon, not red fills.
- **Never colour alone.** Every status pairs colour with an icon and words.
- Amber fills are never used behind body text (only `warning-soft` with `warning-text`).
- Dark mode: not in v1. The app follows the light theme even if the system is dark, until a dark palette is designed and measured.

## 2. Typography

Font: **Inter** (bundled), fallback system sans. Numbers in stats use tabular figures.

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 32 / 40 | 700 | Rare: SOS status headline |
| `title-1` | 24 / 32 | 700 | Screen titles |
| `title-2` | 20 / 28 | 600 | Section titles, card titles |
| `headline` | 17 / 24 | 600 | List row titles, button text |
| `body` | 16 / 24 | 400 | Default text |
| `callout` | 15 / 22 | 400 | Secondary paragraphs |
| `footnote` | 13 / 18 | 400 | Metadata |
| `caption` | 12 / 16 | 500 | Labels on charts, badges (minimum size) |
| `stat` | 28 / 34 | 600 tabular | Distance, duration, steps |

- Nothing below 12 sp. Body text never below 16 sp.
- Support Android font scale up to **200%**: layouts wrap, never truncate safety text; stat tiles stack.
- Sentence case everywhere. No all-caps body text.

## 3. Spacing, radius, elevation

- **Spacing scale (4-pt):** 4, 8, 12, 16, 20, 24, 32, 40, 48. Screen padding 16; between sections 24; within cards 16.
- **Radius:** 8 inputs/chips · 12 cards/buttons · 16 sheets and dialogs · full for pills, avatars and the SOS button.
- **Elevation:** level 0 (flat, border) for most cards; level 1 (`0 1 2 rgba(15,27,45,.06)`, `0 1 3 rgba(15,27,45,.10)`) for floating cards; level 2 for sheets. No heavy shadows, no gradients.
- **Layout:** one primary action per screen, placed in the thumb zone (bottom). Max 1 column on phones; content width capped at 560 dp on tablets.

## 4. Touch and motion

- Minimum touch target **48 × 48 dp**, 8 dp apart.
- **SOS button:** at least 160 dp diameter on Safety hub, 64 dp floating/compact version; press-and-hold 1.5 s with a filling ring and haptic tick at start and on send; release early cancels with no side effects.
- Motion is functional only (progress, state change) and ≤ 200 ms. Respect "Remove animations"; the SOS ring then shows a countdown number instead.
- Haptics for: SOS sent, check-in done, request accepted. Never continuous except the local alarm.

## 5. Components

| Component | Variants | Notes |
|---|---|---|
| Button | primary · secondary (outline `border-strong`) · tertiary (text) · destructive (outline `sos-text`) | Height 52 dp; full width at screen bottom; loading spinner keeps width |
| SOS button | large · compact | Only element using `sos` fill; accessible label "Send SOS. Press and hold." |
| Icon button | standard · tonal | Always has an accessibility label |
| Card | flat · elevated · tappable | Max one level of nesting; no card-in-card grids |
| List row | default · with switch · with chevron · destructive | 56–72 dp tall |
| Status pill | queued · passed on · sent · reached · acknowledged · team assigned · resolved · failed | Icon + text + colour (see §7) |
| Banner | info · warning · critical · offline | Dismissable except offline/critical |
| Text field / text area / select | default · focused · error · disabled | Label above, helper below, error with icon |
| Chip / segmented control | filter · choice | Category and mode pickers |
| Switch | — | With visible label; state announced |
| Bottom sheet | standard · consent | Consent sheet (location sharing) states who, how precise, how long, and has an explicit "Share" and "Not now" |
| Dialog | confirm · destructive | Used sparingly; never for SOS confirmation |
| Stepper | — | Journey and trek creation |
| Stat tile | — | `stat` number + `footnote` label + optional delta; shows "Not available" instead of 0 when data missing |
| Chart | bar (weekly) · line (elevation) | Data labels, not colour, carry meaning; no 3D |
| Map container | — | Attribution visible; "last updated" time; offline fallback to list |
| Avatar | photo · initials | Initials on `primary-soft` with `primary` text |
| Plan card · comparison table | — | Prices from server; "Current plan" badge; SOS row always "Included" |
| Empty state | — | Short sentence + one action; no large illustrations |
| Skeleton | — | `surface-2` blocks; no shimmer when reduce-motion is on |
| Toast | success · info | Never for errors that need action |
| Tab bar | 5 items | Labels always visible; active = `primary` + filled icon |

Icons: one outline icon set (e.g. Material Symbols Outlined or Lucide), 24 dp,
1.75–2 px stroke. Pick one in Phase 2 and do not mix sets.

## 6. Accessibility requirements

Target: **WCAG 2.2 AA** plus Android accessibility guidelines.

- Contrast: text ≥ 4.5:1 (≥ 3:1 for ≥ 24 sp or 19 sp bold); controls and focus indicators ≥ 3:1.
- TalkBack: every control has a label, role and state; logical focus order; status changes on F4 announced with a polite live region, SOS sent announced assertively.
- No information by colour alone; no meaning only in icons.
- Font scale to 200% without loss of content or function.
- Touch targets ≥ 48 dp; SOS usable one-handed and with gloves (large target, hold instead of precise tap).
- Errors explain what happened and what to do, in plain words.
- Copy readable at roughly a 6th–8th grade level; avoid idioms (translation-ready).
- Localization-ready: no text in images, room for 30–40% longer strings, Indian languages planned.
- Respect reduce-motion and battery saver.
- Physical test checklist per release: TalkBack pass on Safety flows, 200% font pass, outdoor sunlight readability check.

## 7. Status language (consumer copy)

Maps the contract states (CONTRACT.md § v2) to what users see. Never shows
technical names.

| State | Pill | Message on F4 | Colour |
|---|---|---|---|
| `QUEUED` | Saved on phone | "We're saving your message and will keep trying." | warning |
| `RELAYED` | Passed on | "Your message was passed to a nearby device." | warning |
| `TRANSMITTED` | Sent | "Your message was sent. Waiting for confirmation." | warning |
| `DELIVERED` / `OPEN` | Reached | "Your message reached the safety network. Waiting for a responder." | primary |
| `ACKNOWLEDGED` | Acknowledged | "A responder has acknowledged your request." | success |
| `DISPATCHED` | Team assigned | "A response team has been assigned." | success |
| `RESOLVED` | Closed | "This request was marked resolved." | neutral (`text-2`) |
| failed / rejected | Not sent | "We couldn't send this message. [What to do]" | critical |

Forbidden copy: "Help is on the way" (unless dispatched with evidence), "You
are safe", "Guaranteed", "Verified" (unless a verification completed),
"Satellite" (unless a real satellite route delivered it — see SATELLITE.md).
