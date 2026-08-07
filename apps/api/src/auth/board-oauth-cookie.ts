import { CookieOptions } from 'express';

// Short-lived, sibling to oauth-state-cookie.ts — carries the
// GitHub-OAuth-obtained board-read access token (already encrypted via
// board-connections/token-encryption.ts) from the shared callback
// (auth.controller.ts) to the board-connection preview/connect endpoints
// (specs/010-github-oauth-board-connection, research.md Decision 5). Never
// holds a plaintext token, and never reaches client-side JS (httpOnly).
export const BOARD_OAUTH_TOKEN_COOKIE_NAME = 'board_oauth_token';
export const BOARD_OAUTH_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function boardOAuthTokenCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: BOARD_OAUTH_TOKEN_TTL_MS,
    path: '/projects',
  };
}
