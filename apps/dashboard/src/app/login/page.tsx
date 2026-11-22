"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(false);
    if (!res || !res.ok) return setError(body?.detail ?? "Sign-in failed.");
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border border-line bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/trekmate-logo.webp" alt="TrekMate logo" width={120} height={120} />
          <h1 className="text-2xl font-extrabold">TrackMate Command Centre</h1>
          <p className="text-sm text-muted">Responder sign-in</p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Email or phone</span>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required
            className="w-full rounded-xl border border-line-strong px-3 py-2.5 text-base" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required
            className="w-full rounded-xl border border-line-strong px-3 py-2.5 text-base" />
        </label>
        {error ? <p role="alert" className="rounded-xl bg-sos-soft px-3 py-2 text-sm text-sos-text">{error}</p> : null}
        <button disabled={busy} className="w-full rounded-xl bg-forest px-4 py-3 font-bold text-white hover:bg-forest-dark disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-xs text-muted">Only responder and admin accounts can sign in.</p>
      </form>
    </main>
  );
}
