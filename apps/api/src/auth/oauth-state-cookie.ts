import { CookieOptions } from 'express';

// Short-lived, sibling to session-cookie.ts's long-lived session cookie — not
// to be confused with it. Carries the CSRF `state` token and the developer's
// current locale across the redirect to GitHub and back (specs/009-developer-
// github-oauth, research.md Decisions 3 and 9), then is cleared on callback.
export const OAUTH_FLOW_COOKIE_NAME = 'github_oauth_flow';
export const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000; // 10 minutes

// `flow` disambiguates the single shared callback route
// (auth.controller.ts's githubCallback) between the developer-login flow
// and the board-connection flow — GitHub OAuth Apps only support one
// registered callback URL (specs/010-github-oauth-board-connection
// research.md Decision 2), so both share this cookie's shape instead of
// having their own route. A discriminated union (rather than an optional
// `projectId`) lets callers narrow on `flow` and get `projectId` typed as
// a real `string`, not `string | undefined`, in the board-connection case.
export type OAuthFlowCookiePayload =
  | { state: string; locale: string; flow: 'login' }
  | {
      state: string;
      locale: string;
      flow: 'board-connection';
      projectId: string;
    };

export function oauthFlowCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: OAUTH_FLOW_TTL_MS,
    path: '/auth/github',
  };
}

export function serializeOAuthFlowCookie(
  payload: OAuthFlowCookiePayload,
): string {
  return JSON.stringify(payload);
}

// Returns null for a missing, malformed, or incomplete cookie — callers treat
// that identically to a state mismatch (see auth.controller.ts).
export function parseOAuthFlowCookie(
  raw: string | undefined,
): OAuthFlowCookiePayload | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.state !== 'string' ||
      typeof candidate.locale !== 'string' ||
      (candidate.flow !== 'login' && candidate.flow !== 'board-connection')
    ) {
      return null;
    }

    if (
      candidate.flow === 'board-connection' &&
      (typeof candidate.projectId !== 'string' ||
        candidate.projectId.length === 0)
    ) {
      return null;
    }

    return candidate as unknown as OAuthFlowCookiePayload;
  } catch {
    return null;
  }
}
