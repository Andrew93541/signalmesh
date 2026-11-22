// Server-only helpers. The responder's backend session token lives in an
// httpOnly cookie and is only ever read here, never by browser code.
import "server-only";

import { cookies } from "next/headers";

export const SESSION_COOKIE = "tm_session";
export const BACKEND_URL = (process.env.TRACKMATE_BACKEND_URL ?? "http://127.0.0.1:8100").replace(/\/+$/, "");
export const COOKIE_SECURE = process.env.SESSION_COOKIE_SECURE === "true";

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function backend(path: string, init: RequestInit = {}, token?: string | null): Promise<Response> {
  return fetch(BACKEND_URL + path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}
