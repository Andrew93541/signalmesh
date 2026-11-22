import { NextResponse } from "next/server";

import { COOKIE_SECURE, SESSION_COOKIE, backend } from "@/lib/server";

// Sign in with a TrackMate account; only responders and admins get a dashboard session.
export async function POST(req: Request) {
  const { identifier, password } = await req.json().catch(() => ({}));
  if (!identifier || !password) {
    return NextResponse.json({ detail: "Enter your email or phone and password." }, { status: 400 });
  }
  let res: Response;
  try {
    res = await backend("/v1/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
  } catch {
    return NextResponse.json({ detail: "The TrackMate backend is not reachable." }, { status: 503 });
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ detail: body?.detail ?? "Sign-in failed." }, { status: res.status });

  if (!["responder", "admin"].includes(body.user?.role)) {
    // Do not keep a session for non-responders.
    await backend("/v1/auth/logout", { method: "POST" }, body.token).catch(() => {});
    return NextResponse.json({ detail: "This account does not have responder access." }, { status: 403 });
  }
  const out = NextResponse.json({ user: { full_name: body.user.full_name, role: body.user.role } });
  out.cookies.set(SESSION_COOKIE, body.token, {
    httpOnly: true, sameSite: "strict", secure: COOKIE_SECURE, path: "/", maxAge: 60 * 60 * 12,
  });
  return out;
}
