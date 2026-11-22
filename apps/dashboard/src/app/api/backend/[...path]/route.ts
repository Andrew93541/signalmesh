import { NextResponse } from "next/server";

import { SESSION_COOKIE, backend, sessionToken } from "@/lib/server";

// Pass-through to the backend's responder API only (/v1/admin/*), adding the
// session token from the httpOnly cookie. Nothing else on the backend is reachable.
async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ detail: "Not signed in." }, { status: 401 });
  const { path } = await ctx.params;
  if (path.some((p) => p === ".." || p.includes("/"))) return NextResponse.json({ detail: "Bad path." }, { status: 400 });
  const search = new URL(req.url).search;
  let res: Response;
  try {
    res = await backend(`/v1/admin/${path.map(encodeURIComponent).join("/")}${search}`, {
      method: req.method,
      body: req.method === "POST" ? await req.text() : undefined,
    }, token);
  } catch {
    return NextResponse.json({ detail: "The TrackMate backend is not reachable." }, { status: 503 });
  }
  const out = new NextResponse(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
  if (res.status === 401) out.cookies.delete(SESSION_COOKIE); // expired or revoked session
  return out;
}

export const GET = forward;
export const POST = forward;
