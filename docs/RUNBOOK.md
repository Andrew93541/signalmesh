# Runbook: gateway, backend, dashboard, relay phones

Everything runs on the Mac except the phones. All services bind `0.0.0.0` so
devices on the same network can reach them.

## 1. Backend (accounts, incidents, responder API) — port 8100

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once
.venv/bin/uvicorn trackmate_backend.app:app --host 0.0.0.0 --port 8100
```
One-time setup (database migrates automatically on start):
```bash
.venv/bin/python -m trackmate_backend.manage create-responder --name "Your Name" --email you@example.org --phone +91XXXXXXXXXX
.venv/bin/python -m trackmate_backend.manage create-gateway GATEWAY_01    # prints the gateway token once
```
`TRACKMATE_DEV_MODE=1` writes password-reset codes to the log (no email/SMS provider yet). Never in production.

## 2. Gateway — port 8000

Create `gateway/.env` (git-ignored):
```
SIGNALMESH_NODE_ID=GATEWAY_01
SIGNALMESH_UPSTREAM_URL=http://127.0.0.1:8100
SIGNALMESH_UPSTREAM_TOKEN=<token from create-gateway>
SIGNALMESH_UPSTREAM_RETRY_SECONDS=3
SIGNALMESH_SYNC_SECONDS=3
```
```bash
cd gateway
.venv/bin/uvicorn signalmesh_gateway.app:app --host 0.0.0.0 --port 8000 --env-file .env
```
Check: `curl localhost:8000/gateway/status` → `upstream.sync_ok: true`.

## 3. Dashboard — port 3100

```bash
cp apps/dashboard/.env.example apps/dashboard/.env.local      # once
npm run dev -w dashboard                                     # development
npm run build -w dashboard && npm run start -w dashboard     # demo / second laptop
```
Open `http://<mac-ip>:3100` and sign in with a responder account.
From another laptop in **dev** mode add its origin: `DASHBOARD_DEV_ORIGINS=<mac-ip>`; the production build has no such restriction.
Set `NEXT_PUBLIC_BACKEND_WS_URL=ws://<mac-ip>:8100` in `.env.local` so live updates work from other machines.

## 4. Install the app on a phone (relay build)

USB debugging on, phone plugged in:
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
cd apps/mobile && npx expo run:android --device <model>      # or: adb -s <serial> install -r android/app/build/outputs/apk/debug/app-debug.apk
npm run dev:mobile                                           # Metro, from repo root
```
Over USB, forward Metro: `adb -s <serial> reverse tcp:8081 tcp:8081`.

## 4b. Standalone release APK (no Metro, no USB, no Mac localhost)

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
cd apps/mobile && npx expo prebuild --platform android --no-install
cd android && NODE_ENV=production ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb -s <serial> install -r app/build/outputs/apk/release/app-release.apk
```
Cloud alternative (needs `npx eas-cli login` first): `npx eas-cli build --platform android --profile preview` (APK; profile in `apps/mobile/eas.json`).

Addresses are **not** built in. Optional build-time values: `EXPO_PUBLIC_ONLINE_GATEWAY_URL` (https only), `EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_LOCAL_GATEWAY_URL`. Otherwise set them on the phone:
- Sign-in screen → **Account server settings** → account server address.
- Profile → Connection settings → **Online gateway (internet)** (https) and **Local network address (offline mode)**.

Signing: the local release build uses the Expo template's debug keystore (`android/app/debug.keystore`). Fine for testing; a store release needs a real upload key (not set up; ask before changing).

### Connection modes on the phone
The app tries the **online gateway** first when the phone has internet, then the **local network address** (a relay phone or the station). The Safety tab shows "Sending via Internet (online gateway)" or "Sending via Local network (offline mode)". Failures back off 3 s → 6 s → … → 60 s; a Wi-Fi/data/hotspot change, opening the app, or a new SOS retries at once. The same `message_id` is used on every route and retry, so the backend stores each SOS once.

## 5. Physical two-phone test

Network: **one Wi-Fi network or a hotspot** that lets clients reach each other.
Recommended: Phone 2 runs the hotspot; Phone 1 and the Mac join it.

1. Start backend, gateway, dashboard (above). Note the Mac's IP on that network: `ipconfig getifaddr en0`.
2. Phone 2 → Profile → Connection settings → Safety station address = `http://<mac-ip>:8000` → Test connection.
3. Phone 2 → Profile → Help others → On. Note the address shown; it must say **"Address confirmed"** (it is read from the connection to the gateway).
4. Phone 1 → Connection settings → Safety station address = `http://<phone-2-address>:8080` → Test connection.
5. Phone 1 → Safety → hold SOS.
6. Evidence: Phone 2 Help others list shows it received + passed on; `curl <mac>:8000/gateway/messages` shows hops `MOBILE_01 → RELAY_02 → GATEWAY_01`; dashboard shows the incident with path ending `BACKEND_01`.
7. Acknowledge in the dashboard → Phone 1's SOS page shows "A responder has acknowledged your request" (via Phone 2's ack-status proxy).
8. Give the phones different Device IDs (Connection settings → Advanced), e.g. `MOBILE_01` and `RELAY_02`.

If Phone 1 cannot reach Phone 2: the hotspot may isolate clients; use Phone 2 as the hotspot itself, or a router without client isolation.
