# Research: Project Settings

## Decision 1: Notion connection management is extracted into its own `notion-connection` module/feature, mirroring `board-connections`

**Decision**: `NotionConnection`'s Prisma access, encryption, and the `NotionClient` HTTP wrapper move out of `apps/api/src/resources/` into a new `apps/api/src/notion-connection/` module — its own controller (`GET/POST/DELETE /projects/:projectId/notion-connection`), service, and DTO. `resources.service.ts`'s `createFromNotion()` depends on the new `NotionConnectionService` via NestJS dependency injection to resolve the stored, decrypted token, rather than querying `prisma.notionConnection` itself. On the frontend, a new `apps/web/features/notion-connection/` feature (api/hooks/components) owns connect/disconnect, mirroring `features/board-connections/` exactly.

**Rationale**: Settings needs to compose both connections' full management UI (connect, reconnect, disconnect) on one screen. If Notion connection management stayed inside `features/resources`, the new Settings page would have to import from `features/resources` to render it — a direct Constitution III violation (a feature must not import from another feature). Extracting it into its own module/feature makes Settings' composition trivial (`<BoardConnectionCard />` + `<NotionConnectionCard />`, both from their own independent features) and makes Notion connection symmetric with how GitHub board connection already works, rather than staying the odd one out.

**Alternatives considered**: Leaving `NotionConnection` in `resources` and having the Settings *page* (not a feature) import both `features/board-connections` and `features/resources` directly — technically allowed (`app/` is routing-only and may import from any feature per AGENTS.md), but would force the Notion connection *card* component itself to live inside `features/resources`, which then makes `features/resources` responsible for a concern (project-level tool connection management) that has nothing to do with resources specifically, and blocks reusing that card if a future settings-adjacent surface needs it. Rejected in favor of matching `board-connections`' already-proven shape.

## Decision 2: Standalone Notion connect verifies the token via `GET /v1/users/me`, not by requiring a page URL

**Decision**: The new `POST /projects/:projectId/notion-connection` endpoint accepts only `{ token }` (no page URL) and verifies it by calling Notion's `GET /v1/users/me` — the standard way to confirm an integration token is valid without needing any specific page shared with it. `NotionClient` gains a `verifyToken(token): Promise<void>` method (throws `NotionAccessError` on a non-2xx, exactly like `fetchPage`'s existing error handling) for this.

**Rationale**: Connecting the integration and adding a specific Notion page as a resource are now two separate actions (Settings vs. "Add a resource") — connecting can no longer piggyback on "does this token see this one page" the way `createFromNotion()`'s old combined flow did. `GET /v1/users/me` is Notion's own documented way to validate a token in isolation, mirroring how `BoardConnectionsService.connect()` re-verifies access before persisting.

**Alternatives considered**: Storing the token unverified and only discovering it's invalid the first time a resource is added — rejected, it would silently defer a connect-time error to a much later, confusing point (spec.md FR-003's "manage the connection" implies the connect action itself should confirm the token works).

## Decision 3: `CreateResourceNotionDto` drops `token` entirely — resource creation becomes page-URL-only, always

**Decision**: `POST /projects/:projectId/resources/notion`'s request body becomes `{ pageUrl: string }`. `ResourcesService.createFromNotion()` no longer accepts an optional token parameter — it always resolves the project's stored `NotionConnection` via `NotionConnectionService`, and throws a clear 400 (pointing the developer at Settings) if none exists.

**Rationale**: The optional-token/upsert-as-side-effect design from specs/011's same-day revision (earlier in this session) was a stepping stone toward exactly this — now that Settings is the dedicated place to connect, carrying dead "or pass a token here too" support in the resource-creation endpoint would contradict FR-005/FR-006 and leave an inconsistent, unused code path.

**Alternatives considered**: Keeping `token` optional on this endpoint "just in case" — rejected as unnecessary complexity once Settings fully owns connecting; YAGNI.

## Decision 4: Read-only connection status is shared; connect/disconnect mutations are not

**Decision**: A minimal `useNotionConnectionStatus`-style read (`{ connected: boolean }`) moves to `apps/web/shared/hooks/`, importable by both `features/resources` (Add Resource dialog, to decide whether to show the "connect first" message) and `features/notion-connection` (Settings card, to show current state). The connect/disconnect mutations stay inside `features/notion-connection` only — `features/resources` never mutates the connection, only reads whether one exists.

**Rationale**: Matches AGENTS.md's own stated reasoning for why `useCurrentUser` lives in `shared/hooks` rather than a feature: "almost every feature needs to know [it]." Here, two features need the same read; only one manages the underlying resource. Putting the whole `notion-connection` feature in `shared/` instead would be the wrong direction — `shared/` is for code multiple features need, not a dumping ground for a feature's full CRUD surface just because one read is widely needed.

**Alternatives considered**: Duplicating the status query in both features — rejected, identical query key/fetch logic maintained twice invites drift (e.g. the query key changing in one place and not the other, silently breaking cache invalidation between the two).

## Decision 5: The GitHub OAuth board-connection callback redirects to Settings, not the project page

**Decision**: `auth.controller.ts`'s `githubBoardConnectionCallback()` currently builds `projectUrl = `${webOrigin}/${locale}/projects/${projectId}`` and redirects there (with `?connectBoard=1` or `?boardConnectError=...`) once the OAuth exchange completes. Since `BoardConnectionCard` moves to Settings, this must become `.../projects/${projectId}/settings` instead.

**Rationale**: The developer starts the "Connect a board" flow from Settings now, gets redirected out to GitHub, and must land back on the screen that actually renders `BoardConnectionCard` (and its `useSearchParams`-based `connectBoard`/`boardConnectError` handling) — spec.md's Edge Cases explicitly calls this out. Missing this would silently strand the OAuth callback on a project page that no longer has anything listening for `?connectBoard=1`.

**Alternatives considered**: None — this is a required consequence of relocating the card, not a design choice with tradeoffs.

## Decision 6: Settings access — any contributor, not admin-gated

**Decision**: Settings requires only contributor role (already resolved via `/speckit-specify` clarification), matching the access level `BoardConnectionsService`/the Notion connection logic already enforce individually today.

**Rationale**: Bundling two already-contributor-accessible surfaces into one screen must not silently tighten access to admin-only — nothing in the spec calls for that, and it would be a scope-creep permissions change nobody asked for.

**Alternatives considered**: Admin-only Settings — rejected per the resolved clarification; would also require introducing admin-gating logic that doesn't exist for these connections today.
