# Implementation Plan: Show the Real Current Task from a Connected Board

**Branch**: `feat/github-task-fetch` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-current-task-fetch/spec.md`

## Summary

For a project whose board is connected (`specs/005-github-project-connection`), fetch the item(s) currently in the "In Progress"-like state of GitHub's default "Status" field, and show their real title/description to client-role project members in the existing "Current task" cartouche — replacing its static placeholder. Detection is convention-based (no developer configuration): look up the item's `Status` field value by exact name, and match its selected option's name case-insensitively containing "in progress." No content is fetched, stored, or written beyond that; everything else (roadmap, other placeholders, developer's own view) is untouched.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 (`apps/web`), NestJS 11 (`apps/api`) — existing stack, no change.

**Primary Dependencies**: Existing stack only. Reuses `GithubProjectsClient` (`apps/api/src/board-connections/github-projects.client.ts`) with one new method, and `decryptToken` (`token-encryption.ts`) to recover the stored PAT — no new dependency.

**Storage**: No schema change. Reads the existing `BoardConnection` row (`specs/005-github-project-connection`) for its encrypted token and board identity; nothing new is persisted (spec.md Key Entities: "no new persisted entity").

**Testing**: Vitest + RTL (`apps/web`), Jest (`apps/api`) — same as the rest of the repo; 80% coverage gate applies. The GitHub GraphQL call for fetching items is added to the existing, already-mockable `GithubProjectsClient`.

**Target Platform**: Web (existing app), no new platform.

**Project Type**: Web application — new `apps/api/src/current-task` module (its own controller/service; imports `BoardConnectionsModule` to reuse its exported `GithubProjectsClient`, per Constitution III — this is importing another module's exported provider, not reaching into its internals). New `apps/web/features/current-task` feature, composed into the project page in place of the current-task `ComingSoonCard`.

**Performance Goals**: N/A — one on-demand GraphQL call per client page view (spec.md Assumptions: "fetch happens live... not a background schedule"), not a hot path.

**Constraints**: Read-only — MUST NOT write to GitHub (FR-006). Visibility limited to client-role project members (FR-007); a contributor's own project page view is unaffected. Any failure (no board, no Status field, no match, expired token, GitHub outage) MUST collapse to the same "nothing in progress" empty state (FR-005) — never a distinct error shown to the client.

**Scale/Scope**: One new backend module (controller, service, one new `GithubProjectsClient` method), one new frontend feature, one existing placeholder card replaced. No schema migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage**: Applies. New module (controller, service) and the new `GithubProjectsClient` method need tests in the same change; GitHub calls are mocked exactly as `specs/005` already established (no live network call in any test).
- **II. Type Safety**: Applies. New Zod schema in `packages/schemas` for the current-task response; GitHub's GraphQL response for items is a third-party boundary, narrowed to an explicit local type at the client (same pattern as `listAccessibleBoards`), not threaded through the app as `any`.
- **III. Feature Isolation**: New `apps/api/src/current-task` module — imports `BoardConnectionsModule` for its exported `GithubProjectsClient` (a normal Nest module dependency), but reads `BoardConnection` rows directly via the shared `PrismaService` rather than calling into `BoardConnectionsService`'s methods — matching how `ProjectsService`/`InvitationsService` each already keep their own copy of membership checks instead of reaching into each other. New `apps/web/features/current-task` — does not import from `features/board-connections` or `features/projects`; the project page composes it.
- **IV. Never Resolve Open Product Decisions Unilaterally**: The one real open question (how to detect "in progress" without a standardized status field) was raised and resolved with the user during specification — convention-based detection on GitHub's default "Status" field/"In Progress" value, no manual mapping UI. Nothing else discovered during planning warrants a further pause.
- **V. Security and Privacy by Default**: This feature reads using the same encrypted PAT already governed by `specs/005-github-project-connection`'s security model — no new credential, no new storage of secrets. Visibility is enforced at the API level (membership check), not just hidden in the UI, consistent with prior features in this repo. No new write capability is introduced (FR-006).
- **VI. Spec Before Multi-Screen/Multi-Endpoint Features**: This is why we're here — spec already written, clarified with the user, and checklist-complete before this plan.

No violations. Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/006-current-task-fetch/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/api/src/board-connections/
├── github-projects.client.ts       # + fetchInProgressItems(token, ownerLogin, ownerType, number)
│                                     # queries the project's items, matches Status/"in progress"
├── github-projects.client.spec.ts  # + tests for the new method
└── board-connections.module.ts     # + exports: [GithubProjectsClient]

apps/api/src/current-task/           # new module
├── current-task.module.ts           # imports BoardConnectionsModule, AuthModule
├── current-task.controller.ts       # GET /projects/:projectId/current-task
├── current-task.controller.spec.ts
├── current-task.service.ts          # assertIsMember (own copy); reads BoardConnection via
│                                      # Prisma directly; decrypts token; calls
│                                      # githubClient.fetchInProgressItems(...); returns [] on
│                                      # any failure/absence (FR-005) rather than throwing
└── current-task.service.spec.ts

packages/schemas/src/
└── current-task.ts                  # CurrentTaskItemSchema: { title, description, url }

apps/web/features/current-task/
├── api.ts                            # getCurrentTask(projectId)
├── hooks.ts                          # useCurrentTask(projectId)
└── components/
    ├── current-task-card.tsx         # replaces the "Current task" ComingSoonCard for clients
    └── current-task-card.test.tsx

apps/web/app/[locale]/(protected)/projects/[id]/page.tsx
                                       # swap the "Current task" ComingSoonCard for
                                       # CurrentTaskCard in the client (!isContributor) branch
```

**Structure Decision**: New `apps/api/src/current-task` module reusing `BoardConnectionsModule`'s exported `GithubProjectsClient`; new `apps/web/features/current-task` feature, composed into the existing project page in place of one placeholder. No new app, no schema change.

## Complexity Tracking

*No violations — table not needed.*
