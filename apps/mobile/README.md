# SignalMesh worker app (Expo)

The worker's phone: send an SOS, store it offline until a relay or the gateway accepts it, track the acknowledgement, and check in on a dead-man timer.

## Run it on your phone

Relay mode uses a native module (`react-native-tcp-socket`), so the app runs as its
own **SignalMesh development build**, not in Expo Go. (Expo Go still works for
sender-only testing; the Relay tab then says it can't start.)

One-time setup on the Mac: Java 17 and the Android SDK.
```bash
brew install openjdk@17
brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
```

Build and install on a USB-connected Android phone (USB debugging on):
```bash
cd apps/mobile
npx expo run:android            # first build ~10–15 min, later ones ~1–2 min
```
After that, day to day: `npm run dev:mobile` from the repo root and open the
SignalMesh app. Rebuild only when native dependencies or `app.json` change.

Over USB instead of Wi-Fi: `adb reverse tcp:8081 tcp:8081` (and `tcp:8000` for the
gateway), then use `http://127.0.0.1:8000` as the next hop.

## Relay mode (Phone 2)

1. Install the same app on the relay phone. In **Settings** give it its own
   Device ID (e.g. `RELAY_02`) and set **Next hop URL** to the gateway
   (`http://<gateway-laptop-IP>:8000`).
2. Open the **Relay** tab and switch on **Relay mode**. It shows the address to
   use, e.g. `http://192.168.0.12:8080`. Keep the phone plugged in, app open.
3. On the sender phone set **Next hop URL** to that relay address.

The relay stores every SOS in SQLite before answering, appends its ID to `hops`,
forwards to its next hop every 3 s (HIGH first), ignores duplicate retries,
answers ack-status questions from the gateway (or from its own copy when the
gateway is unreachable), passes check-ins on, and sends a heartbeat so the
dashboard can show it.

This is an application-level relay over one Wi-Fi network, not Bluetooth /
Wi-Fi Direct mesh: the router is still required.

## Test without the real gateway

```bash
npm run mock-gateway -w mobile                      # prints the URL to use
AUTO_ACK_SECONDS=10 npm run mock-gateway -w mobile  # auto-acknowledges every SOS
```

In the app: **Settings → Next hop URL** = the printed `http://<laptop-ip>:8000`, then **Test connection**.

Acknowledge an SOS by hand:
```bash
curl -X POST http://localhost:8000/gateway/ack/<message_id> -d '{"acknowledged_by":"Meera"}'
```

## Demo: store and forward

1. Settings → turn on **Simulate no signal**.
2. Hold SOS. It shows `QUEUED`, saved on the phone.
3. Turn the switch off. Within 3 s it becomes `DELIVERED`, then `ACKNOWLEDGED` once the dashboard acks.

Stopping the relay or gateway process gives the same effect for real.

## How it works

All behaviour is in `src/lib/`; screens in `src/app/` are placeholders to swap for the real UI.

| File | Role |
|---|---|
| `contract.ts` | Message types from `docs/CONTRACT.md` |
| `outbox.ts` | SQLite queue: every SOS is saved before any network call |
| `sync.ts` | Every 3 s: health check, send queued SOS (HIGH first), send check-ins, poll ack status |
| `gateway.ts` | HTTP client for the next hop (4 s timeout; 409 counts as already delivered) |
| `checkin.ts` | Dead-man timer; the check-in is stored until delivered |
| `location.ts` | GPS with a 3 s cap, falling back to last known |
| `settings.ts` | Next hop URL, device ID, worker name, interval, simulate switch |
| `alarm.ts` | Local vibration alarm |
| `relay.ts` | Relay mode: TCP/HTTP server, SQLite relay queue, forwarding, heartbeat |
| `relay-http.ts` | Minimal HTTP/1.1 request parser and response writer |

The gateway (`../../gateway`) implements the API in [`docs/CONTRACT.md`](../../docs/CONTRACT.md).

## Demo build (no laptop dev server needed)

```bash
npx eas-cli build -p android --profile preview
```
Plain HTTP to the LAN is allowed in the build (`usesCleartextTraffic`).
