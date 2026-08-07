# Data Model: GitHub OAuth Board Connection

## BoardConnection (existing — one new field for FR-008)

See `apps/api/prisma/schema.prisma`'s `BoardConnection` model.

| Field | Type | Notes |
|---|---|---|
| `encryptedToken` | `String` | Unchanged. Now holds either a legacy pasted-PAT ciphertext or an OAuth-access-token ciphertext — indistinguishable at rest and treated identically by `GithubProjectsClient` (research.md Decision 6). No new field marks which kind it is. |
| `needsReconnect` | `Boolean` (new, default `false`) | Set to `true` by `TaskVulgarizationService`'s existing 5-minute sweep (`apps/api/src/task-vulgarization/task-vulgarization.service.ts`) when a GitHub call for this connection fails with an auth error (401/403 — token revoked or invalid), rather than a transient/network failure. Cleared back to `false` whenever `BoardConnectionsService.connect()` succeeds for that project (a fresh, working token was just verified). This is the persisted signal FR-008's "reconnect" state reads — the sweep already runs in the background independent of any user request (per `specs/008`'s existing pattern), so it's the only place positioned to detect the failure and record it. |
| *(all other fields)* | — | Unchanged: `provider`, `boardOwnerLogin`, `boardOwnerType`, `boardNumber`, `boardTitle`, `boardUrl`, `estimateUnit`, timestamps. One row per project (`projectId` unique), replaced on reconnect. |

**Validation rules**: Unchanged — a board connection is only ever created after `GithubProjectsClient.verifyBoardAccess()` confirms the token can actually read that specific board (`BoardConnectionsService.connect()`), which also clears `needsReconnect`.

## GitHub Board Authorization (new — transient, not a persisted entity)

Represents the developer's in-progress grant of Diaphane's read access to their GitHub Projects v2 boards, between the OAuth redirect and the developer picking a board. Deliberately **not** a database row — it's short-lived state, expressed as two cookies (mirroring the existing login flow's pattern):

| Cookie | Carries | Lifetime | Set by | Read by |
|---|---|---|---|---|
| `github_oauth_flow` (existing, extended) | `{ state, locale, flow: 'login' \| 'board-connection', projectId? }` | 10 min | `GET /auth/github` (login) or the new board-connection OAuth-start endpoint | `GET /auth/github/callback` (both flows) |
| `board_oauth_token` (new) | Encrypted OAuth access token | ~10 min, path-scoped to `/projects` | `GET /auth/github/callback`, once `flow === 'board-connection'` | `POST .../board-connection/preview` and `POST .../board-connection` |

Once the developer completes `connect()` (or the cookie expires unused), this "authorization" state is gone — what persists afterward is only the resulting `BoardConnection` row, exactly as it does today for a pasted PAT.

**State transitions**:

1. Developer starts a board connection → `github_oauth_flow` cookie set (`flow: 'board-connection'`, `projectId`) → redirect to GitHub.
2. GitHub redirects back to `/auth/github/callback` → state validated, code exchanged for an access token → `board_oauth_token` cookie set, `github_oauth_flow` cleared → redirect to the project's board-connection UI.
3. Frontend calls the existing preview endpoint → reads `board_oauth_token`, lists boards (no `BoardConnection` row yet).
4. Developer picks a board, calls the existing connect endpoint → reads `board_oauth_token`, verifies access, encrypts the token into `BoardConnection.encryptedToken`, clears `board_oauth_token`.

If the developer abandons the flow at any point (closes tab, cookie expires), no `BoardConnection` row is ever touched — identical to today's abandoned-PAT-paste case.

## Relationship to `specs/009-developer-github-oauth`'s identity authorization

The developer-login GitHub authorization (`GithubOauthClient`, scope `read:user user:email`) and this board authorization (scope adds `read:project`) are the same GitHub OAuth App and, once both have been granted, the same underlying GitHub-side "installation" — but they produce **separate access tokens** for separate purposes: the login token is used once at the login callback and discarded (unchanged, `specs/009`); the board token is the one that gets encrypted and persisted into `BoardConnection`. Revoking the app's access on GitHub's side invalidates both — which is exactly the trigger for FR-008's "reconnect" state on the board side.
