# Implementation Plan: GitHub Projects Board Connection

**Branch**: `feat/github-project-connection` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-github-project-connection/spec.md`

## Summary

Let a project's contributors connect that project to exactly one GitHub Projects (v2) board, using a developer-supplied Personal Access Token (fine-grained recommended) rather than an OAuth/GitHub App flow — a deliberate choice so a future provider (e.g. Notion) can reuse the same "paste a token" UX. The connect flow is two-step: the developer pastes a token, b-mate calls GitHub's GraphQL API to list the boards that token can see, the developer picks one, and b-mate re-validates access before storing the connection. Nothing beyond the connection itself (board identity + encrypted token) is fetched or displayed — no issues/tasks, no client-facing surface. This replaces the existing "Settings — Connect your board — coming soon" placeholder for contributors only; client-role members never see it.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 (`apps/web`), NestJS 11 (`apps/api`) — existing stack, no change.

**Primary Dependencies**: Existing stack only. GitHub Projects v2 has no REST endpoint — it's GraphQL-only — so the backend calls `https://api.github.com/graphql` directly via the platform's built-in `fetch`, wrapped in a small injectable client (no GitHub SDK dependency added, for one narrow query shape). Token encryption at rest uses Node's built-in `crypto` (AES-256-GCM) — no new dependency there either.

**Storage**: PostgreSQL via Prisma. One new model, `BoardConnection`, 1:1 with `Project` (unique `projectId`), holding the encrypted PAT and the board's identifying info (owner login + type, project number, title, URL). A new `BoardProvider` enum with a single `github` value today — sized for future providers without reshaping the column, not building multi-provider support now.

**Testing**: Vitest + RTL (`apps/web`), Jest (`apps/api`) — same as the rest of the repo; 80% coverage gate applies. The GitHub GraphQL client is its own injectable provider so `BoardConnectionsService` tests mock it directly (same pattern as `PrismaService`'s `createPrismaMock()`) rather than mocking global `fetch`.

**Target Platform**: Web (existing app), no new platform.

**Project Type**: Web application — new `apps/api/src/board-connections` module (own controller/service, does not reach into `ProjectsService`'s internals — duplicates the existing `assertIsMember`-style membership check as its own copy, matching the existing `InvitationsService`/`ProjectsService` precedent for Constitution III). New `apps/web/features/board-connections` feature, composed into the project page the same way `features/invitations` already is.

**Performance Goals**: N/A — low-frequency, explicit user actions (connect/preview/disconnect), not a hot path; no new query pattern on any frequently-hit endpoint.

**Constraints**: The stored PAT MUST be encrypted at rest (FR-012) — a new `BOARD_CONNECTION_ENCRYPTION_KEY` env var (added to `apps/api/.env.example`, per AGENTS.md's env-var convention), never committed. The token is never returned in any API response after the initial connect confirmation, and never logged (including in error messages — GitHub API errors must be sanitized before surfacing).

**Scale/Scope**: One new Prisma model + migration, one new backend module (controller, service, a thin GitHub GraphQL client, token encryption helpers), one new frontend feature (`board-connections`) replacing one existing placeholder card. No changes to `ProjectMembers`/role model, no new business rule beyond who can manage a connection (contributors).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage**: Applies. New module (controller, service, GitHub client, encryption helpers) and the new frontend feature all need tests in the same change; the GitHub client's injectability means no test needs a live network call.
- **II. Type Safety**: Applies. New Zod schemas in `packages/schemas` for the preview/connect requests and the connection response — request/response shapes are never a loose `any`. GitHub's GraphQL response is a genuine third-party boundary; it is narrowed to an explicit local type at the client, not threaded through the app as `any` (Constitution II's stated exception for boundaries applies here, and only here).
- **III. Feature Isolation**: New `apps/api/src/board-connections` module — its own service, no direct reach into `ProjectsService`'s Prisma queries. New `apps/web/features/board-connections` — does not import from `features/projects`; the project page composes it, exactly as it already composes `features/invitations`.
- **IV. Never Resolve Open Product Decisions Unilaterally**: The one real open question (which GitHub auth mechanism) was raised and resolved with the user during specification — PAT, fine-grained recommended, deliberately chosen for future multi-provider consistency (FR-010/FR-011). Nothing else discovered during planning warrants a further pause.
- **V. Security and Privacy by Default**: The PAT is the most sensitive new data this feature introduces — encrypted at rest (AES-256-GCM, key never committed), never returned in a response body once stored (only display metadata), never logged. Connection endpoints require project membership; a non-member gets the same "not found" as a genuinely absent connection, consistent with the existing anti-enumeration pattern in `ProjectsService`/`InvitationsService`. A client-role member gets the same treatment as a non-contributor for these endpoints (FR-009) — never a distinct "forbidden" that would confirm a connection exists.
- **VI. Spec Before Multi-Screen/Multi-Endpoint Features**: This is why we're here — spec already written, clarified with the user, and checklist-complete before this plan.

No violations. Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/005-github-project-connection/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/api/prisma/
└── schema.prisma                        # new enum BoardProvider { github };
                                           # new model BoardConnection (1:1 with Project,
                                           # unique projectId; encrypted token column)
└── migrations/                          # new migration: create BoardConnection table

apps/api/.env.example                    # + BOARD_CONNECTION_ENCRYPTION_KEY

apps/api/src/board-connections/
├── board-connections.module.ts
├── board-connections.controller.ts       # GET    /projects/:id/board-connection
│                                          # POST   /projects/:id/board-connection/preview
│                                          # POST   /projects/:id/board-connection
│                                          # DELETE /projects/:id/board-connection
├── board-connections.controller.spec.ts
├── board-connections.service.ts           # assertIsContributor (own copy, Constitution III);
│                                           # preview() calls the GitHub client, stores nothing;
│                                           # connect() re-validates access, upserts (FR-006);
│                                           # disconnect() hard-deletes the row (FR-005)
├── board-connections.service.spec.ts
├── github-projects.client.ts              # thin wrapper over GitHub's GraphQL API:
│                                           # listAccessibleBoards(token), verifyBoardAccess(token, owner, ownerType, number)
├── github-projects.client.spec.ts
├── token-encryption.ts                    # encrypt/decrypt (AES-256-GCM) using BOARD_CONNECTION_ENCRYPTION_KEY
├── token-encryption.spec.ts
└── dto/
    ├── preview-board-connection.dto.ts    # { token }
    └── create-board-connection.dto.ts     # { token, owner, ownerType, number }

packages/schemas/src/
└── board-connection.ts                    # AvailableBoardSchema, PreviewBoardConnectionRequestSchema,
                                            # CreateBoardConnectionRequestSchema, BoardConnectionSchema

apps/web/features/board-connections/
├── api.ts
├── hooks.ts                                # useBoardConnection(projectId), usePreviewBoardConnection(projectId),
│                                            # useConnectBoard(projectId), useDisconnectBoard(projectId)
└── components/
    ├── board-connection-card.tsx           # replaces the Settings "coming soon" placeholder for contributors
    ├── board-connection-card.test.tsx
    ├── connect-board-dialog.tsx            # step 1: paste token -> preview; step 2: pick a board -> confirm
    └── connect-board-dialog.test.tsx

apps/web/app/[locale]/(protected)/projects/[id]/page.tsx
                                            # swap the Settings ComingSoonCard for BoardConnectionCard
                                            # when isContributor (unchanged visibility gate)
```

**Structure Decision**: New `apps/api/src/board-connections` module (own controller/service/GitHub client/encryption helpers) and new `apps/web/features/board-connections` feature, composed into the existing project page in place of the current Settings placeholder. No new app, no change to the `ProjectMembers` role model.

## Complexity Tracking

*No violations — table not needed.*
