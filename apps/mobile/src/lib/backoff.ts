// Retry pacing shared by the SOS sync loop and the relay forwarder.
// No dependencies, so it can be unit-tested in Node (scripts/test-backoff.mts).

export const RETRY_BASE_MS = 3_000;
export const RETRY_MAX_MS = 60_000;

/** Delay before the next attempt after `failures` consecutive failures: 3 s, 6 s, 12 s… capped at 60 s, ±20% jitter. */
export function backoffDelay(failures: number, baseMs = RETRY_BASE_MS, maxMs = RETRY_MAX_MS, rand: () => number = Math.random): number {
  const n = Math.max(0, Math.min(failures, 20));
  const d = Math.min(maxMs, baseMs * 2 ** n);
  return Math.round(d * (0.8 + 0.4 * rand()));
}

/** Only https:// is accepted for the hosted (internet) gateway; local hops may use http on the LAN. */
export function isHttpsUrl(url: string): boolean {
  return /^https:\/\/[^/\s]+/i.test(url.trim());
}

/**
 * Address set at build time vs. one saved on the phone. The build's address wins only
 * when the saved one is empty or a loopback (127.0.0.1 / localhost works only over a
 * USB cable to the Mac) or an old quick-tunnel address; anything else the user typed is kept.
 */
export function preferBuiltAddress(saved: string | undefined | null, built: string | undefined | null): string {
  const s = (saved ?? '').trim();
  const b = (built ?? '').trim();
  if (!b) return s;
  if (!s || /^https?:\/\/(127\.\d+\.\d+\.\d+|localhost)(:\d+)?\/?$/i.test(s)) return b;
  // Quick-tunnel addresses change every time the tunnel restarts: an old one is dead.
  if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/?$/i.test(s) && /\.trycloudflare\.com\/?$/i.test(b)) return b;
  return s;
}
