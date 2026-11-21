import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only (real authorization happens in the backend on every call):
// pages need a session cookie, otherwise go to /login.
export function proxy(request: NextRequest) {
  if (!request.cookies.get("tm_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api|_next|brand|favicon.ico).*)"],
};
