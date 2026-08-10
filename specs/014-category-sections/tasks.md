---

description: "Task list for 014 — Fixed Categories & Per-Category Document Sections"
---

# Tasks: Fixed Categories & Per-Category Document Sections

**Input**: Design documents from `/specs/014-category-sections/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/resource-sections.md)

**Tests**: **Included and non-optional.** Constitution I makes the 80% coverage gate a hard requirement and forbids bolting tests on after the fact, so each slice carries its own tests rather than deferring them to a trailing phase. Note this feature *deletes* three tables and their existing specs — coverage must be re-measured after Phase 2, not assumed to hold.

**Organization**: Tasks are grouped by user story. US4 is fully independent and can be pulled ahead of everything else (see Implementation Strategy).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4, mapping to spec.md's user stories
- Paths are repo-root-relative

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the two new dependencies before any code needs them.

- [X] T001 Add `sharp` to the API with `pnpm --filter api add sharp` from the repo root, then verify it loads on this machine (`pnpm --filter api exec node -e "require('sharp')"`) — research.md Decision 6 flags native-binary resolution under pnpm as the one risk with no fallback library
- [X] T002 [P] Add the shadcn accordion primitive with `pnpm --filter web dlx shadcn@latest add accordion`, producing `apps/web/shared/components/ui/accordion.tsx` (already covered by the existing `shared/components/ui/**` coverage exclusion — no config change)
- [X] T003 Read the failing PNG resource's `failure_reason` via `pnpm --filter api prisma:studio` (table `resources`) and record the actual value in research.md § Open item — confirms or refutes Decision 6 before T041 is written

**Checkpoint**: dependencies installed, PNG diagnosis confirmed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The frozen category list, the new read shape, and the data model. Every user story depends on all of it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Create the frozen category list in `packages/schemas/src/resource-category.ts` — an ordered `RESOURCE_CATEGORIES` array of `{ key, labelEn, labelFr }` for `overview` / `how_it_works` / `planning` / `other` (labels per data-model.md), plus `ResourceCategoryKeySchema` as a Zod enum and its inferred type. Array order is the client's tab order, `other` last
- [X] T005 Export the new module from `packages/schemas/src/index.ts`
- [X] T006 Rewrite the resource read shape in `packages/schemas/src/resource.ts` — remove `ResourceCategorySchema`, `ResourceCategoryAssignmentStatusSchema`, `vulgarizedTitle`, `vulgarizedContent` and `categories`; add `ResourceSectionSchema` (`id`, `categoryKey`, `status`, `title`, `content`) and `sections` on `ResourceSchema`; add `MoveResourceSectionRequestSchema` (`{ categoryKey }`)
- [X] T007 [P] Create the API-side mirror of the frozen list in `apps/api/src/resources/resource-categories.ts`, with a header comment naming `packages/schemas/src/resource-category.ts` as the source of truth and explaining why it is copied rather than imported (plan.md § Complexity Tracking) — mirrors the existing precedent in `apps/api/src/task-vulgarization/locale.ts`
- [X] T008 Update `apps/api/prisma/schema.prisma` per data-model.md — add `enum ResourceCategoryKey`, `enum ResourceSectionStatus` and `model ResourceSection` (`@@unique([resourceId, categoryKey])`); remove `ResourceVulgarization`, `ResourceCategory`, `ResourceCategoryAssignment` and `enum ResourceCategoryAssignmentStatus`; replace `Resource`'s `vulgarizations` and `categoryAssignments` relations with `sections`; drop the now-dangling `resourceCategories` relation on `Project`
- [X] T009 Generate the migration with `pnpm --filter api prisma:migrate`, then hand-edit the generated SQL to append the carried-over-resource step from data-model.md § Migration: `UPDATE resources SET status = 'failed', failure_reason = <plain-language reason>, anthropic_batch_id = NULL WHERE status <> 'failed';` — without it, surviving resources look healthy to the contributor while showing the client nothing
- [X] T010 Run `pnpm --filter api prisma:generate` and fix every resulting type error across `apps/api/src/resources/` — this is the compiler enumerating the full blast radius of T008; expect breakage in the service, the sweep and their specs

**Checkpoint**: shared types and database ready. `pnpm build` will still fail until Phase 3 — that is expected and is what T010 scopes.

---

## Phase 3: User Story 1 — AI splits a document into per-category sections (Priority: P1) 🎯 MVP

**Goal**: One analysis pass per document produces one section per category the document actually addresses, in both languages, with nothing of substance lost.

**Independent Test**: Upload a PDF deliberately mixing project purpose, a diagram, and delivery dates. Confirm three sections under three distinct categories, each holding only its own slice, and confirm the union covers the source — quickstart.md Scenario 1.

### Implementation

- [X] T011 [P] [US1] Create `apps/api/src/resources/document-sections-output.schema.ts` — a Zod schema for `{ sections: [{ categoryKey, titleEn, contentEn, titleFr, contentFr }] }` with `categoryKey` constrained to the four keys, replacing `document-vulgarization-output.schema.ts`
- [X] T012 [US1] Delete `apps/api/src/resources/document-vulgarization-output.schema.ts` and its references
- [X] T013 [US1] Rewrite the system prompt in `apps/api/src/resources/document-vulgarization.client.ts` per research.md Decision 8 — keep 011's guardrails verbatim (rewrite not summarize, describe visual content, never fabricate) and add the four categories with what each holds, "no section for a category the document doesn't address" (FR-006), and "everything of substance lands in exactly one section; anything fitting none goes to `other`" (FR-007)
- [X] T014 [US1] Replace `submitBatch`'s three requests with the single request of contracts/ § Analysis provider contract in `apps/api/src/resources/document-vulgarization.client.ts` — forced tool use on `submit_document_sections`, `max_tokens: 32000`, no `existingCategories` parameter (it no longer exists)
- [X] T015 [US1] Rewrite `pollBatch` in the same file to return `{ status: 'succeeded', sections }` — parse with the T011 schema, merge duplicate `categoryKey` entries rather than emitting a `@@unique` violation, and fail the resource on an empty `sections` array or a truncated tool call (FR-012). Remove `parseCategoriesBestEffort` and the whole best-effort degradation path: sections *are* the content now, so a failed analysis is a failed resource
- [X] T016 [US1] Rewrite the transaction in `apps/api/src/resources/resource-batch-sweep.service.ts` to upsert `ResourceSection` rows keyed on `(resourceId, categoryKey)` with `position` from array order, dropping the `resourceCategory`/`resourceCategoryAssignment` upserts
- [X] T017 [US1] Remove `findExistingCategories` and its two call sites in `apps/api/src/resources/resources.service.ts` — category reuse was 013's feedback loop and is exactly what this feature removes
- [X] T018 [P] [US1] Update `apps/api/src/resources/document-vulgarization.client.spec.ts` — one request not three, both locales in one response, duplicate-key merge, empty-`sections` failure, truncated-tool-call failure with a readable reason
- [X] T019 [P] [US1] Update `apps/api/src/resources/resource-batch-sweep.service.spec.ts` — sections persisted with correct `position`, re-poll upserts rather than duplicating, failure path sets `status: failed` with a reason and clears `anthropicBatchId`

**Checkpoint**: a document now produces sections. Nothing renders them yet.

---

## Phase 4: User Story 2 — Contributor reviews and corrects the distribution (Priority: P1)

**Goal**: The contributor sees each section with its category, title and full content, and can approve, reject or re-file it independently — and no unreviewed content can reach a client.

**Independent Test**: On a resource with three proposed sections, approve one, reject one, move the third; confirm the three outcomes are independent and that a client subsequently sees only what was approved — quickstart.md Scenario 2.

### API

- [X] T020 [P] [US2] Create `apps/api/src/resources/dto/move-resource-section.dto.ts` validating `categoryKey` against the four keys (`class-validator`, matching the existing DTO style in this folder)
- [X] T021 [US2] Replace `approveCategory`/`rejectCategory`/`setCategoryAssignmentStatus` with `approveSection`/`rejectSection`/`moveSection` in `apps/api/src/resources/resources.service.ts` — one-way `proposed → approved | rejected`; `moveSection` permitted only from `proposed`, never touching title or content (FR-015), `409` on an occupied target category, with distinct messages for the two `409` cases
- [X] T022 [US2] Add the no-approved-section guard to `publish()` in the same file (`400`, plain-language reason) — plan.md § Judgement calls
- [X] T023 [US2] Make `findOne` return `404` for a client-role member in the same file, regardless of resource status — the same response a non-member gets, never a distinguishable "forbidden" (Constitution V, Q2)
- [X] T024 [US2] Collapse `toResponse` in the same file to a single uniform shape — drop the `includeDetails` parameter, always presign `originalFileUrl`, replace `categoriesFor` with `sectionsFor` (locale-resolves `titleEn`/`titleFr` and `contentEn`/`contentFr`, filters to `approved` for a client)
- [X] T025 [US2] Replace the two category routes with `POST .../sections/:sectionId/approve`, `.../reject` and `.../move` in `apps/api/src/resources/resources.controller.ts`, all `204 No Content` per contracts/
- [X] T026 [P] [US2] Update `apps/api/src/resources/resources.service.spec.ts` — section approve/reject independence, both `move` `409` paths, move preserves content, publish refusal with no approved section, `findOne` 404 for a client, and that a client's `sections` array never contains a `proposed` or `rejected` entry
- [X] T027 [P] [US2] Update `apps/api/src/resources/resources.controller.spec.ts` for the three new routes and the removal of the two old ones

### Contributor UI

- [X] T028 [US2] Replace the category and section calls in `apps/web/features/resources/api.ts` — `approveResourceSection`, `rejectResourceSection`, `moveResourceSection(projectId, resourceId, sectionId, categoryKey)`; delete `approveResourceCategory` and `rejectResourceCategory`
- [X] T029 [US2] Update the corresponding mutation hooks in `apps/web/features/resources/hooks.ts`, keeping the existing query-invalidation pattern
- [X] T030 [P] [US2] Create `apps/web/features/resources/components/section-review-list.tsx` — one block per section showing its category label (from `RESOURCE_CATEGORIES`, locale-resolved), title and full content, with approve / reject / move-to-category controls; decided sections render their state instead of controls
- [X] T031 [US2] Rewrite `apps/web/features/resources/components/resource-detail-page-content.tsx` as the contributor-only review screen — remove the `canManage` prop and every role branch, remove `CategoryChips` and the vulgarized-content paragraph, compose `SectionReviewList` plus the existing original-document access and the publish/delete actions
- [X] T032 [US2] Guard `apps/web/app/[locale]/(protected)/projects/[id]/resources/[resourceId]/page.tsx` — redirect a `client`-role member back to `/projects/{id}` and stop passing `canManage`
- [X] T033 [P] [US2] Add category, section-state and review-action strings to `apps/web/messages/en.json` and `apps/web/messages/fr.json`; remove the now-dead `categoryApprove`/`categoryReject`/`categoryApproved`/`categoryRejected` keys. Category **labels** come from `RESOURCE_CATEGORIES`, not from these files — do not duplicate them here
- [X] T034 [P] [US2] Write `apps/web/features/resources/components/section-review-list.test.tsx` covering the three actions, the decided-state rendering, and that move offers only the four fixed categories
- [X] T035 [P] [US2] Update `apps/web/features/resources/components/resource-detail-page-content.test.tsx` and `apps/web/app/[locale]/(protected)/projects/[id]/resources/[resourceId]/page.test.tsx` for the contributor-only screen and the client redirect

**Checkpoint**: a contributor can fully review and publish. The client view is still the old one.

---

## Phase 5: User Story 3 — Client reads content inline under each category tab (Priority: P2)

**Goal**: One tab per category that has approved published content, first section expanded, no click-through to read anything, and two tabs drawing from the same document showing *different* text.

**Independent Test**: With two published resources whose approved sections span three categories, confirm each tab shows different content and that no empty tab exists — quickstart.md Scenario 3.

- [X] T036 [P] [US3] Create `apps/web/features/resources/components/category-section-accordion.tsx` — accordion over one category's sections, first item expanded by default, each item exposing its source document (preview/download for an upload, link for a Notion page, FR-020)
- [X] T037 [US3] Rewrite the grouping in `apps/web/app/[locale]/(protected)/projects/[id]/client-main-tabs.tsx` to group **sections** by `categoryKey` instead of grouping resources by approved category — iterate `RESOURCE_CATEGORIES` for a stable tab order with `other` last, skip categories with no section (FR-018), and order sections within a tab by resource `publishedAt` desc then `position` (FR-022). Delete `groupByCategory` and the `__uncategorized__` tab, which the fixed list and `other` make obsolete
- [X] T038 [US3] Render `CategorySectionAccordion` in each tab's content in the same file, replacing the `ResourceTile` list
- [X] T039 [P] [US3] Update `apps/web/app/[locale]/(protected)/projects/[id]/client-main-tabs.test.tsx` — the decisive case is two categories drawing from the *same* resource showing different content (SC-001); also cover stable tab order, no tab for an empty category, and no `proposed`/`rejected` section ever rendered
- [X] T040 [P] [US3] Update the `Resource` fixtures in `apps/web/features/resources/components/resources-list.test.tsx`, `apps/web/features/resources/hooks.test.tsx` and `apps/web/features/resources/api.test.ts` for the new `sections` shape

**Checkpoint**: the client reads inline. SC-001 and SC-002 are verifiable.

---

## Phase 6: User Story 4 — An architecture-diagram PNG is read and described (Priority: P2)

**Goal**: A large diagram export completes analysis instead of failing minutes later, and its section describes what the diagram shows.

**Independent Test**: Upload a ~12000 × 3000 px, ~15 MB diagram and confirm it reaches ready-for-review with a section describing the diagram's components and relationships — quickstart.md Scenario 4.

**Note**: independent of Phases 3–5 — see Implementation Strategy for shipping it first.

- [X] T041 [P] [US4] Create `apps/api/src/resources/image-normalizer.ts` using `sharp` — resize so the long edge is at most 2576 px, re-encode if the result still exceeds a 5 MB raw budget, preserve aspect ratio, keep PNG for PNG input (lossless matters for diagram labels), and leave an already-conforming image untouched
- [X] T042 [US4] Call the normalizer on the image path in `apps/api/src/resources/resources.service.ts` before the source reaches `submitBatch`, and surface an unprocessable image as a clear `400` at upload time where detectable (FR-025)
- [X] T043 [P] [US4] Write `apps/api/src/resources/image-normalizer.spec.ts` — oversized-by-dimension is resized, oversized-by-weight is re-encoded, a small image is returned unchanged, aspect ratio preserved, corrupt input raises a typed error rather than throwing raw

**Checkpoint**: SC-006 verifiable end to end.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T044 Run `pnpm test:cov` from the repo root and close any gap the deleted tables opened — this is the phase where the gate realistically breaks, since Phase 2 removed three models and their specs
- [X] T045 [P] Update `docs/PRODUCT.md` — the fixed category list, sections as the client's unit of reading, and the removal of AI-invented categories
- [X] T046 [P] Mark `specs/013-ai-resource-categorization/spec.md` as superseded by 014, mirroring how 013 recorded its own supersession of the earlier resources spec
- [X] T047 [P] ~~Consider renaming `document-vulgarization.client.ts` to `document-sections.client.ts`~~ — **declined**. Reviewed at polish time: "vulgarization" still describes exactly what the client does (plain-language rewriting for a non-technical reader), it just now also splits the result by category. The name never claimed *one* rewrite. Renaming would touch the module, the service, the sweep and two specs for no gain in accuracy.
- [ ] T048 Walk every scenario in [quickstart.md](./quickstart.md) against a running stack, including Scenario 5 if a 013-era database is available — **not done, and not doable in a single session**: the provider's batch API is best-effort within 24 hours (the diagnosed upload sat `in_progress` for over two hours), so Scenarios 1–4 each need a real wait between the upload and the assertion. Needs a contributor and a client account on the same project, plus R2. Scenario 5 additionally needs a 013-era database, which the isolated `bmate_014` database is not.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies
- **Phase 2 (Foundational)**: needs nothing from Phase 1 except T001 for the API to install cleanly — **blocks every user story**
- **Phase 3 (US1)**: after Phase 2
- **Phase 4 (US2)**: after Phase 2. Testable against seeded sections via `createPrismaMock()`, so it does not have to wait for US1 to work end to end
- **Phase 5 (US3)**: after Phase 2; needs Phase 4 for real approved data, but its component tests run on fixtures
- **Phase 6 (US4)**: after T001 only — genuinely independent of Phases 2–5
- **Phase 7 (Polish)**: after every story that is being shipped

### Within Each Story

- Schema/model tasks precede service tasks; service precedes controller; API precedes UI
- Tests accompany the change that introduces them (Constitution I) rather than trailing it
- `apps/api` before `apps/web` within a story — the frontend consumes the shape the backend defines

### Parallel Opportunities

- T004 and T007 (the two copies of the frozen list) — different packages
- T018, T019 (US1 specs) — different files
- T026, T027 (API specs) and T030, T033, T034 (UI pieces) within US2
- T036, T039, T040 within US3
- T041 and T043 within US4
- T045, T046, T047 in polish
- Phase 6 in parallel with Phases 3–5 entirely, by a second person

---

## Parallel Example: Phase 2 opening

```bash
# The two copies of the frozen category list, in different packages:
Task: "Create packages/schemas/src/resource-category.ts"
Task: "Create apps/api/src/resources/resource-categories.ts"
```

## Parallel Example: User Story 1 tests

```bash
Task: "Update apps/api/src/resources/document-vulgarization.client.spec.ts"
Task: "Update apps/api/src/resources/resource-batch-sweep.service.spec.ts"
```

---

## Implementation Strategy

### Ship the PNG fix first (optional, recommended)

US4 touches one new file plus one call site and depends on nothing else. If the diagram upload
is blocking real use, run T001 → T003 → Phase 6 and ship it before touching the data model. Do
T003 before T041 either way: if the recorded `failureReason` says something other than a
dimension or payload rejection, Decision 6 is still good hygiene but is not the cause, and the
real cause is still unknown.

### MVP scope

**Phase 2 + Phase 3 + Phase 4** is the smallest useful increment: documents split into sections
and a contributor can review them. Note that this MVP has *no client-visible improvement* — US1
and US2 are both P1 precisely because shipping US1 without US2 would expose unreviewed AI output
to clients, which FR-016 forbids. Phase 5 is what the client actually sees, so a demo needs it.

### Incremental delivery

1. Phase 1 + Phase 2 → foundation (the app does not build in between; keep it one commit range)
2. Phase 3 → sections exist, verifiable in the database
3. Phase 4 → contributor can review and publish
4. Phase 5 → client reads inline → **this is the demo**
5. Phase 6 → PNG diagrams work (or first, per above)
6. Phase 7 → coverage, docs, quickstart walkthrough

### Parallel team strategy

Phase 2 is a single-owner job — it is one migration and two mirrored constants, and splitting it
invites drift. After that: one person on Phase 3 → 4 → 5 (they are a chain), a second on Phase 6
independently.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- Phase 2 deliberately leaves the repo non-building until Phase 3 completes; T010 is where the
  compiler tells you the full extent of the change
- Commit per task or per logical group; the branch is `feat/document-processing-categories`
- Every task above traces to a requirement in spec.md or a decision in research.md — if a task
  seems to need a choice neither document made, that is a signal to stop and ask rather than
  decide (Constitution IV)
