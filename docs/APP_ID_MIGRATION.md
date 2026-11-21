# Android application ID migration: `com.signalmesh.app` → `com.trackmate.app`

Status: **plan only** (DECISIONS.md D4). Execute at the start of Phase 2.

## 1. Why now

The Android application ID is the app's permanent identity on Google Play and on
the device. It **cannot be changed after the app is published**; a different ID
is a different app. Today the app has never been published and is installed only
on two test phones, so changing it now costs one reinstall.

## 2. Checks before changing ⚖️

| Check | How | Status |
|---|---|---|
| ID not already used on Google Play | Open `https://play.google.com/store/apps/details?id=com.trackmate.app` and confirm it does not exist; Play Console also rejects taken IDs at first upload | To verify |
| You can stand behind the reverse-domain | Convention: own or control `trackmate.com` (or choose an ID under a domain you own, e.g. `in.<yourdomain>.trackmate`) | To decide |
| "TrackMate" name is usable | Trademark search in India (and launch markets) and Play Store search for apps with the same/similar name | To verify, legal review |
| iOS bundle ID (future) | Use the same string, `com.trackmate.app`, for consistency | Planned |

If any check fails, choose the final ID first; everything below uses a
placeholder `<APP_ID>`.

## 3. What changes

| File / place | Today | After |
|---|---|---|
| `apps/mobile/app.json` → `expo.name` | `SignalMesh` | `TrackMate` |
| `expo.slug` | `signalmesh` | `trackmate` (no EAS project linked yet, so no remote impact) |
| `expo.scheme` | `signalmesh` | `trackmate` (dev-client deep link becomes `exp+trackmate://`) |
| `expo.android.package` | `com.signalmesh.app` | `<APP_ID>` |
| `expo.ios.bundleIdentifier` | `com.signalmesh.app` | `<APP_ID>` |
| `apps/mobile/package.json` → `name` | `mobile` | `trackmate-mobile` |
| Root `package.json` scripts | `--filter=mobile` | `--filter=trackmate-mobile` |
| Location permission text | "SignalMesh attaches…" | "TrackMate attaches…" |
| Docs referencing `com.signalmesh.app` / "SignalMesh app" | — | Updated |
| `apps/mobile/android/` | generated | Regenerated with `npx expo prebuild --clean` (git-ignored, safe) |

**Unchanged on purpose:** SignalMesh code (`src/lib/*`), the gateway, the API
contract, SQLite file name `signalmesh.db`, device IDs (`MOBILE_01`, `RELAY_02`),
the repo name.

## 4. Steps

1. **Drain test phones.** On each phone check Status and Relay tabs: no message
   in "Saved on phone" / "Waiting for gateway". (A new app ID means new app
   storage; anything queued in the old app stays in the old app.)
2. Make the file changes in §3 on a branch. No logic changes in the same commit.
3. `npx expo prebuild --platform android --clean`, then `npx expo run:android`
   for each phone (USB).
4. On each phone: new "TrackMate" app installs **alongside** the old SignalMesh
   app. Re-enter settings (next hop URL, device ID, relay mode).
5. Verify on both phones: app launches, location permission prompt shows
   TrackMate text, check-in reaches the gateway, relay mode starts on Phone 2.
6. Uninstall the old app: `adb -s <device> uninstall com.signalmesh.app`.
7. Update IMPLEMENTATION_STATUS.md; commit.

## 5. Release signing (later, before Play)

- Use **Play App Signing**; generate a new upload key for `<APP_ID>`, stored
  outside the repo (password manager / secrets store), never committed.
- Debug builds keep the default debug keystore.

## 6. Rollback

Before step 6 the old app is still installed and working; rollback = revert the
branch and keep using `com.signalmesh.app`. After publishing to Play there is no
rollback — that is why the checks in §2 come first.
