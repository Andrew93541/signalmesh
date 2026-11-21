import { NextResponse } from "next/server";

import { SESSION_COOKIE, backend, sessionToken } from "@/lib/server";

export async function POST() {
  const token = await sessionToken();
  if (token) await backend("/v1/auth/logout", { method: "POST" }, token).catch(() => {});
  const out = NextResponse.json({ status: "ok" });
  out.cookies.delete(SESSION_COOKIE);
  return out;
}
