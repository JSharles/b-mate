# Implementation Plan: Current Task Progress

**Branch**: `feat/current-task-progress` | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-current-task-progress/spec.md`

## Summary

Enrich the client-facing Current Task card with a start date, an estimated completion date, a confidence level for that estimate, and a live progress bar. Data resolves through three tiers, in order: the board's own `Target date` field, the board's `Estimate` field (a number, converted via a per-connection configurable unit), or — when the board provides neither — an AI-supplied duration estimate, produced by a new, locale-independent call alongside a complexity judgment (simple/complex) that feeds a fixed source×complexity confidence matrix. All of this is computed during the existing scheduled sweep (specs/007) and persisted, so the read path stays a pure DB read with zero GitHub or LLM calls, unchanged from specs/007's core guarantee.

## Technical Context

**Language/Version**: TypeScript (strict), NestJS 11 (`apps/api`) + Next.js 16 (`apps/web`) — existing stack, no change.

**Primary Dependencies**: No new dependencies. Reuses `@anthropic-ai/sdk` and `AnthropicVulgarizationClient` (specs/007, new `estimateTask()` method added to the same class) and `GithubProjectsClient` (specs/005/006/007, query extended).

**Storage**: PostgreSQL via Prisma. One new table, `task_progress` (see `data-model.md`), one new column on `board_connections` (`estimate_unit`) — both additive migrations.

**Testing**: Jest (`apps/api`), Vitest (`apps/web`), same 80% coverage gate as the rest of the repo. `estimateTask()` mocked exactly like `vulgarize()` already is (specs/007 precedent) — no live network or LLM call in any test. `resolveConfidence()` (the FR-003a matrix) is a pure function, directly unit-tested with all four input combinations plus both null-input cases.

**Target Platform**: Web (existing app), no new platform.

**Project Type**: Web application. Extends the existing `apps/api/src/task-vulgarization` module (owns the new `TaskProgress` table alongside `VulgarizedTask`) and `apps/api/src/board-connections` module (owns the new `estimateUnit` field, set at connection-creation time). `apps/web/features/current-task`'s existing `CurrentTaskCard` gains new UI for the added fields; `apps/web/features/board-connections`'s connect dialog gains an optional unit selector.

**Performance Goals**: No change to the 5-minute sweep interval (specs/007 Decision 2). The new AI call (`estimateTask()`) is gated by the same content-based change detection as `vulgarize()`, so it runs at most once per item per genuine content change — not on every sweep tick.

**Constraints**: The frontend's read request MUST still never trigger a GitHub fetch or an LLM call (specs/007 FR-003/FR-010 — this feature must not regress that guarantee). The AI is never asked for an absolute date (research.md Decision 3) — only a duration, to avoid date-arithmetic hallucination. The progress percentage and "running over" state are computed live in the frontend from stored dates + the current moment, never persisted (research.md Decision 4).

**Scale/Scope**: One new Prisma model (`TaskProgress`) + two new enums (`TaskComplexity`, `EstimateSource`) + one new enum column on an existing table (`BoardConnection.estimateUnit`), one new internal Zod schema (AI estimate output), extensions to two existing `packages/schemas` schemas (`CurrentTaskItemSchema`, `CreateBoardConnectionRequestSchema`), one new backend client method (`estimateTask()`), one new pure function (`resolveConfidence()`), one extended GraphQL query, and frontend additions to two existing components (`CurrentTaskCard`, the connect-board dialog) — no new pages, no new routes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage**: Applies. `estimateTask()`, the extended `processConnection`/`processItem` sweep logic, `resolveConfidence()`, the extended `GithubProjectsClient` query parsing, and the frontend progress-bar rendering (all four confidence states, the no-estimate state, the running-over state) each get tests — GitHub and Anthropic fully mocked, same discipline as specs/005-007.
- **II. Type Safety**: Applies. The AI's duration/complexity response is validated against a local Zod schema (`task-estimate-output.schema.ts`) before use, mirroring `vulgarization-output.schema.ts` — never threaded through as `any`.
- **III. Feature Isolation**: `TaskProgress` lives in `task-vulgarization`, alongside `VulgarizedTask` — same module already owns this concern. `estimateUnit` lives in `board-connections`, the module that already owns the connection's other GitHub-specific config. `current-task` stays a thin read-only consumer, unchanged in kind from specs/007 — it now also reads `TaskProgress` via `task-vulgarization`'s exported service, not directly.
- **IV. Never Resolve Open Product Decisions Unilaterally**: All three real open questions (fallback estimation approach, GitHub field detection, progress formula) were raised and resolved with the user in chat before this plan (spec.md FR-003/FR-003a, FR-005/FR-005a/FR-005b, FR-011) — including a mid-clarification correction once the user's actual GitHub board screenshot revealed a `Target date` field the original question hadn't accounted for. The specific technical choices in this plan not already pinned by the spec (locale-independent table, duration-not-date, write-time resolution) are implementation decisions within the spec's stated boundaries, not product decisions — recorded as Decisions in research.md with rationale, consistent with how specs/007 handled its own model-choice/schedule-interval decisions.
- **V. Security and Privacy by Default**: No new secrets. The AI already receives task title/description for vulgarization (specs/007's existing privacy note); this feature sends the same content to the same provider for a second, narrower purpose (duration/complexity) — no new category of data leaves the system.
- **VI. Spec Before Multi-Screen/Multi-Endpoint Features**: This is why we're here — spec written, clarified interactively (including a real-board screenshot correcting an initial assumption), and checklist-complete before this plan.

No violations. Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/008-current-task-progress/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/api/prisma/
├── schema.prisma                     # + model TaskProgress, enums TaskComplexity/EstimateSource,
│                                       # + BoardConnection.estimateUnit (enum EstimateUnit)
└── migrations/*_add_task_progress/   # new, additive migration

apps/api/src/task-vulgarization/
├── task-vulgarization.service.ts     # processConnection: + TaskProgress upsert/cleanup per item,
│                                       # resolveConfidence() pure function, resolution priority logic
├── task-vulgarization.service.spec.ts
├── anthropic-vulgarization.client.ts # + estimateTask(input): { estimatedDurationDays, complexity }
├── anthropic-vulgarization.client.spec.ts
└── task-estimate-output.schema.ts    # new: internal-only Zod schema for the AI's estimate response

apps/api/src/board-connections/
├── github-projects.client.ts         # itemsQuery: + aliased Start date/Target date/Estimate lookups;
│                                       # InProgressItem: + boardStartDate/boardTargetDate/boardEstimateValue
├── github-projects.client.spec.ts
├── board-connections.service.ts      # create(): + estimateUnit (default "days")
├── board-connections.service.spec.ts
├── board-connections.controller.ts   # POST body accepts optional estimateUnit
└── board-connections.controller.spec.ts

packages/schemas/src/
├── current-task.ts                   # CurrentTaskItemSchema: + startedAt, estimatedCompletionAt,
│                                       # estimateConfidence
└── board-connection.ts               # CreateBoardConnectionRequestSchema: + estimateUnit (optional)

apps/web/features/current-task/components/
├── current-task-card.tsx             # + start date, estimated completion + confidence badge,
│                                       # progress bar (no-estimate and running-over states)
└── current-task-card.test.tsx

apps/web/features/board-connections/
├── components/connect-board-dialog.tsx  # + optional estimate-unit selector (days/hours)
├── api.ts                               # + estimateUnit passthrough on connect()
└── hooks.ts

apps/web/messages/
├── en.json                           # + CurrentTaskCard keys (startedAt, estimate, confidence
│                                       #   levels, no-estimate, running-over) + connect-dialog keys
└── fr.json
```

**Structure Decision**: Extends the two existing modules that already own the relevant concerns (`task-vulgarization` for progress data, `board-connections` for the unit setting) rather than introducing a new module — this feature has no independent lifecycle of its own; it only makes sense layered on top of specs/005-007's existing GitHub-connection and vulgarization pipeline. No new frontend route or page; `CurrentTaskCard` and the connect-board dialog are extended in place.

## Complexity Tracking

*No violations — table not needed.*
