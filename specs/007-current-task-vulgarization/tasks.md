# Tasks: Vulgarize the Current Task with AI

**Input**: Design documents from `/specs/007-current-task-vulgarization/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included as mandatory — Constitution I requires every changed/new file to ship with tests in the same change; the 80% coverage gate is enforced in CI. `GithubProjectsClient` and the new Anthropic client are tested by mocking `global.fetch`/the SDK client, exactly as `specs/005`/`006` already establish — no live network or LLM call in any test.

**Organization**: Two user stories (P1, P2) share the same underlying write-path logic (`TaskVulgarizationService`'s sweep) — a correct US1 implementation already has to satisfy the change-detection requirements (FR-004/005) that US2's acceptance scenario exercises. US2 therefore adds no new production code of its own; it adds a distinct, explicit test locking in "an edit on GitHub replaces the previous vulgarized version," which US1's own tests don't already assert.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2

---

## Phase 1: Setup

- [X] T001 Install `@nestjs/schedule` and `@anthropic-ai/sdk` for `apps/api` (`pnpm --filter api add @nestjs/schedule @anthropic-ai/sdk`).
- [X] T002 [P] Add `ANTHROPIC_API_KEY` to `apps/api/.env.example` and `apps/api/.env` (local key).
- [X] T003 Add `model VulgarizedTask` to `apps/api/prisma/schema.prisma` (per `data-model.md`: `projectId`/`githubItemId`/`locale` unique, `original*`/`vulgarized*` fields, cascade delete) and the inverse `vulgarizedTasks VulgarizedTask[]` relation on `Project`; run `pnpm --filter api prisma:migrate` to generate the additive migration.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The GitHub item-identity field, the internal output schema, and the LLM client wrapper — both user stories depend on all three existing first.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Add `id` to the `items.nodes` selection in `GithubProjectsClient.fetchInProgressItems`'s GraphQL query (`apps/api/src/board-connections/github-projects.client.ts`); extend its return type with this `id` (internal use only — `research.md` Decision 3; `packages/schemas`'s public `CurrentTaskItemSchema` is unchanged).
- [X] T005 [P] Create `apps/api/src/task-vulgarization/vulgarization-output.schema.ts`: internal `VulgarizationOutputSchema` (`{ title: string, description: string | null }`, per `data-model.md`) — not exported from `packages/schemas` (never crosses the API boundary).
- [X] T006 [P] Create `apps/api/src/task-vulgarization/anthropic-vulgarization.client.ts`: wraps `@anthropic-ai/sdk`, calls `claude-haiku-4-5` (research.md Decision 1) with a system prompt encoding the vulgarization rules (plain language, never invent, comparable-or-shorter length), forces structured output via tool-use matching `VulgarizationOutputSchema`, validates the response and throws on anything that doesn't parse (depends on T005).

### Tests for Foundational

- [X] T007 [P] Add tests in `apps/api/src/board-connections/github-projects.client.spec.ts` covering the new `id` field on returned items (depends on T004).
- [X] T008 [P] Add tests in `apps/api/src/task-vulgarization/anthropic-vulgarization.client.spec.ts`: a well-formed tool-use response is parsed into `{ title, description }`; a malformed/schema-invalid response throws; an SDK-level error (timeout, network) throws (depends on T006).

**Checkpoint**: Item identity, internal schema, and LLM client ready — both user stories can now proceed.

---

## Phase 3: User Story 1 - Client sees a plain-language current task (Priority: P1) 🎯 MVP

**Goal**: A client on a project with a connected board sees the in-progress item's title/description rewritten in plain language, in their own locale — sourced only from persisted data, never a live GitHub or LLM call in the request path.

**Independent Test**: As a client-role member of a project with a connected board and an in-progress item, open the project page in `/fr/...` and in `/en/...`; confirm a plain-language version renders in each, matching the locale. Confirm (e.g. via the network tab) that no request to GitHub or Anthropic is ever made by the frontend.

### Implementation for User Story 1

- [X] T009 [US1] Create `apps/api/src/task-vulgarization/task-vulgarization.module.ts`: imports `BoardConnectionsModule` (for the exported `GithubProjectsClient`) and `ScheduleModule.forRoot()`; registers `TaskVulgarizationService`; exports `TaskVulgarizationService` (depends on T004, T006).
- [X] T010 [US1] Implement `apps/api/src/task-vulgarization/task-vulgarization.service.ts`:
  - `@Cron(CronExpression.EVERY_5_MINUTES)` sweep method — reads all `BoardConnection` rows directly via `PrismaService` (own copy, Constitution III), and for each: decrypts the token, calls `fetchInProgressItems`, and for every returned item and each locale (`en`, `fr`) looks up the existing `VulgarizedTask` row by `(projectId, githubItemId, locale)`.
  - Skips the Anthropic call when the fetched `(title, description)` matches the row's `original*` fields (FR-004).
  - Calls `AnthropicVulgarizationClient` and upserts `original*`/`vulgarized*` together, atomically, on success; leaves the row untouched on any failure (research.md Decision 4, FR-007) — logs and continues rather than aborting the sweep for other connections/items/locales.
  - Exported `getVulgarizedCurrentTask(projectId, locale): Promise<CurrentTaskItem[]>` — reads rows for `(projectId, locale)` where `vulgarizedTitle IS NOT NULL`, maps to `{ title: vulgarizedTitle, description: vulgarizedDescription, url }` (`url` passed through from the original fetch, unvulgarized).
  (depends on T003, T004, T006, T009)
- [X] T011 [US1] Register `TaskVulgarizationModule` in `apps/api/src/app.module.ts` (depends on T009).
- [X] T012 [US1] Simplify `apps/api/src/current-task/current-task.module.ts`: import `TaskVulgarizationModule` instead of `BoardConnectionsModule` (depends on T011).
- [X] T013 [US1] Simplify `apps/api/src/current-task/current-task.service.ts`: remove all `GithubProjectsClient`/`BoardConnection`/token-decryption logic; `getCurrentTask(userId, projectId, locale)` keeps its existing `assertIsMember` and now only delegates to `taskVulgarizationService.getVulgarizedCurrentTask(projectId, locale)` (depends on T010, T012).
- [X] T014 [US1] Update `apps/api/src/current-task/current-task.controller.ts`: accept an optional `locale` query parameter, validate against `["en", "fr"]`, default to `"fr"` if missing/invalid (`research.md` Decision 5), pass through to the service (depends on T013).
- [X] T015 [US1] Update `apps/web/features/current-task/api.ts`: `getCurrentTask(projectId, locale)` appends `?locale=` to the request (depends on nothing new — `CurrentTaskItemSchema` is unchanged).
- [X] T016 [US1] Update `apps/web/features/current-task/hooks.ts`: `useCurrentTask` reads the active locale via next-intl's `useLocale()`, includes it in the query key, and passes it to `getCurrentTask` (depends on T015).

### Tests for User Story 1

- [X] T017 [P] [US1] Add tests in `apps/api/src/task-vulgarization/task-vulgarization.service.spec.ts`: the sweep calls the Anthropic client once per locale for a new item; skips the Anthropic call when fetched content matches the stored original (FR-004); on an Anthropic failure, the row is left untouched and `getVulgarizedCurrentTask` still returns the previous version (FR-007); `getVulgarizedCurrentTask` returns `[]` when no row has ever succeeded for that `(projectId, locale)` (depends on T010).
- [X] T018 [P] [US1] Add tests in `apps/api/src/current-task/current-task.service.spec.ts`: delegates to `taskVulgarizationService.getVulgarizedCurrentTask` with the right `(projectId, locale)`; still throws `NotFoundException` for a non-member (depends on T013).
- [X] T019 [P] [US1] Add tests in `apps/api/src/current-task/current-task.controller.spec.ts`: the `locale` query param is parsed and defaulted correctly (depends on T014).
- [X] T020 [P] [US1] Add/extend tests in `apps/web/features/current-task/api.test.ts` and `hooks.test.tsx`: the current locale is included in the request URL and the query key (depends on T015, T016).

**Checkpoint**: User Story 1 fully functional — client sees vulgarized, locale-matched content; the frontend's request path never reaches GitHub or Anthropic.

---

## Phase 4: User Story 2 - Vulgarized content stays in sync with GitHub edits (Priority: P2)

**Goal**: Confirm, with a dedicated test, that an edit to an in-progress item's GitHub content is reflected in the client-facing plain-language version after the next sweep — not silently frozen on the old wording.

**Independent Test**: With an item already vulgarized once, edit its description on GitHub; after the next sweep runs, confirm the stored `vulgarizedTitle`/`vulgarizedDescription` reflect the new content, replacing (not duplicating) the previous version.

### Tests for User Story 2

- [X] T021 [US2] Add a test in `apps/api/src/task-vulgarization/task-vulgarization.service.spec.ts`: given a `VulgarizedTask` row already stored from a prior sweep, when the next sweep fetches changed content for that same `(projectId, githubItemId)`, assert the row's `original*` and `vulgarized*` fields are replaced with the new values (not a second row inserted), and exactly one new Anthropic call is made per locale — distinct from T017's "skip when unchanged" assertion (depends on T010, T017).

**Checkpoint**: Both user stories independently verified — US1 (correct content, right locale, never in the request path) and US2 (stays in sync on edit).

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Run `pnpm --filter api lint` and `pnpm --filter web lint`; fix any findings.
- [ ] T023 [P] Run `pnpm --filter api test:cov` and `pnpm --filter web test:cov`; confirm the 80% coverage gate holds.
- [ ] T024 Manually run through `specs/007-current-task-vulgarization/quickstart.md` against a local dev server, using a real connected board and a real `ANTHROPIC_API_KEY`: confirm vulgarized content in both `en`/`fr`, confirm an edit on GitHub is reflected after the next sweep, and — the most important check — confirm via the browser's network tab that no frontend request ever calls GitHub or Anthropic directly (FR-003/FR-010).
- [ ] T025 Confirm the failure-fallback regression check in `quickstart.md`: with a temporarily invalid `ANTHROPIC_API_KEY`, force a content change on GitHub; confirm the client still sees the *previous* vulgarized version (FR-007) — not raw GitHub text, not an empty state. Restore the key, confirm the next sweep updates it.

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001–T003, no dependencies between them beyond T003 needing the Prisma client available — can start immediately.
- **Foundational (Phase 2)**: T004–T006 can run in parallel (different files); T007/T008 (tests) depend on their respective implementation task. Blocks both user stories.
- **User Story 1 (Phase 3)**: T009 → T010 → T011 → T012 → T013 → T014 (backend, sequential — same module chain); T015 → T016 (frontend, sequential, independent of the backend chain until the endpoint is live). T017–T020 depend on their respective implementation tasks.
- **User Story 2 (Phase 4)**: T021 depends on T010 and conceptually on T017 (extends the same test file) — no new production code.
- **Polish (Phase 5)**: after both user stories.

## Parallel Example: Foundational

```bash
Task: "Add id to fetchInProgressItems's GraphQL query in apps/api/src/board-connections/github-projects.client.ts"
Task: "Create VulgarizationOutputSchema in apps/api/src/task-vulgarization/vulgarization-output.schema.ts"
```

## Implementation Strategy

**MVP = User Story 1.** Setup + Foundational (T001–T008) → User Story 1 (T009–T020) is the entire deliverable a client actually notices — vulgarized content, in the right locale, never live-fetched on request. User Story 2 (T021) adds one confirming test on top of the same code, not a separate increment; ship both together rather than treating US2 as a later phase.
