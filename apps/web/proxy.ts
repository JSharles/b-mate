import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

// Cookie name must match SESSION_COOKIE_NAME in apps/api/src/auth/session-cookie.ts.
const SESSION_COOKIE_NAME = "session_token";
// Path segments (right after the locale prefix) that require a session.
// The authoritative check happens server-side in the (protected) layout via
// GET /auth/me — this is just a cheap, network-free first line of defense.
const PROTECTED_SEGMENTS = ["home", "profile"];

const handleI18nRouting = createMiddleware(routing);

export function proxy(request: NextRequest) {
  // Run next-intl's routing first — it may redirect/rewrite to add the
  // locale prefix. We inspect the original pathname ourselves below rather
  // than the (possibly rewritten) response, since we only need to know the
  // resolved locale and the first real route segment.
  const response = handleI18nRouting(request);

  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const [maybeLocale, firstSegment] = segments;
  const isKnownLocale = (routing.locales as readonly string[]).includes(maybeLocale);
  const locale = isKnownLocale ? maybeLocale : routing.defaultLocale;
  const routeSegment = isKnownLocale ? firstSegment : maybeLocale;

  const isProtected = PROTECTED_SEGMENTS.includes(routeSegment);
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  return response;
}

export const config = {
  // next-intl's recommended matcher: every path except API routes, Next
  // internals, and files with an extension (favicon.ico, etc).
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
