# Phase 1 Data Model: Developer GitHub OAuth Login

## `User` (existing table, two column changes)

| Field | Type | Change | Note |
|---|---|---|---|
| `passwordHash` | `String?` | **now nullable** (was required) | A developer created via GitHub never has a password. Client accounts (still email/password) continue to set this on signup, unchanged. |
| `githubId` | `String?` `@unique` | **new column** | GitHub's stable numeric account id (as a string, matching how Prisma/Postgres commonly store external numeric ids without risking JS number precision loss). `null` for client accounts and for any developer account that predates this feature and was never re-created via GitHub (per spec FR-008, no migration is performed on those). |

Everything else on `User` (`firstName`, `lastName`, `email`, `accountKind`, `company`, `address`, `phone`, `image`, `bio`, `github`, `socials`, `roleTitle`, `status`) is unchanged in shape. On first GitHub login, `firstName`/`lastName` are populated by splitting GitHub's `name` field on the first space (best-effort — GitHub's `name` is a single free-text field, unlike Diaphane's first/last split; if `name` is empty, both fall back to the GitHub `login` username), `image` is set to GitHub's `avatar_url`, `email` to the verified primary email (Decision 5).

**Not conflated**: the existing `github` column (free-text, declarative "here's my GitHub profile" bio field, unrelated to auth) is untouched by this feature and remains independently editable on the profile — see research.md Decision 6 header note and spec.md Assumptions.

**Migration**: one Prisma migration, `<timestamp>_add_github_oauth` — `ALTER COLUMN password_hash DROP NOT NULL`, `ADD COLUMN github_id TEXT UNIQUE`.

## New: short-lived OAuth flow cookie (not a database row)

Not a table — a second, short-lived cookie set by `GET /auth/github` and read (then cleared) by `GET /auth/github/callback`. Distinct from the long-lived session cookie (`session_token`).

| Field | Purpose |
|---|---|
| `state` | Random CSRF token, compared against GitHub's returned `state` query param (research.md Decision 3) |
| `locale` | The developer's current locale (`fr` \| `en`), carried through so the final redirect lands on the right locale-prefixed route (research.md Decision 9) |

Lifetime: ~10 minutes, `httpOnly`, `sameSite=lax` (same reasoning as the session cookie — this flow is a top-level redirect, not a fetch, so `lax` is sufficient and correct).

## API surface (documented here, no `contracts/` — see plan.md Project Structure)

### `GET /auth/github?locale=<fr|en>`
- Generates `state`, sets the OAuth flow cookie (`state` + `locale`), and issues a `302` redirect to `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri` (→ this API's own `/auth/github/callback`), `scope=read:user user:email`, and `state`.
- No request body, no auth required (this *is* the unauthenticated entry point).

### `GET /auth/github/callback?code=<...>&state=<...>`
- Verifies `state` against the flow cookie; on mismatch/missing cookie → `302` redirect to `${WEB_ORIGIN}/<locale>/login?error=state_mismatch` (generic "something went wrong, try again" on the frontend — no account created, no session).
- Exchanges `code` for a GitHub access token (`POST https://github.com/login/oauth/access_token`).
- Fetches `GET https://api.github.com/user` and `GET https://api.github.com/user/emails` with that token; discards the token immediately after (research.md Decision 4).
- No verified primary email found → `302` redirect to `${WEB_ORIGIN}/<locale>/login?error=github_email_required` (FR-006's plain-language message, rendered by the frontend from the `error` query param).
- Otherwise: find-or-create `User` by `githubId` (research.md Decision 6), create a session exactly as `AuthService.createSession` already does for password logins, set the existing `session_token` cookie, clear the OAuth flow cookie, and `302` redirect to `${WEB_ORIGIN}/<locale>/home`.

### External boundary: GitHub's responses (the one place this feature touches unchecked external data — Constitution II)

Narrowed at the point they're received, in `github-oauth.client.ts`, not trusted further upstream:

```ts
// POST https://github.com/login/oauth/access_token (Accept: application/json)
{ access_token: string; scope: string; token_type: string }

// GET https://api.github.com/user
{ id: number; login: string; name: string | null; avatar_url: string }

// GET https://api.github.com/user/emails
Array<{ email: string; primary: boolean; verified: boolean }>
```

## `AuthGateway` (research.md Decision 10, revised)

Not a new data model — a composition-only component, `apps/web/features/auth/components/auth-gateway.tsx`, rendered by both `/login` and `/signup`. Local `useState<"developer" | "client">` (default `"developer"`) toggles between the unchanged `GitHubAuthCard` and the unchanged `LoginForm`/`/auth/login` endpoint. No new schema, no new API surface, no new route — `/login` and `/signup` still exist as before, they just render `AuthGateway` instead of the old `LoginForm`/`SignupForm` directly.

## Frontend state (no new client-side data model)

`GitHubAuthCard` (research.md Decision 7) is presentational — it reads only the `error` query param (`state_mismatch` | `github_email_required`) that the callback redirect may attach, and maps it to one of two plain-language messages. No form state, no client-side validation, no new schema in `packages/schemas` (the redirect-driven flow never round-trips a typed request/response through the existing `apiFetch` JSON client the way `login`/`signup` do today).
