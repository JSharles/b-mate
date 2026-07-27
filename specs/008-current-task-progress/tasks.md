# Tasks: Current Task Progress

**Input**: Design documents from `/specs/008-current-task-progress/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included as mandatory — Constitution I requires every changed/new file to ship with tests in the same change; the 80% coverage gate is enforced in CI. `GithubProjectsClient` and `AnthropicVulgarizationClient` are tested by mocking `global.fetch`/the SDK client, exactly as specs/005-007 already establish — no live network or LLM call in any test.

**Organization**: Four user stories. US1 (P1, start date) and US2 (P2, estimate + progress bar) each add real production code. US4 (P2, confidence) is a thin layer on top of US2's AI call — it doesn't introduce a second AI call, only wires an already-computed value (`aiComplexity`) into the response. US3 (P3, board-precedence correctness) adds no new production code of its own, mirroring specs/007's US2 pattern — it adds dedicated tests locking in behavior that US1/US2's implementation already has to satisfy.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3, US4

---

## Phase 1: Setup

- [X] T001 Add `model TaskProgress` (per data-model.md: `detectedStartedAt`, `resolvedStartedAt`, `estimatedCompletionAt`, `estimateSource`, `aiComplexity`, `lastEstimatedTitle`/`lastEstimatedDescription`, unique on `(projectId, githubItemId)`), enums `TaskComplexity` (`simple`/`complex`) and `EstimateSource` (`board`/`ai`), and `BoardConnection.estimateUnit` (new enum `EstimateUnit`: `days`/`hours`, default `days`) to `apps/api/prisma/schema.prisma`; add the inverse `taskProgress TaskProgress[]` relation on `Project`. Run `pnpm --filter api prisma:migrate` to generate the additive migration.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The extended GitHub query, the AI duration/complexity call, and the confidence matrix — all four user stories depend on these existing first.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Extend `itemsQuery` in `apps/api/src/board-connections/github-projects.client.ts` with aliased `fieldValueByName` lookups for `"Start date"`, `"Target date"` (`ProjectV2ItemFieldDateValue`), and `"Estimate"` (`ProjectV2ItemFieldNumberValue`), per data-model.md's GraphQL query change; extend `InProgressItem` with `boardStartDate`/`boardTargetDate`/`boardEstimateValue` (all `string | null` / `number | null`); update `fetchInProgressItems`'s mapping to populate them, treating a fragment that doesn't match (wrong field type) as `null` rather than erroring.
- [X] T003 [P] Create `apps/api/src/task-vulgarization/task-estimate-output.schema.ts`: internal `TaskEstimateOutputSchema` (`{ estimatedDurationDays: z.number().positive(), complexity: z.enum(['simple', 'complex']) }`, per data-model.md) — not exported from `packages/schemas` (never crosses the API boundary).
- [X] T004 Add `estimateTask(input: { projectTitle, taskTitle, taskDescription })` to `apps/api/src/task-vulgarization/anthropic-vulgarization.client.ts`: a new tool-use call (same client/model as `vulgarize()`, research.md Decision 2) with a system prompt asking the model to judge the task's complexity (simple/complex) from its own content and estimate a duration **in days** — explicitly never an absolute date (research.md Decision 3) — validated against `TaskEstimateOutputSchema` (depends on T003).
- [X] T005 [P] Add a `resolveConfidence(source: EstimateSource | null, complexity: TaskComplexity | null): 'high' | 'medium' | 'low' | null` pure function to `apps/api/src/task-vulgarization/task-vulgarization.service.ts`, implementing the fixed matrix from spec.md FR-003a / data-model.md.

### Tests for Foundational

- [X] T006 [P] Add tests in `apps/api/src/board-connections/github-projects.client.spec.ts`: all three new fields present and mapped correctly; each individually absent (field not on the board) maps to `null`; a field present but of the wrong underlying type (e.g. a text field named "Estimate") maps to `null` rather than throwing (depends on T002).
- [X] T007 [P] Add tests in `apps/api/src/task-vulgarization/anthropic-vulgarization.client.spec.ts` for `estimateTask()`: a well-formed response parses into `{ estimatedDurationDays, complexity }`; a malformed/schema-invalid response throws; an SDK-level error (timeout, network) throws (depends on T004).
- [X] T008 [P] Add tests for `resolveConfidence()` covering all four combinations from the matrix (board+simple→high, board+complex→medium, ai+simple→medium, ai+complex→low) plus both null-input cases (`null` source or `null` complexity → `null`) (depends on T005).

**Checkpoint**: Extended GitHub fetch, AI estimate call, and confidence matrix ready — all user stories can now proceed.

---

## Phase 3: User Story 1 - Client sees when work actually started (Priority: P1) 🎯 MVP

**Goal**: A client viewing the Current Task card sees when the currently in-progress task started — the board's own `Start date` field when present, otherwise the moment b-mate first detected the item as in-progress — and that date survives later content edits to the same item.

**Independent Test**: Connect a board, mark an item in-progress with no `Start date` field set, wait for a sweep, confirm the client-facing card shows the sweep's own detection time. Fill in the board's `Start date` field, wait for the next sweep, confirm the card switches to that value. Edit the item's title, wait for the next sweep, confirm the shown start date is unchanged.

### Implementation for User Story 1

- [X] T009 [US1] In `apps/api/src/task-vulgarization/task-vulgarization.service.ts`, extend `processConnection`'s per-item loop with a new step (independent of the existing per-locale `VulgarizedTask` loop, research.md Decision 1): upsert the `TaskProgress` row by `(projectId, githubItemId)` — on first sight, set `detectedStartedAt = now()`; every sweep, set `resolvedStartedAt = item.boardStartDate ?? detectedStartedAt` (depends on T001, T002).
- [X] T010 [US1] In the same method, add `this.prisma.taskProgress.deleteMany({ where: { projectId, githubItemId: { notIn: items.map(i => i.id) } } })` alongside the existing `vulgarizedTask.deleteMany` cleanup (research.md Decision 7) (depends on T009).
- [X] T011 [US1] Extend `getVulgarizedCurrentTask` in `task-vulgarization.service.ts` to also read the matching `TaskProgress` row per item and include `startedAt: resolvedStartedAt.toISOString()` in each returned `CurrentTaskItem` (depends on T009).
- [X] T012 [US1] Extend `CurrentTaskItemSchema` in `packages/schemas/src/current-task.ts` with `startedAt: z.string()`.
- [X] T013 [US1] Update `apps/web/features/current-task/components/current-task-card.tsx`: render the task's start date (relative time via the existing `formatRelativeTime` pattern, or an absolute locale-formatted date — reuse whichever reads more naturally alongside the existing "Updated X ago" line) (depends on T012).

### Tests for User Story 1

- [X] T014 [P] [US1] Add tests in `apps/api/src/task-vulgarization/task-vulgarization.service.spec.ts`: a new item creates a `TaskProgress` row with `detectedStartedAt` ≈ now; when the board provides a `Start date`, `resolvedStartedAt` uses it instead; a content edit (title/description change) on a later sweep does not change `detectedStartedAt`; an item that leaves "in progress" has its `TaskProgress` row deleted (depends on T009, T010).
- [X] T015 [P] [US1] Extend `apps/api/src/current-task/current-task.service.spec.ts` / `task-vulgarization.service.spec.ts` fixtures to assert `startedAt` is present on the returned `CurrentTaskItem` (depends on T011).
- [X] T016 [P] [US1] Extend `apps/web/features/current-task/components/current-task-card.test.tsx` for the new start-date display (depends on T013).

**Checkpoint**: User Story 1 fully functional — every in-progress task shows a start date, never blank, board-provided when available.

---

## Phase 4: User Story 2 - Client sees an estimated completion and a progress indicator (Priority: P2)

**Goal**: A client sees a plain-language estimated completion date and a progress bar, resolved through the three-tier priority (`Target date` → `Estimate` field + connection unit → AI-supplied duration), with distinct states for "no estimate available" and "running longer than estimated."

**Independent Test**: Take a task with a known start date and a board-provided `Target date`; confirm the card shows that date and a progress bar matching elapsed-time-over-duration. Remove the `Target date` but keep a numeric `Estimate`; confirm the date is now start + that number of the connection's configured unit. Remove both; confirm the AI-supplied fallback still produces a date (never blank). Push the estimate into the past; confirm a distinct "running over" state, not a bar capped at 100%.

### Implementation for User Story 2

- [X] T017 [US2] In `task-vulgarization.service.ts`'s `TaskProgress` upsert step (T009), add change detection against `lastEstimatedTitle`/`lastEstimatedDescription` (independent of `VulgarizedTask`'s own per-locale copies, research.md Decision 6): when the item's current title/description differ (or no prior successful call exists), call `estimateTask()`; on success, update `lastEstimatedTitle`/`lastEstimatedDescription`, `aiComplexity`, and remember `resolvedStartedAt + estimatedDurationDays` as the AI-tier candidate estimate; on failure, log and leave those fields untouched (depends on T004, T009).
- [X] T018 [US2] In the same step, resolve `estimatedCompletionAt`/`estimateSource` in priority order: `item.boardTargetDate` (source `board`) → `resolvedStartedAt + item.boardEstimateValue` converted via the connection's `estimateUnit` (source `board`) → the AI-tier candidate from T017 (source `ai`) → `null`/`null` if none available (data-model.md's write-path flow) (depends on T017).
- [X] T019 [US2] Extend `getVulgarizedCurrentTask` to include `estimatedCompletionAt: string | null` in each returned `CurrentTaskItem` (depends on T018).
- [X] T020 [US2] Extend `CurrentTaskItemSchema` with `estimatedCompletionAt: z.string().nullable()`.
- [X] T021 [US2] Update `CurrentTaskCard`: add the estimated-completion display and a progress bar computed client-side from `startedAt` + `estimatedCompletionAt` + the current time (research.md Decision 4 — never a stored percentage); render the distinct "no estimate" state (FR-008, no bar/date at all) when `estimatedCompletionAt` is `null`; render a distinct "running longer than estimated" state (FR-009) when elapsed time exceeds the estimate, instead of a bar silently capped at 100% (depends on T020).
- [X] T022 [US2] Add optional `estimateUnit: z.enum(['days', 'hours']).optional()` to `CreateBoardConnectionRequestSchema` in `packages/schemas/src/board-connection.ts`; thread it through `apps/api/src/board-connections/board-connections.service.ts`'s `create()` (default `"days"` when omitted) and `board-connections.controller.ts`'s request handling.
- [X] T023 [US2] Add an optional unit selector (days/hours) to `apps/web/features/board-connections/components/connect-board-dialog.tsx`; pass it through `apps/web/features/board-connections/api.ts` and `hooks.ts`'s `connect()` call (depends on T022).

### Tests for User Story 2

- [X] T024 [P] [US2] Add tests in `task-vulgarization.service.spec.ts`: `estimateTask()` is called when content changed or no prior success exists, skipped when unchanged; resolution priority picks `Target date` over `Estimate`+unit over the AI candidate; a failed `estimateTask()` call leaves the previous `aiComplexity`/AI-tier estimate untouched, matching specs/007's failure-retry precedent (depends on T017, T018).
- [X] T025 [P] [US2] Extend current-task tests to assert `estimatedCompletionAt` is `null` when no source ever succeeded, and populated otherwise (depends on T019).
- [X] T026 [P] [US2] Extend `current-task-card.test.tsx`: progress bar renders with the expected fill for a known start/estimate pair; the no-estimate state renders when `estimatedCompletionAt` is `null`; the running-over state renders when the estimate is in the past (depends on T021).
- [X] T027 [P] [US2] Add tests in `board-connections.service.spec.ts`/`board-connections.controller.spec.ts` for `estimateUnit` defaulting to `"days"` and being passed through correctly when provided (depends on T022).
- [X] T028 [P] [US2] Add/extend tests for `connect-board-dialog.tsx` covering the new unit selector (depends on T023).

**Checkpoint**: User Stories 1 and 2 both fully functional — start date, estimate, and progress bar all working across all three resolution tiers.

---

## Phase 5: User Story 4 - Client sees how much to trust the estimate (Priority: P2)

**Goal**: Every shown estimate carries a confidence level (high/medium/low), derived from the estimate's source and the AI's own complexity judgment — computed via the matrix already built and tested in Phase 2 (T005/T008).

**Independent Test**: Reproduce each of the four source×complexity combinations (board+simple, board+complex, ai+simple, ai+complex) and confirm the confidence shown matches spec.md FR-003a's matrix in each case; confirm no confidence is ever shown without an accompanying estimate.

### Implementation for User Story 4

- [X] T029 [US4] Verify/adjust T017's change-detection condition so `estimateTask()` (and therefore `aiComplexity`) always runs when content changes, **even when the board already supplies its own `Target date`/`Estimate`** — FR-003a requires the complexity judgment regardless of which tier ultimately provides the shown estimate (depends on T017).
- [X] T030 [US4] In `getVulgarizedCurrentTask`, compute `estimateConfidence` via `resolveConfidence(estimateSource, aiComplexity)` (T005) and include it in each returned `CurrentTaskItem` (depends on T005, T019).
- [X] T031 [US4] Extend `CurrentTaskItemSchema` with `estimateConfidence: z.enum(['high', 'medium', 'low']).nullable()`.
- [X] T032 [US4] Add a confidence badge to `CurrentTaskCard`, rendered only alongside a shown estimate (never on its own, matching FR-003a/SC-005) (depends on T031).

### Tests for User Story 4

- [X] T033 [P] [US4] Add a test in `task-vulgarization.service.spec.ts` confirming `aiComplexity` is populated even when the board provides a `Target date` (i.e. the AI call isn't skipped just because its estimate won't be used) (depends on T029).
- [X] T034 [P] [US4] Extend `current-task-card.test.tsx` for the confidence badge: correct label for each of high/medium/low, absent when `estimatedCompletionAt` is `null` (depends on T032).

**Checkpoint**: All estimates shown to a client now carry an honest confidence signal.

---

## Phase 6: User Story 3 - Board-provided data always takes precedence (Priority: P3)

**Goal**: Lock in, with dedicated tests, that board data always wins over b-mate's own fallback — per field, not all-or-nothing — since this is the constraint most likely to regress silently (mirrors specs/007's US2 pattern: no new production code, just tests that must already pass against US1/US2's implementation).

**Independent Test**: Set a board `Start date`/`Target date` that would produce a visibly different result than b-mate's own fallback calculation; confirm the client-facing values always match the board's numbers.

### Tests for User Story 3

- [X] T035 [US3] Add tests in `task-vulgarization.service.spec.ts`: a board providing only a `Start date` (no `Target date`/`Estimate`) results in a board-sourced `startedAt` and an AI-sourced `estimatedCompletionAt` in the same response — confirming per-field independence (FR-004), not all-or-nothing resolution (depends on T009, T018).
- [X] T036 [US3] Add a test confirming a fallback `detectedStartedAt` switches to the board's `Start date` on the very next sweep once the developer fills that field in (extends T014's coverage with an explicit two-sweep assertion) (depends on T009).
- [X] T037 [US3] Add a test confirming the connection's `estimateUnit` is actually applied: the same numeric `Estimate` value (e.g. `4`) produces a different `estimatedCompletionAt` under a `days` vs. an `hours` connection setting (depends on T018, T022).

**Checkpoint**: All four user stories independently verified; board data provably wins per field whenever present.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T038 [P] Add/update translation keys in `apps/web/messages/en.json` and `fr.json` for: start date display, estimated completion, all three confidence levels, the no-estimate state, the running-over state, and the connect-dialog unit selector.
- [X] T039 [P] Run `pnpm --filter api lint` and `pnpm --filter web lint`; fix any findings.
- [X] T040 [P] Run `pnpm typecheck` (the CI gate added this session); fix any findings.
- [X] T041 [P] Run `pnpm --filter api test:cov` and `pnpm --filter web test:cov`; confirm the 80% coverage gate holds.
- [X] T042 Manually run through `specs/008-current-task-progress/quickstart.md` against a local dev server with a real connected board (the user's own test board already has `Start date`/`Target date`/`Estimate` fields) — confirm all four user stories end-to-end, including the network-tab check that the read path still never calls GitHub or Anthropic directly.

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001 only — no dependencies, can start immediately.
- **Foundational (Phase 2)**: T002/T003/T005 can run in parallel (different files); T004 depends on T003; T006/T007/T008 (tests) depend on their respective implementation task. Blocks all four user stories.
- **User Story 1 (Phase 3)**: T009 → T010 → T011 → T012 → T013 (sequential, same data flow); T014–T016 depend on their respective implementation tasks.
- **User Story 2 (Phase 4)**: T017 → T018 → T019 → T020 → T021 (backend-then-frontend chain, depends on US1's T009); T022 → T023 (board-connection unit setting, independent sub-chain); T024–T028 depend on their respective implementation tasks.
- **User Story 4 (Phase 5)**: T029 (verifies/adjusts US2's T017) → T030 → T031 → T032; T033/T034 depend on their respective tasks. Depends on US2 being in place (reuses its AI call and resolution fields).
- **User Story 3 (Phase 6)**: T035–T037 depend on US1 (T009) and US2 (T018, T022) — no new production code, tests only.
- **Polish (Phase 7)**: after all four user stories.

## Parallel Example: Foundational

```bash
Task: "Extend itemsQuery with Start date/Target date/Estimate lookups in apps/api/src/board-connections/github-projects.client.ts"
Task: "Create TaskEstimateOutputSchema in apps/api/src/task-vulgarization/task-estimate-output.schema.ts"
Task: "Add resolveConfidence() to apps/api/src/task-vulgarization/task-vulgarization.service.ts"
```

## Implementation Strategy

**MVP = User Story 1.** Setup + Foundational (T001–T008) → User Story 1 (T009–T016) already delivers real client-visible value (a start date that was never shown before) without touching the AI estimate path at all. User Stories 2 and 4 (T017–T034) layer the estimate, progress bar, and confidence signal on top — ship together, since US4 only wires an already-computed value into the response rather than standing alone. User Story 3 (T035–T037) adds no new behavior, only the tests that prove US1/US2 already got precedence right; fold it in wherever convenient, ideally right after the story whose precedence it's confirming.
