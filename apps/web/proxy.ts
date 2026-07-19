import { NextResponse, type NextRequest } from "next/server";

// Cheap first line of defense: presence-only check, no network call. The
// authoritative check happens server-side in app/(protected)/layout.tsx via
// GET /auth/me, which also gets us a fresh, validated session.
// Cookie name must match SESSION_COOKIE_NAME in apps/api/src/auth/session-cookie.ts.
const SESSION_COOKIE_NAME = "session_token";

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*", "/profile/:path*"],
};
