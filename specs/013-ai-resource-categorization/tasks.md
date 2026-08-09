# Tasks: AI Resource Categorization

**Input**: Design documents from `/specs/013-ai-resource-categorization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/resource-categories.md, quickstart.md

**Tests**: Not explicitly requested in the feature spec, but required by this repo's Constitution I (test-first coverage discipline, 80% gate) — every implementation task below ships its tests in the same task, not as a separate later pass.

**Organization**: Tasks are grouped by user story (spec.md priorities). No separate "Setup" phase — this feature adds no new dependency, service, or app; it extends the existing `apps/api/src/resources/` module and `apps/web/features/resources/` feature in place.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on another unfinished task in this list)
- **[Story]**: US1 or US2 (maps to spec.md's two user stories)
- Tasks with neither a [P] nor a listed dependency below are safe to parallelize with sibling tasks in the same phase

---

## Phase 1: Foundational (Data Model — blocks both user stories)

**Purpose**: The two new Prisma models and their shared TypeScript types are needed by both stories; nothing else can start until these exist.

- [X] T001 [P] Add `ResourceCategory` and `ResourceCategoryAssignment` models plus the `ResourceCategoryAssignmentStatus` enum to `apps/api/prisma/schema.prisma`, with `Project`/`Resource` inverse relations and the `@@unique` constraints from data-model.md (`[projectId, key]` and `[resourceId, categoryId]`)
- [X] T002 Create and apply the Prisma migration for T001 (`pnpm --filter api prisma:migrate`), then regenerate the client (`pnpm --filter api prisma:generate`) — depends on T001
- [X] T003 [P] Add a `ResourceCategorySchema` and extend `ResourceSchema` with a `categories` array (data-model.md "Extended read shape": `id`, `categoryId`, `key`, `label`, `status`) in `packages/schemas/src/resource.ts`

**Checkpoint**: schema + shared types exist. Both user stories can now be implemented.

---

## Phase 2: User Story 1 - AI proposes categories, developer approves each individually (Priority: P1) 🎯 MVP

**Goal**: A contributor adds a resource; the same AI pass that already produces vulgarized content also proposes one or more categories (reusing the project's existing ones where they match); the contributor sees and approves/rejects each proposed category independently, without affecting the resource's own publish flow.

**Independent Test**: Add a resource whose content spans more than one type of information; once processed, confirm multiple proposed categories appear; approve one and reject another; confirm each transition is independent and neither blocks `publish()`.

### Backend

- [X] T004 [US1] Add a category sub-schema (`key: string`, `labelEn: string`, `labelFr: string`) to `apps/api/src/resources/document-vulgarization-output.schema.ts` (or a new sibling schema file in the same directory), with tests in its `.spec.ts`
- [X] T005 [US1] Extend `DocumentVulgarizationClient` (`apps/api/src/resources/document-vulgarization.client.ts`): `submitBatch` takes the project's existing categories (`{ key, labelEn }[]`) and submits a third, locale-agnostic batch request that proposes categories, reusing an existing key when it matches (research.md Decisions 1-2); `pollBatch` parses and returns proposed categories alongside the existing per-locale vulgarizations. Update `document-vulgarization.client.spec.ts` — depends on T004
- [X] T006 [US1] In `ResourcesService.createFromUpload`/`createFromNotion` (`apps/api/src/resources/resources.service.ts`), fetch the project's existing `ResourceCategory` rows before submitting and pass them into `submitBatch`. Update `resources.service.spec.ts` — depends on T001, T005
- [X] T007 [US1] In `ResourceBatchSweepService.processResource` (`apps/api/src/resources/resource-batch-sweep.service.ts`), on a succeeded poll, upsert `ResourceCategory` by `(projectId, key)` and upsert a `ResourceCategoryAssignment` (`status: proposed`) per proposed category, in the same transaction as the existing vulgarization upsert. Update `resource-batch-sweep.service.spec.ts` — depends on T001, T005
- [X] T008 [US1] Add `approveCategory(userId, projectId, resourceId, assignmentId)` and `rejectCategory(...)` to `ResourcesService` — contributor-only, one-way `proposed → approved`/`proposed → rejected` transition (409 if the assignment isn't currently `proposed`, per contracts/resource-categories.md). Extend the existing `ResourceResponse` assembly in `findAllForProject`/`findOne` to include each resource's `categories`, filtered to `status: 'approved'` only for a client-role caller (mirrors the existing `resource.status: 'published'` filter). Update `resources.service.spec.ts` — depends on T001, T003
- [X] T009 [US1] Add `POST :resourceId/categories/:categoryId/approve` and `POST :resourceId/categories/:categoryId/reject` to `ResourcesController` (`apps/api/src/resources/resources.controller.ts`). Update `resources.controller.spec.ts` — depends on T008

### Frontend (contributor review)

- [X] T010 [P] [US1] Add `approveResourceCategory`/`rejectResourceCategory` to `apps/web/features/resources/api.ts` and `useApproveResourceCategory`/`useRejectResourceCategory` mutation hooks to `apps/web/features/resources/hooks.ts` (mirrors the existing `usePublishResource` shape, invalidating the same resource/resources query keys on success). Update `hooks.test.tsx` — depends on T003, T009
- [X] T011 [US1] In `ResourceDetailPageContent` (`apps/web/features/resources/components/resource-detail-page-content.tsx`), show each of a resource's categories as a chip with its status; when `canManage` is true and a chip's status is `proposed`, show approve/reject controls wired to T010's hooks — placed alongside the existing Publish/Delete actions, not blocking them. Update `resource-detail-page-content.test.tsx` — depends on T010
- [X] T012 [P] [US1] Add en/fr copy for the category chips and approve/reject actions to `apps/web/messages/en.json` and `apps/web/messages/fr.json`

**Checkpoint**: A contributor can add a resource, see every proposed category, approve/reject each independently, and publish/delete continue to work unaffected — fully testable end-to-end without any client-facing change yet.

---

## Phase 3: User Story 2 - Client sees resources grouped into category tabs (Priority: P2)

**Goal**: A client's Resources area switches from a flat list to tabs as soon as one approved category exists on the project; a resource with several approved categories appears under each of its tabs; a resource with none appears under a catch-all.

**Independent Test**: With one published resource carrying two different approved categories, open the client-facing project view and confirm it appears under both corresponding tabs.

- [X] T013 [US2] Add `apps/web/shared/components/ui/tabs.tsx` — a hand-built Radix `Tabs` wrapper matching the existing style of `alert-dialog.tsx`/`avatar.tsx` (data-slot attributes, `cn()` from `shared/lib/utils`). No dedicated test file — `shared/components/ui/**` is coverage-exempt per AGENTS.md, same as those two files
- [X] T014 [US2] Change `ResourcesList`'s client branch (`apps/web/features/resources/components/resources-list.tsx`, `canManage={false}`) to group its resources by approved category and render them inside `Tabs` from T013 — one tab per distinct category name; a resource with multiple approved categories appears under each of its tabs; a resource with none goes under a catch-all "Uncategorized" tab. The developer branch (`canManage={true}`) is unchanged (stays the existing flat list, per spec.md FR-006). Update `resources-list.test.tsx` — depends on T003, T008, T013
- [X] T015 [P] [US2] Add en/fr copy for the tab labels and the "Uncategorized" fallback to `apps/web/messages/en.json` and `apps/web/messages/fr.json`

**Checkpoint**: Both user stories work independently and together — categorization (US1) and its client-facing tabbed display (US2) form the complete feature.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T016 Run `pnpm test:cov` from the repo root and confirm the 80% coverage gate holds on both `apps/api` and `apps/web` with all new code included
- [X] T017 Partial: confirmed the migration is live against the real dev database (`resourceCategory`/`resourceCategoryAssignment` queryable, existing resources unaffected) and the full unit/integration suite + typecheck + lint pass end-to-end. Did **not** exercise a real Anthropic Batch API round-trip (upload → wait for the sweep → real proposed categories) — that requires a live `ANTHROPIC_API_KEY` and unpredictable batch completion timing, impractical in this session. Recommend a manual pass through quickstart.md's 7 steps before considering this feature done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately. Blocks both user stories.
- **User Story 1 (Phase 2)**: Depends on Phase 1 completing (needs the schema + shared types).
- **User Story 2 (Phase 3)**: Depends on Phase 1 (schema/types) and on T008/T009 from Phase 2 (the API must already return/gate category assignments before the client view can group by them) — **not independent of US1**, unlike a typical two-story split, because US2's entire premise (grouping by *approved* categories) requires US1's approval mechanism to exist first. This mirrors spec.md's own "Why this priority" note for User Story 2.
- **Polish (Phase 4)**: Depends on Phases 2 and 3 both being complete.

### Parallel Opportunities

- T001 and T003 (Phase 1) touch different files (`schema.prisma` vs `packages/schemas`) and can run in parallel; T002 depends on T001.
- T010 and T012 (Phase 2) touch different files and can run in parallel with each other once their own dependencies (T009, none) are met.
- T015 (Phase 3) can run in parallel with T014 once T013 exists.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Foundational).
2. Complete Phase 2 (User Story 1) — a contributor can already categorize resources end-to-end; nothing client-facing changes yet, so this is safe to ship/demo on its own.
3. **STOP and VALIDATE**: exercise Phase 2's Independent Test before moving on.

### Incremental Delivery

1. Foundational → Phase 2 (US1) → validate → Phase 3 (US2) → validate → Phase 4 (Polish).
2. Unlike a fully independent two-story split, Phase 3 cannot be demoed meaningfully before Phase 2 has produced at least one approved category — plan the two as one continuous delivery, not parallel workstreams.
