# Tasks: Show the Real Current Task from a Connected Board

**Input**: Design documents from `/specs/006-current-task-fetch/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included as mandatory — Constitution I requires every changed/new file to ship with tests in the same change; the 80% coverage gate is enforced in CI. `GithubProjectsClient`'s new method is tested by mocking `global.fetch`, exactly as its existing methods already are (`specs/005-github-project-connection`) — no live network call in any test.

**Organization**: A single user story (P1) — there is nothing to make independent from anything else here; Foundational sets up the GitHub client method and shared schema, the story wires the module/endpoint/UI, Polish verifies it end to end.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1

---

## Phase 1: Setup

No new scaffolding needed — extends the existing `board-connections` module and adds one new `apps/api` module (`current-task`) and one new `apps/web` feature (`features/current-task`), following the exact structure already used by `board-connections`. Skipping directly to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The GitHub-fetching capability and the shared response schema — the user story depends on both existing first.

**⚠️ CRITICAL**: The user story cannot be implemented until this phase is complete.

- [X] T001 Add `fetchInProgressItems(token, ownerLogin, ownerType, number): Promise<CurrentTaskItem[]>` to `apps/api/src/board-connections/github-projects.client.ts` (research.md Decisions 1–3): queries `items(first: 100)` for the given owner/number, resolving `content` across `Issue`/`PullRequest`/`DraftIssue` and `fieldValueByName(name: "Status")`; maps to `{ title, description, url }`, filtering to items whose Status value (lowercased) contains `"in progress"`.
- [X] T002 [P] Add `exports: [GithubProjectsClient]` to `apps/api/src/board-connections/board-connections.module.ts` (depends on nothing, but needed before T005).
- [X] T003 [P] Create `packages/schemas/src/current-task.ts` with `CurrentTaskItemSchema` (per `data-model.md`); export it from `packages/schemas/src/index.ts`.

### Tests for Foundational

- [X] T004 [P] Add tests in `apps/api/src/board-connections/github-projects.client.spec.ts` for `fetchInProgressItems`: matches an item whose Status value contains "in progress" (case-insensitive); excludes items whose Status is something else or missing; includes both `Issue`/`PullRequest` (with `url`) and `DraftIssue` (without `url`) content; returns an empty list when the board has no items (depends on T001).

**Checkpoint**: GitHub-fetching capability and shared schema ready — the user story can now proceed.

---

## Phase 3: User Story 1 - Client sees the real current task (Priority: P1) 🎯 MVP

**Goal**: A client on a project with a connected, "In Progress"-tagged board item sees its real title/description in the "Current task" cartouche; every other case (no board, no match, broken connection) shows a clean empty state; a contributor's own view is unaffected.

**Independent Test**: As a client-role member, open a project whose board has an item with Status "In Progress"; confirm the real title/description render. Change the board's in-progress item and reload; confirm it updates. Break the connection or leave nothing in progress; confirm a clean empty state, never an error.

### Implementation for User Story 1

- [X] T005 [US1] Create `apps/api/src/current-task/current-task.module.ts` (imports `AuthModule`, `BoardConnectionsModule`; registers the controller and service); register it in `apps/api/src/app.module.ts` (depends on T002).
- [X] T006 [US1] Implement `apps/api/src/current-task/current-task.service.ts`: a private `assertIsMember(userId, projectId)` (own copy per Constitution III, same `NotFoundException`-for-non-member pattern as `ProjectsService`/`BoardConnectionsService`); `getCurrentTask(userId, projectId)` — after the membership check, reads the project's `BoardConnection` via `PrismaService` directly, and if one exists, decrypts its token (`token-encryption.ts`) and calls `githubClient.fetchInProgressItems(...)`; returns `[]` (never throws) whenever there's no connection, or the GitHub call fails for any reason (research.md Decision 4, FR-005) (depends on T001, T003, T005).
- [X] T007 [US1] Implement `apps/api/src/current-task/current-task.controller.ts`: `GET /projects/:projectId/current-task`, `@UseGuards(SessionGuard)`, delegating to the service (depends on T006).
- [X] T008 [US1] Create `apps/web/features/current-task/api.ts` (`getCurrentTask(projectId)`) and `hooks.ts` (`useCurrentTask(projectId)`) (depends on T003).
- [X] T009 [US1] Create `apps/web/features/current-task/components/current-task-card.tsx`: reads `useCurrentTask`, shows each item's title/description (and a GitHub link when `url` is present) when the list is non-empty, a "nothing in progress" message when empty or pending resolves to nothing, a loading skeleton while pending (mirrors `board-connection-card.tsx`'s structure) (depends on T008).
- [X] T010 [US1] In `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`, replace the "Current task" `ComingSoonCard` with `CurrentTaskCard` in the client (`!isContributor`) branch; remove the now-unused `currentTask`/`currentTaskComingSoon` translation keys if nothing else references them (depends on T009).

### Tests for User Story 1

- [X] T011 [P] [US1] Add tests in `apps/api/src/current-task/current-task.service.spec.ts`: returns the client's mapped items when a connection exists and the GitHub call succeeds; returns `[]` when no `BoardConnection` row exists for the project; returns `[]` (not a thrown error) when the GitHub client call rejects; throws `NotFoundException` for a non-member of the project (depends on T006).
- [X] T012 [P] [US1] Add tests in `apps/api/src/current-task/current-task.controller.spec.ts`: the route delegates to the service with the current user and project id (depends on T007).
- [X] T013 [P] [US1] Add tests in `apps/web/features/current-task/api.test.ts` and `hooks.test.tsx` (mirroring `board-connections`' own `api.test.ts`/`hooks.test.tsx` patterns) (depends on T008).
- [X] T014 [P] [US1] Add tests in `apps/web/features/current-task/components/current-task-card.test.tsx`: shows item title/description/link when present; shows the empty state when the list is empty; shows a skeleton while pending (depends on T009).
- [X] T015 [P] [US1] Extend `apps/web/app/[locale]/(protected)/projects/[id]/page.test.tsx`: a client-role member sees `CurrentTaskCard` where the old placeholder was; a contributor's cartouches (Board, Documentation, Settings-area) are unaffected by this feature (depends on T010).

**Checkpoint**: User Story 1 fully functional and independently testable — this is the whole feature.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T016 [P] Run `pnpm --filter web lint` and `pnpm --filter api lint`; fix any findings.
- [X] T017 [P] Run `pnpm --filter web test:cov` and `pnpm --filter api test:cov`; confirm the 80% coverage gate holds.
- [X] T018 Manually run through every scenario in `specs/006-current-task-fetch/quickstart.md` against a local dev server, using a real connected board (per `specs/005-github-project-connection`) with a real "In Progress" item, including changing which item is in progress and confirming the client's view updates on reload.
- [X] T019 Confirm the regression checks in `quickstart.md` — a contributor's own project page is unaffected, a client on a project with no board connected sees the clean empty state (not the old placeholder), and a broken connection also collapses to the same clean empty state.

---

## Dependencies & Execution Order

- **Setup**: none — skipped.
- **Foundational (Phase 2)**: T001 → T004 (tests depend on the implementation); T002, T003 can run in parallel with T001 and with each other (different files). Blocks the user story.
- **User Story 1 (Phase 3)**: T005 → T006 → T007 (API, sequential — same module); T008 → T009 → T010 (web, sequential, depends on T003 for the schema); the two tracks are independent of each other until T010 needs T007's endpoint live. T011–T015 depend on their respective implementation tasks.
- **Polish (Phase 4)**: after the user story.

## Implementation Strategy

**Single story, ship whole**: Foundational (T001–T004) → User Story 1 (T005–T015) → Polish (T016–T019). There is no meaningful smaller MVP slice within this feature — the story only has value once the endpoint and the card both exist.
