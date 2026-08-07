# Research: GitHub OAuth Board Connection

## Decision 1: Extend the existing GitHub OAuth App, don't register a second one

**Decision**: Reuse the same GitHub OAuth App already registered for developer login (`specs/009-developer-github-oauth`, `GithubOauthClient`, env vars `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET`). Board connection requests a broader scope (`read:user user:email read:project`) from the same app rather than standing up a second registered OAuth App.

**Rationale**: User's explicit choice (spec.md FR-003). One app to manage in the GitHub dashboard, one client id/secret pair in `.env`.

**Alternatives considered**: A dedicated second OAuth App for board access only — rejected by the user; would have kept identity and board-data grants fully separate (arguably cleaner isolation) at the cost of duplicated OAuth plumbing and a second app to register/maintain.

## Decision 2: GitHub OAuth Apps support exactly one registered callback URL — both flows share `GET /auth/github/callback`

**Decision**: Login and board-connection both redirect back to the single existing callback route, `GET /auth/github/callback`. The callback branches its behavior based on a `flow` discriminator carried in the short-lived state cookie (Decision 3), not on the URL.

**Rationale**: Confirmed via GitHub's own documentation: *"OAuth apps cannot have multiple callback URLs, unlike GitHub apps"* — only GitHub Apps (a different registration type, not what this project uses) support up to 10 callback URLs with a `redirect_uri` selector. Since `specs/009` already committed to a plain OAuth App (not a GitHub App), a second distinct callback URL for board connection isn't an option without switching app types — out of scope here.

**Alternatives considered**: Migrating to a GitHub App to get multiple callback URLs — a much larger change (GitHub Apps have a materially different installation/permission model, installation tokens instead of simple OAuth tokens) that isn't warranted just to get a second callback URL. Registering a second OAuth App with its own callback — rejected with Decision 1 for the same reason.

## Decision 3: State cookie gains a `flow` discriminator and (for board connection) a `projectId`

**Decision**: `OAuthFlowCookiePayload` (`apps/api/src/auth/oauth-state-cookie.ts`) grows two fields: `flow: 'login' | 'board-connection'` and `projectId?: string` (present only when `flow === 'board-connection'`). `auth.controller.ts`'s `githubStart`/`githubCallback` keep serving the login flow (`flow: 'login'`); a new start endpoint in the board-connections module serves the board flow (`flow: 'board-connection'`, `projectId` set). The shared callback reads `flow` to decide which branch to run.

**Rationale**: Falls out directly from Decision 2 — one physical callback route, so the cookie (already the mechanism carrying CSRF `state` + locale across the redirect) is the natural place to carry which logical flow is in progress and which project it targets.

**Alternatives considered**: Encoding the flow/projectId into the OAuth `state` parameter itself instead of the cookie — rejected: `state` is sent to GitHub and back verbatim in the URL query string on return, which would leak the `projectId` into browser history/referrer headers; the httpOnly cookie doesn't have that exposure.

## Decision 4: Incremental scope consent — confirmed via GitHub's documented scope-aggregation behavior

**Decision**: Requesting `read:user user:email read:project` for a developer who previously authorized only `read:user user:email` (at login) is a normal `/login/oauth/authorize` request with the fuller scope string — no special "incremental" API exists or is needed. GitHub shows the consent screen (since the requested scope set isn't yet fully granted) and, on approval, issues a token covering the full requested scope.

**Rationale**: GitHub's docs confirm scope-aggregation is real: *"if a user has already performed the web flow twice and has authorized one token with `user` scope and another token with `repo` scope, a third web flow that does not provide a `scope` will receive a token with `user` and `repo` scope."* This shows GitHub tracks granted scopes per user/app and issues tokens accordingly; requesting a scope that includes a not-yet-granted permission is standard practice for triggering a fresh consent screen scoped to the full requested set (well-established GitHub OAuth behavior, used broadly beyond what this specific doc page spells out verbatim).

**Alternatives considered**: None — this is how GitHub OAuth Apps work; there's no alternative mechanism to evaluate.

## Decision 5: The OAuth-obtained board token travels from callback to board-picker via a short-lived encrypted cookie, not the existing request-body `token` field

**Decision**: On a successful board-connection OAuth callback, the API exchanges the code for an access token, encrypts it with the existing `token-encryption.ts` (AES-256-GCM) utility, and sets it in a new short-lived httpOnly cookie (sibling to `oauth-state-cookie.ts`, TTL ~10 minutes, path scoped to `/projects`) before redirecting the browser back to the project's board-connection UI. `BoardConnectionsController`'s existing `preview`/`connect` endpoints read the token from this cookie when present, falling back to the request-body `token` field for the still-supported legacy PAT path (FR-007).

**Rationale**: Keeps `BoardConnectionsService.preview()`/`connect()` and `GithubProjectsClient` completely unchanged — both already just take a bearer token string, agnostic to whether it came from a pasted PAT or an OAuth exchange. Avoids ever putting the raw or encrypted OAuth token in the response body / client-side JS state, matching the security posture `token-encryption.ts` already established for PATs.

**Alternatives considered**: Returning the token directly in the callback's redirect (e.g. as a URL fragment) — rejected, leaks a bearer credential into browser history/logs. Persisting the token immediately server-side against the project before the developer has even picked a board — rejected, breaks the existing preview-then-confirm UX (FR-002/FR-006) where nothing is written until the developer actively picks a board.

## Decision 6: No token-column schema change — but one new `needsReconnect` flag for FR-008

**Decision**: `BoardConnection.encryptedToken` keeps its current shape and meaning: an encrypted bearer token, used identically by `GithubProjectsClient` regardless of whether it originated from a pasted classic PAT or an OAuth access token. No new column, no provider/method discriminator is added there. Separately, a new `needsReconnect: Boolean` column (default `false`) is added — set by the existing background sweep (`TaskVulgarizationService`) when it hits a GitHub auth error (401/403) for that connection, cleared when `BoardConnectionsService.connect()` next succeeds. See data-model.md.

**Rationale**: The GraphQL calls in `github-projects.client.ts` only ever do `Authorization: Bearer <token>` — a PAT and an OAuth access token are interchangeable at that boundary, so no discriminator is needed there. `needsReconnect` is a different concern: FR-008 requires surfacing a "reconnect" state to the developer, but all GitHub reads already happen in a 5-minute background sweep the user's request never touches (`specs/008`'s established pattern — the frontend only ever reads persisted data, never calls GitHub live). Without a persisted flag, there is no way for a page load to know the stored token has gone bad.

**Alternatives considered**: Adding a `connectionMethod: 'pat' | 'oauth'` enum column for future UI/analytics use — rejected per YAGNI; nothing in spec.md's requirements reads or displays this distinction, unlike `needsReconnect`, which FR-008 explicitly requires. Making the board-connection `GET` endpoint call GitHub live to check token validity on every page load — rejected as a needless behavior change to an existing, cheap, DB-only read, and inconsistent with the sweep-based pattern the rest of this feature area already uses.

## Decision 7: `ConnectBoardDialog` is replaced, not extended — no more manual token paste, for first connections or reconnects alike

**Decision**: The dialog's current two-step "paste token → pick board" UI (`apps/web/features/board-connections/components/connect-board-dialog.tsx`) is replaced by a single "Continue with GitHub" action that starts the OAuth flow, followed by the same board-picker step it already has today (list, select, estimate-unit toggle, confirm) once the callback redirects back with boards available. This applies uniformly whether the developer is connecting for the first time or reconnecting after a revoked/invalid token (FR-008) — there's no separate "paste a token to reconnect" path kept around.

**Rationale**: FR-001 requires no manual token creation/paste at any point in the *new* flow; keeping a token-paste fallback specifically for reconnects would reintroduce exactly what this feature removes, for no benefit (the OAuth flow is symmetric for first connect and reconnect — same "authorize → pick board" shape either way, per Decision 4's scope-aggregation behavior making re-authorization fast when already granted).

**Alternatives considered**: Keeping the PAT paste form as a fallback/advanced option alongside the new OAuth button — rejected as unnecessary complexity; existing PAT connections already keep working without ever touching this dialog again (FR-007), so a fallback would only serve a developer who *wants* to paste a token by choice, which isn't a requirement.
