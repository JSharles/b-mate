# Implementation Plan: Vulgarize the Current Task with AI

**Branch**: `feat/current-task-ai-vulgarization` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-current-task-vulgarization/spec.md`

## Summary

Split the current-task feature into a write path and a read path. A new backend-scheduled job (write path) periodically fetches in-progress items from each project's connected GitHub board (reusing `specs/006-current-task-fetch`'s detection), compares them against the last-stored original content, and — only when changed — calls an LLM to rewrite title/description in plain language, in each of the app's supported locales (`en`, `fr`), persisting both the original and the vulgarized text. The existing `GET /projects/:projectId/current-task` endpoint (read path) is simplified to only read this persisted, already-vulgarized content — it no longer talks to GitHub or an LLM at all.

## Technical Context

**Language/Version**: TypeScript (strict), NestJS 11 (`apps/api`) — existing stack, no change.

**Primary Dependencies**: `@nestjs/schedule` (new — cron trigger, FR-010) and `@anthropic-ai/sdk` (new — vulgarization calls). Reuses `GithubProjectsClient` (`apps/api/src/board-connections/github-projects.client.ts`, already exported by `BoardConnectionsModule`) and `decryptToken` (`token-encryption.ts`) — no change to either.

**Storage**: PostgreSQL via Prisma. One new table, `vulgarized_tasks` (see `data-model.md`) — additive migration, no change to existing tables.

**Testing**: Jest (`apps/api`), same as the rest of the repo; 80% coverage gate applies. The Anthropic call is wrapped in its own client class, mocked in tests exactly like `GithubProjectsClient` already is (`specs/005`/`specs/006` precedent) — no live network or LLM call in any test.

**Target Platform**: Web (existing app), no new platform.

**Project Type**: Web application. New `apps/api/src/task-vulgarization` module (owns the scheduled job, the GitHub fetch, the LLM call, and the new `VulgarizedTask` table). `apps/api/src/current-task` is simplified to a thin read-only consumer of `task-vulgarization`'s exported service. `packages/schemas`'s `CurrentTaskItemSchema` is unchanged (still `{ title, description, url }`) — the frontend contract does not change shape, only where the data comes from.

**Performance Goals**: The scheduled sweep runs every 5 minutes (research.md Decision 1) — bounded, predictable GitHub API and LLM usage regardless of how many clients have the page open, satisfying FR-010/FR-003. Vulgarization (the only paid/slow step) only runs when content actually changed (FR-004/005), not on every sweep.

**Constraints**: The frontend's read request MUST NOT ever trigger a GitHub fetch or an LLM call (FR-003, FR-010) — the read path is a plain, fast DB read. Vulgarization MUST NOT fabricate content beyond the source title/description (FR-002, `docs/PRODUCT.md` Product Principles). A failed vulgarization MUST NOT lose the last successfully vulgarized version (FR-007) — the write path only overwrites `vulgarizedTitle`/`vulgarizedDescription` together with `originalTitle`/`originalDescription`, atomically, on success; a failed attempt touches neither, so the next sweep retries against the same unchanged baseline rather than silently giving up.

**Scale/Scope**: One new Prisma model + migration, one new backend module (`task-vulgarization`), one simplified existing module (`current-task`), one new internal (non-shared) Zod schema for the LLM's structured output, minor frontend changes (pass the current locale on the existing request). No new frontend feature, no UI change (spec FR-009: no UI to see the original or force re-vulgarization).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage**: Applies. `task-vulgarization`'s cron handler, GitHub-fetch/compare logic, and Anthropic client wrapper each get tests with GitHub and Anthropic fully mocked — same discipline as `specs/005`/`006`. The `@Cron(...)` decorator wiring itself is framework glue (tested by calling the handler method directly, not by asserting the schedule fires).
- **II. Type Safety**: Applies. The Anthropic response is validated against a local Zod schema (`{ title, description }`) at the point it enters our code — never threaded through as `any`. This schema is internal to `task-vulgarization` (never crosses the API boundary to the frontend), so it does not belong in `packages/schemas`.
- **III. Feature Isolation**: `task-vulgarization` owns the new `VulgarizedTask` table exclusively — `current-task`'s service calls `task-vulgarization`'s exported read method rather than querying that table via Prisma directly, the same shape `current-task` itself exposed to nothing else in `specs/006`. `task-vulgarization` imports `BoardConnectionsModule` only for its exported `GithubProjectsClient`, and reads `BoardConnection` rows directly via Prisma (own copy, per the `specs/006` precedent) rather than through `BoardConnectionsService`.
- **IV. Never Resolve Open Product Decisions Unilaterally**: The three real open questions from spec/discussion — target locale(s), failure-fallback behavior, and the trigger mechanism — were each raised and resolved with the user before this plan (spec.md FR-006/007/010). The specific model (Claude Haiku 4.5) was proposed and discussed with the user in chat; research.md records it as a Decision, explicitly flagged as easy to swap (one constructor argument) if evaluation shows it's insufficient — not a hard lock-in.
- **V. Security and Privacy by Default**: A new secret, `ANTHROPIC_API_KEY`, follows the same env-only pattern as `BOARD_CONNECTION_ENCRYPTION_KEY` — never logged, never committed. New privacy-relevant fact worth being explicit about: task titles/descriptions are sent to a third-party AI provider (Anthropic) as part of vulgarization — analogous in kind to the existing GitHub PAT already granting third-party access to the same content, but a distinct data flow worth naming plainly rather than leaving implicit.
- **VI. Spec Before Multi-Screen/Multi-Endpoint Features**: This is why we're here — spec written, clarified, and checklist-complete before this plan.

No violations. Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/007-current-task-vulgarization/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/api/prisma/
├── schema.prisma                        # + model VulgarizedTask
└── migrations/*_add_vulgarized_tasks/    # new, additive migration

apps/api/src/task-vulgarization/          # new module
├── task-vulgarization.module.ts          # imports BoardConnectionsModule (for GithubProjectsClient),
│                                           # ScheduleModule; exports TaskVulgarizationService
├── task-vulgarization.service.ts         # @Cron sweep: for each BoardConnection, fetch in-progress
│                                           # items, diff against stored VulgarizedTask rows, call
│                                           # AnthropicVulgarizationClient per locale when changed,
│                                           # upsert on success, leave untouched on failure.
│                                           # Also exports getVulgarizedCurrentTask(projectId, locale)
│                                           # — the read method current-task calls.
├── task-vulgarization.service.spec.ts
├── anthropic-vulgarization.client.ts      # wraps @anthropic-ai/sdk; forces structured JSON output;
│                                           # validates against a local Zod schema; throws on
│                                           # anything that doesn't validate
├── anthropic-vulgarization.client.spec.ts
└── vulgarization-output.schema.ts        # internal-only Zod schema: { title, description }

apps/api/src/current-task/                # simplified — no more GithubProjectsClient dependency
├── current-task.module.ts                # imports TaskVulgarizationModule (instead of BoardConnectionsModule)
├── current-task.controller.ts            # GET /projects/:projectId/current-task?locale=en|fr
├── current-task.controller.spec.ts
├── current-task.service.ts               # assertIsMember (unchanged) + calls
│                                           # taskVulgarizationService.getVulgarizedCurrentTask(...)
└── current-task.service.spec.ts

apps/api/.env.example                     # + ANTHROPIC_API_KEY

apps/web/features/current-task/
├── api.ts                                # getCurrentTask(projectId, locale) — adds ?locale=
├── hooks.ts                              # useCurrentTask reads useLocale() from next-intl,
│                                           # includes it in the query key and the request
└── (no component change — CurrentTaskItemSchema shape is unchanged)
```

**Structure Decision**: New `apps/api/src/task-vulgarization` module owns the write path (cron, GitHub fetch, LLM call, persistence) and the new table exclusively. `apps/api/src/current-task` keeps its controller/route but becomes a thin read-only consumer of `task-vulgarization`'s exported service — no more direct GitHub or Prisma-`BoardConnection` access from `current-task`. No new frontend feature or component; the existing `CurrentTaskCard` is unaffected beyond the hook now sending the viewer's locale.

## Complexity Tracking

*No violations — table not needed.*
