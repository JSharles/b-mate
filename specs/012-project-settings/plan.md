# Implementation Plan: Project Settings

**Branch**: `012-project-settings` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-project-settings/spec.md`

## Summary

A new project-level Settings area consolidates the two external-tool connections that currently live in inconsistent places: the GitHub Projects board connection (today a card on the project page) and the Notion connection (today an ad-hoc token field inside the "Add a resource" dialog, itself just revised earlier in specs/011 to be project-scoped). Both move to a dedicated `/projects/[id]/settings` route, reusing their existing business logic untouched. The Notion connection additionally gains its own first-class connect/disconnect endpoints (it previously only got a connection as a side effect of adding a resource) and moves out of the `resources` module into its own `notion-connection` module, mirroring how `board-connections` is already structured — so both connections are symmetric, independently-owned domains that Settings simply composes. The "Add a resource" dialog's Notion tab is simplified: it no longer collects a token at all, and instead links to Settings when no connection exists.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js — matches the rest of the monorepo.

**Primary Dependencies**: NestJS 11 (`apps/api`), Next.js 16 App Router (`apps/web`), Prisma 7 (no schema/migration changes required — `NotionConnection` is already project-scoped with the columns this feature needs, per specs/011's same-day revision). No new npm dependencies for either app.

**Storage**: PostgreSQL via Prisma — reuses the existing `BoardConnection` and `NotionConnection` tables as-is. Zero new migrations.

**Testing**: Jest (`apps/api`), Vitest + RTL (`apps/web`), 80% coverage gate (Constitution I). The Notion API's token-verification call (new) is mocked in tests, consistent with how `GithubOauthClient`/`GithubProjectsClient` are already tested.

**Target Platform**: Web (existing Diaphane app), Railway-hosted API.

**Project Type**: Web application (existing `apps/web` + `apps/api` split).

**Performance Goals**: N/A beyond existing patterns — this is a UI-relocation and small-CRUD feature, no new latency-sensitive path.

**Constraints**: No behavior change to the GitHub OAuth flow or Notion page-fetching logic — only where their UI is mounted and, for Notion, how its connection is established (now standalone, not bundled with creating a resource).

**Scale/Scope**: A new `apps/api/src/notion-connection` module (extracted from `resources`, mirrors `board-connections`' shape: controller, service, DTO, the relocated `NotionClient`, gains a new token-verification call). `resources` module keeps `NotionConnection`'s Prisma access removed — `ResourcesService.createFromNotion()` now depends on `NotionConnectionService` (cross-module DI, not a Prisma reach-in — same pattern `TaskVulgarizationModule` already uses for `BoardConnectionsModule`) to resolve the stored token, and its request DTO drops the now-obsolete optional `token` field entirely (Notion resource creation becomes page-URL-only, always). New `apps/web/features/notion-connection` feature (mirrors `board-connections`: api/hooks/components for connect/disconnect/status). A new `shared/hooks` read-only status hook lets `features/resources`' Add Resource dialog check connection status without importing another feature (Constitution III). New `apps/web/app/[locale]/(protected)/projects/[id]/settings/page.tsx` route composes `BoardConnectionCard` (existing, relocated) and the new `NotionConnectionCard`. `BoardConnectionCard` is removed from the main project page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage Discipline**: Applies — the new `notion-connection` module, the relocated frontend components, and every touched file keep tests in the same change. PASS (enforced during `/speckit-implement`).
- **II. Type Safety, No Escape Hatches**: The one new unchecked boundary (Notion's token-verification response) is narrowed at that boundary, mirroring `NotionClient`'s existing `fetchPage`/error handling. PASS.
- **III. Feature Isolation**: This is the central design question this plan resolves. Backend: `NotionConnection` Prisma access is extracted into its own `notion-connection` module; `resources` depends on it via NestJS DI (a service-to-service dependency, not a raw Prisma reach-in — identical in kind to `task-vulgarization` depending on `board-connections` today). Frontend: the new `features/notion-connection` (connect/disconnect, Settings-only) and `features/resources` (Add Resource dialog) both need read-only connection *status* — that shared need is extracted to `shared/hooks`, not imported feature-to-feature, per AGENTS.md's own stated reasoning for why `useCurrentUser` lives in `shared/`. PASS.
- **IV. Never Resolve Open Product Decisions Unilaterally**: The three genuinely open questions (Settings' navigation entry point, its access level, the Notion tab's exact unconfigured-state behavior) were raised and resolved with the user during `/speckit-specify` (see spec.md Clarifications) before this plan was written. PASS.
- **V. Security and Privacy by Default**: The Notion token is still encrypted at rest with the same audited utility; the new standalone connect endpoint verifies the token against Notion's API before persisting it (mirrors `BoardConnectionsService.connect()`'s re-verify-before-persist pattern) rather than storing an unverified value. Settings access is gated identically to every other contributor-only surface (same not-found response for a client/non-member). PASS.
- **VI. Spec Before Multi-Screen or Multi-Endpoint Features**: This feature spans a new route, a relocated card, a new card, and multiple new/changed endpoints — spec.md (user-approved, all three clarifications resolved) already exists; this plan is the required next step before `/speckit-tasks` → `/speckit-implement`. PASS.

No violations requiring the Complexity Tracking table — extracting `notion-connection` as its own module is the more Constitution-III-compliant option, not a deviation from it.

## Project Structure

### Documentation (this feature)

```text
specs/012-project-settings/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/src/
├── notion-connection/                        # new module, extracted from resources/
│   ├── notion-connection.controller.ts       # GET/POST/DELETE projects/:projectId/notion-connection
│   ├── notion-connection.service.ts          # moved from resources.service.ts: findForProject, connect (verify+upsert), disconnect
│   ├── notion-connection.module.ts           # exports NotionConnectionService + NotionClient for resources/ to import
│   ├── notion.client.ts                      # moved from resources/ — gains verifyToken() (GET /v1/users/me)
│   └── dto/
│       └── create-notion-connection.dto.ts   # { token: string }
└── resources/
    ├── resources.module.ts                   # now imports NotionConnectionModule
    ├── resources.service.ts                  # createFromNotion() depends on NotionConnectionService instead of owning NotionConnection Prisma access; DTO drops `token`
    ├── dto/create-resource-notion.dto.ts      # { pageUrl: string } — token removed
    └── (document-vulgarization/resource-storage/batch-sweep unchanged)

apps/web/
├── shared/hooks/
│   └── use-notion-connection-status.ts        # new — read-only { connected } query, used by both features below
├── features/notion-connection/                # new feature, mirrors board-connections/
│   ├── api.ts                                 # getNotionConnection, connectNotionConnection, disconnectNotionConnection
│   ├── hooks.ts                                # useNotionConnection, useConnectNotionConnection, useDisconnectNotionConnection
│   └── components/
│       ├── notion-connection-card.tsx          # mirrors board-connection-card.tsx
│       └── connect-notion-dialog.tsx           # mirrors connect-board-dialog.tsx (token field only, no board picker)
├── features/resources/components/add-resource-dialog.tsx
│                                                # Notion tab simplified: reads shared useNotionConnectionStatus;
│                                                # unconfigured -> message + Link to settings, nothing else;
│                                                # configured -> page-URL field + submit (unchanged)
└── app/[locale]/(protected)/projects/[id]/
    ├── page.tsx                                # remove <BoardConnectionCard>; add a Settings link (+ optional
    │                                            # US3 connection-status summary)
    └── settings/page.tsx                       # new route — composes BoardConnectionCard + NotionConnectionCard,
                                                 # contributor-gated (same pattern as the resource detail route)
```

**Structure Decision**: Extracting `notion-connection` as its own backend module (rather than leaving it in `resources`) and `features/notion-connection` as its own frontend feature (rather than folding it into `features/resources`) is what makes Settings composable without violating Constitution III — Settings needs both connections' management UI, and neither `resources` nor a hypothetical `board-connections`-importing-`resources` arrangement would satisfy feature isolation. This exactly mirrors the already-established, working precedent of `board-connections` as its own independent module/feature.

## Complexity Tracking

*No Constitution Check violations — table not needed.*
