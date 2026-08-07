# Implementation Plan: GitHub OAuth Board Connection

**Branch**: `feat/github-oauth-board-connection` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-github-oauth-board-connection/spec.md`

## Summary

Replace the manual "paste a GitHub Personal Access Token" step in the board-connection dialog with a "Continue with GitHub" OAuth action: the developer authorizes Diaphane's read access to their GitHub Projects v2 boards (extending the existing developer-login GitHub OAuth App with the `read:project` scope, requested only when a board connection is first attempted), then picks a board from the list GitHub returns — no token ever created or pasted by hand. Existing PAT-based connections keep working unchanged and indefinitely (FR-007); this is additive to, not a replacement of, the storage/sync mechanism in `specs/005-github-project-connection`.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js — matches the rest of the monorepo.

**Primary Dependencies**: NestJS 11 (`apps/api`), Next.js 16 App Router (`apps/web`), Prisma 7 / `@prisma/adapter-pg` (no schema change — see research.md Decision 6), existing `GithubOauthClient` (`apps/api/src/auth/github-oauth.client.ts`, extended, not replaced) and `GithubProjectsClient`/`token-encryption.ts` (`apps/api/src/board-connections/`, unchanged).

**Storage**: PostgreSQL via Prisma. `BoardConnection.encryptedToken` reused as-is (research.md Decision 6). One small migration: new `BoardConnection.needsReconnect Boolean @default(false)` column for FR-008 (data-model.md).

**Testing**: Jest (`apps/api`), Vitest + RTL (`apps/web`), 80% coverage gate (Constitution I).

**Target Platform**: Web (existing Diaphane app), Railway-hosted API.

**Project Type**: Web application (existing `apps/web` + `apps/api` split).

**Performance Goals**: N/A beyond existing board-connection endpoints' current behavior — this feature changes how a token is obtained, not how boards are listed/synced.

**Constraints**: GitHub OAuth Apps support exactly one registered callback URL (research.md Decision 2) — the board-connection OAuth flow must share the existing `GET /auth/github/callback` route with the developer-login flow, disambiguated via the state cookie rather than the URL.

**Scale/Scope**: Touches `apps/api/src/auth` (extend `GithubOauthClient`, `oauth-state-cookie.ts`, `auth.controller.ts`'s callback branch), `apps/api/src/board-connections` (new OAuth-start endpoint, cookie-aware token resolution in `preview`/`connect`, `needsReconnect` clearing on `connect()`), `apps/api/src/task-vulgarization` (sweep sets `needsReconnect` on an auth failure), `apps/web/features/board-connections` (`ConnectBoardDialog` UI replaced, reconnect state surfaced on the board card), and `specs/005-github-project-connection/spec.md` (FR-010/FR-011 already annotated superseded).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage Discipline**: Applies — new/changed code (extended `GithubOauthClient`, new board-connections OAuth-start endpoint, cookie-aware token resolution, replaced `ConnectBoardDialog`) ships with tests as part of the same change, keeping the 80% gate green. PASS (to be enforced during `/speckit-implement`).
- **II. Type Safety, No Escape Hatches**: The one new unchecked boundary is the board-connection OAuth callback's token exchange response — narrowed at that boundary the same way `github-oauth.client.ts` already narrows GitHub's login responses (`GithubTokenResponse`, `GithubUserResponse` interfaces). PASS.
- **III. Feature Isolation**: The board-connection OAuth-start endpoint lives in the `board-connections` module (not `auth`), even though it calls the shared `GithubOauthClient` — that client is intentionally shared infrastructure (already exported from the `auth` module), not a cross-module Prisma reach-in. `board-connections` still does not import from `auth`'s Prisma queries or vice versa. PASS.
- **IV. Never Resolve Open Product Decisions Unilaterally**: The three genuinely open questions (extend vs. separate app, fate of existing PAT connections, token expiry/refresh) were raised to and resolved by the user during `/speckit-specify` (spec.md FR-003/FR-007/FR-008) — nothing left open for this plan to guess at. PASS.
- **V. Security and Privacy by Default**: The OAuth-obtained token is encrypted before storage (reusing `token-encryption.ts`, unchanged), never logged, and only ever transits between callback and board-picker via a short-lived httpOnly cookie (research.md Decision 5) — never exposed to client-side JS. Scope requested is read-only (`read:project`, FR-010) — no write access to the developer's GitHub projects. PASS.
- **VI. Spec Before Multi-Screen or Multi-Endpoint Features**: This feature spans a new API endpoint (OAuth start for board connection), a changed callback branch, and a rebuilt dialog UI — spec (`spec.md`, user-approved) already exists; this plan is the required next step before `/speckit-tasks` → `/speckit-implement`. PASS.

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/010-github-oauth-board-connection/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/src/
├── auth/
│   ├── github-oauth.client.ts          # extend: buildAuthorizeUrl accepts a scope override
│   ├── oauth-state-cookie.ts           # extend: OAuthFlowCookiePayload gains `flow` + `projectId`
│   ├── board-oauth-cookie.ts           # new: short-lived encrypted-token cookie, sibling to oauth-state-cookie.ts (both cookies the shared callback sets/reads live in `auth/`; `board-connections.controller.ts` reads this one via a plain import — same one-way dependency direction the module graph already has, `board-connections` → `auth`)
│   └── auth.controller.ts              # extend: githubCallback branches on `flow`; on the board-connection branch, encrypts the token (`board-connections/token-encryption.ts`, imported directly — a stateless crypto helper, not a cross-module Prisma reach per Constitution III) into the new cookie
└── board-connections/
    ├── board-connections.controller.ts # add: GET :projectId/board-connection/github/authorize
    ├── board-connections.service.ts    # extend: assertIsContributor exposed for the new authorize endpoint's use
    ├── preview/connect handlers        # extend: controller resolves token from board-oauth-cookie when present, else falls back to the request body (legacy PAT path, FR-007) — BoardConnectionsService itself is unchanged, still just takes a token string
    └── github-projects.client.ts       # unchanged (already token-agnostic)

apps/web/features/board-connections/
├── api.ts                              # extend: preview/connect no longer require a client-supplied token
├── hooks.ts                            # extend accordingly
└── components/
    └── connect-board-dialog.tsx        # replaced: "Continue with GitHub" + existing board-picker step
```

**Structure Decision**: Existing feature-based layout (`apps/api/src/<module>`, `apps/web/features/<name>`) is unchanged — this feature extends two existing modules (`auth`, `board-connections`) rather than introducing a new one, since it has no standalone domain concept beyond what those two already own.

## Complexity Tracking

*No Constitution Check violations — table not needed.*
