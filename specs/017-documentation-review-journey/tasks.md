---

description: "Task list for Author-Defined Client Sections"
---

# Tasks: Author-Defined Client Sections

**Input**: Design documents from `/specs/017-documentation-review-journey/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/sections-api.md](./contracts/sections-api.md), [quickstart.md](./quickstart.md)

**Tests**: Required, not optional. The constitution's Principle I is non-negotiable: new code ships with tests that keep the 80% coverage gate green, written as part of the same change rather than bolted on. Test tasks below are therefore first-class, not a final phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on incomplete work
- **[Story]**: US1–US4, or blank for setup, foundational and cross-cutting work

## Path Conventions

Monorepo: `apps/api/src/…` (NestJS), `apps/web/…` (Next.js App Router), `packages/schemas/src/…` (shared Zod). Tests sit beside their subject: `*.spec.ts` on the API, `*.test.tsx` on the web, `*.test.ts` in schemas.

## Sequencing note

The plan's slices ship in order, and **nothing existing is removed until its replacement has been used**. Phases 3–6 add sections alongside the four fixed categories, which keep working untouched. Phase 7 migrates and deletes. That ordering is deliberate: it means every phase before the last can be abandoned without leaving the product broken.

---

## Phase 1: Setup

**Purpose**: Nothing to scaffold — the monorepo, both apps and the shared package already exist. This phase only establishes the branch and the shared contract file the rest of the work imports.

- [x] T001 Create `packages/schemas/src/documentation-sections.ts` and re-export it from `packages/schemas/src/index.ts`, so both apps can import from one place from the first task onward. Done together with T006/T007 rather than as a placeholder: the file is the same file, and an empty version would have had to be rewritten before anything could import it
- [x] ~~T002 Add the feature's translated string namespaces to `apps/web/messages/fr.json` and `apps/web/messages/en.json`~~ **Dropped as written.** `scripts/check-i18n-orphans.mjs` fails on any key with no call site, not only on divergence between locales — adding the namespaces before their components exist turns the check red for the whole of phases 2–5. Translated strings are added with the component that reads them, in both catalogues in the same commit

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The section must exist, be readable and be writable before any user story can be built on it. Everything here is additive — no existing table, route or screen changes.

**⚠️ CRITICAL**: No user story below can start until this phase is done.

- [x] T003 Add `ClientSection` to `apps/api/prisma/schema.prisma` per [data-model.md](./data-model.md): project, name, instructions, the four editorial dimensions, sortOrder, refreshNeeded, archivedAt, createdByUserId, version
- [x] T004 Add `SectionProposal` and `SectionQuestion` to `apps/api/prisma/schema.prisma`, with the unique constraint on `generationOperationId` and the status enum from data-model.md. Added beyond the task: `ClientSection.activeProposalId` (unique) so FR-013's one-at-a-time rule is a database constraint rather than a convention, following `CategoryProjectionState.activeDraftId`; `SectionQuestionItem` as a join table rather than an array column, following `ClarificationItem`; a `SectionProposalOutcome` enum so FR-011's "nothing matched" is distinguishable from "still composing"; and the `section_composition` value on `GenerationOperationType`, so the models and the operation that fills them arrive in one migration
- [x] T005 Generate and apply the additive migration with `pnpm --filter api prisma:migrate`, then `pnpm --filter api prisma:generate`. Nothing is dropped in this migration
- [x] T006 [P] Define the section, proposal and question contracts in `packages/schemas/src/documentation-sections.ts` with their Zod schemas and inferred types
- [x] T007 [P] Write `packages/schemas/src/documentation-sections.test.ts` covering the contracts' accepted and rejected shapes
- [x] T008 Create `apps/api/src/documentation/sections/client-section.service.ts` with create, list, update, archive and reorder, each enforcing contributor access through `ProjectAccessService`
- [x] T009 Write `apps/api/src/documentation/sections/client-section.service.spec.ts`, including that a caller without project access gets the same response as one asking about a project that does not exist (constitution Principle V)
- [x] T010 Create `apps/api/src/documentation/controllers/sections.controller.ts` exposing `POST/GET/PATCH/DELETE /sections` per [contracts/sections-api.md](./contracts/sections-api.md), and register it in the documentation module
- [x] T011 Write `apps/api/src/documentation/controllers/sections.controller.spec.ts` covering delegation, the `409` on a stale `version`, and the `400` when the project holds no canonical content

**Checkpoint**: A contributor can create, rename, reorder and archive sections through the API. Nothing composes yet.

---

## Phase 3: User Story 1 — Compose a section and publish it (Priority: P1) 🎯 MVP

**Goal**: A contributor turns a project with processed documents and no sections into a published section their client reads.

**Independent test**: Run [quickstart.md](./quickstart.md) Scenario 1 end to end.

### Composition, API side

- [ ] T012 [US1] Create `apps/api/src/documentation/sections/prompts/composition.prompt.ts`: the section's name, tone and instructions, the canonical statements, and the instruction to state plainly when nothing matches rather than padding (FR-011)
- [ ] T013 [US1] Create `apps/api/src/documentation/composition/composition-output.schema.ts`: the proposed blocks and the unresolved questions, as two separate arrays (FR-010). Follow the lesson recorded in research Decision 5 — the model is never asked to echo an identifier back
- [ ] T014 [P] [US1] Write `apps/api/src/documentation/composition/composition-output.schema.spec.ts` covering a normal proposal, an empty-match proposal, and a rejected malformed one
- [ ] T015 [US1] Create `apps/api/src/documentation/composition/section-composition.handler.ts` implementing `buildRequest` (whole canonical source, minus this section's exclusions — the exclusion set is empty until US2) and `apply` (persist the proposal and its questions), plus `onTerminalFailure` so a dead composition never leaves the section stranded
- [ ] T016 [US1] Write `apps/api/src/documentation/composition/section-composition.handler.spec.ts`, including that a terminal failure marks the proposal failed and leaves any approved content readable
- [x] T017 [US1] Add `section_composition` to the generation policy stages in `apps/api/.env.example`. **Pulled forward from Phase 3 by the compiler**: `GenerationPolicySchema.stages` is strict and requires a route for every value of `GenerationOperationType`, so adding the enum value in T004 made the API fail to build until the stage existed. Every deployment's `GENERATION_POLICY_JSON` must now declare it or the API will not boot
- [ ] T018 [US1] Create `apps/api/src/documentation/composition/section-proposal.service.ts`: trigger a composition (refusing a second while one runs, FR-013), read the current proposal, approve it
- [ ] T019 [US1] Write `apps/api/src/documentation/composition/section-proposal.service.spec.ts` covering the one-at-a-time rule and the approval path
- [ ] T020 [US1] Extend `apps/api/src/documentation/publication/client-publication.service.ts` so an approved section proposal queues a client release keyed by section, reusing the conditional-swap publication built on 2026-08-12 unchanged
- [ ] T021 [US1] Write the publication tests in `apps/api/src/documentation/publication/client-publication.service.spec.ts` proving two approvals seconds apart leave exactly one published set holding both sections
- [ ] T022 [US1] Add the composition and approval routes to `apps/api/src/documentation/controllers/sections.controller.ts` with their tests

### Composition, web side

- [ ] T023 [P] [US1] Create `apps/web/features/documentation/components/section-suggestions.ts` holding the starting points as translated copy only — name and worked description per suggestion, plus the free-title option. Nothing here is persisted (FR-004b, research Decision 10)
- [ ] T024 [US1] Create `apps/web/features/documentation/components/section-editor-dialog.tsx`: choose a suggestion or a free title, then edit name, tone and instructions, all editable before and after creation
- [ ] T025 [P] [US1] Write `apps/web/features/documentation/components/section-editor-dialog.test.tsx` covering that a suggestion prefills and that every prefilled field stays editable
- [ ] T026 [US1] Create `apps/web/features/documentation/components/section-list.tsx` showing each section and its state — needs refresh, composing, awaiting review, published — plus the empty state that says no section exists yet and offers to create one (FR-005)
- [ ] T027 [P] [US1] Write `apps/web/features/documentation/components/section-list.test.tsx` covering the empty state and each section state
- [ ] T028 [US1] Create `apps/web/features/documentation/components/section-proposal-review.tsx`: the proposed content, and separately the questions composition could not resolve, with the approve action
- [ ] T029 [P] [US1] Write `apps/web/features/documentation/components/section-proposal-review.test.tsx`, including that questions render outside the proposed content rather than inside it
- [ ] T030 [US1] Add the section hooks to `apps/web/features/documentation/hooks.ts` and their calls to `apps/web/features/documentation/api.ts`, following the existing `meta.successMessage` / `meta.skipGlobalErrorToast` convention
- [ ] T031 [US1] Add every string these screens need to `apps/web/messages/fr.json` and `apps/web/messages/en.json`, including the suggestions' worked descriptions

**Checkpoint**: Quickstart Scenario 1 passes. The four fixed categories still work, untouched, beside this.

---

## Phase 4: User Story 2 — Correct on facts and on relevance (Priority: P1)

**Goal**: A contributor corrects both what is untrue and what does not belong, from where they are reading, with the two reaches made obvious.

**Independent test**: Run [quickstart.md](./quickstart.md) Scenario 2.

- [ ] T032 [US2] Add `SectionExclusion` to `apps/api/prisma/schema.prisma` with its unique constraint on (section, information item), and migrate
- [ ] T033 [US2] Create `apps/api/src/documentation/sections/section-exclusion.service.ts` with add, remove and list, each setting `refreshNeeded` on that section only (FR-015)
- [ ] T034 [US2] Write `apps/api/src/documentation/sections/section-exclusion.service.spec.ts` covering idempotent exclusion and the scoping to one section
- [ ] T035 [US2] Filter excluded statements out of the composition input in `apps/api/src/documentation/composition/section-composition.handler.ts` — in code, before the model sees them (research Decision 5)
- [ ] T036 [US2] Write, in `apps/api/src/documentation/composition/section-composition.handler.spec.ts`, the test proving an excluded statement is absent from the built request whatever the model would have done with it. This is the invariant the whole decision rests on
- [ ] T037 [US2] Add the exclusion routes to `apps/api/src/documentation/controllers/sections.controller.ts` with their tests
- [ ] T038 [US2] Wire the existing guided-correction path so a factual correction can be raised from a proposal, in `apps/api/src/documentation/source/source-correction.service.ts` and its controller — reusing feature 016's revision mechanism unchanged (FR-014)
- [ ] T039 [US2] Write, in `apps/api/src/documentation/source/source-correction.service.spec.ts`, the test proving a factual correction made while reviewing one section is used by a second section's next composition (SC-003)
- [ ] T040 [US2] Add both corrections to `apps/web/features/documentation/components/section-proposal-review.tsx`, each naming its reach before the contributor commits (FR-017)
- [ ] T041 [P] [US2] Write, in `apps/web/features/documentation/components/section-proposal-review.test.tsx`, the test covering that the two corrections are distinguishable and that each states how far it reaches
- [ ] T042 [P] [US2] Add the correction strings to `apps/web/messages/fr.json` and `apps/web/messages/en.json`, worded so the difference in reach is legible without help text

**Checkpoint**: Quickstart Scenario 2 passes, including the cross-section assertions.

---

## Phase 5: User Story 3 — Keep sections current (Priority: P2)

**Goal**: New documents never change what the client reads; they mark sections, and the contributor triggers.

**Independent test**: Run [quickstart.md](./quickstart.md) Scenario 3.

- [ ] T043 [US3] Mark every non-archived section of a project as needing a refresh when a canonical revision is committed, in `apps/api/src/documentation/source/source-revision.service.ts` (research Decision 4)
- [ ] T044 [US3] Write, in `apps/api/src/documentation/source/source-revision.service.spec.ts`, the test proving a new revision marks sections and changes nothing published (FR-018, SC-005)
- [ ] T045 [US3] Mark the section as needing a refresh when its name, tone or instructions change, in `client-section.service.ts`, without composing (FR-020)
- [ ] T046 [P] [US3] Write, in `apps/api/src/documentation/sections/client-section.service.spec.ts`, the test covering that a revision to a section's definition marks it and does not queue work
- [ ] T047 [US3] Mark affected sections when a document is removed, in `apps/api/src/documentation/source/document-removal.service.ts`, with its test
- [ ] T048 [US3] Add a recovery sweep for sections left composing with no live work behind them, in `section-proposal.service.ts`, following the settle-delay convention already used by the removal sweep — a mark is only acted on once the section has been untouched for two minutes
- [ ] T049 [US3] Write the sweep's tests in `apps/api/src/documentation/composition/section-proposal.service.spec.ts`, including that a section touched seconds ago is left alone. A sweep without that guard ran away on 2026-08-12, creating thirteen releases and twelve generation calls in ten minutes
- [ ] T050 [US3] Surface the refresh mark and its trigger in `apps/web/features/documentation/components/section-list.tsx`, with its test and strings

**Checkpoint**: Quickstart Scenario 3 passes.

---

## Phase 6: User Story 4 — Manage the set (Priority: P3)

**Goal**: Rename, reorder, revise and remove sections over a project's life.

**Independent test**: Run [quickstart.md](./quickstart.md) Scenario 4.

- [ ] T051 [US4] Implement archiving in `client-section.service.ts`: stop any composition in flight, remove the section from the client's view, and republish the remaining approved sections as a complete set
- [ ] T052 [US4] Write the archive tests in `apps/api/src/documentation/sections/client-section.service.spec.ts`, including that deleting a section mid-composition leaves nothing running (US4.4) and that the remaining sections stay published
- [ ] T053 [US4] Implement reordering with a stable, gap-tolerant `sortOrder`, and its test
- [ ] T054 [P] [US4] Warn — without blocking — when a new section's name duplicates an existing one, in `section-editor-dialog.tsx`, with its test (Edge Cases)
- [ ] T055 [US4] Add rename, reorder, revise and delete to `section-list.tsx` and `section-editor-dialog.tsx`, with their tests and strings
- [ ] T056 [US4] Order the client's tabs by the contributor's `sortOrder` in `apps/web/shared/components/` and the client project page, with its test

**Checkpoint**: Quickstart Scenario 4 passes. All four stories work, with the fixed categories still running beside them.

---

## Phase 7: Migration and Removal (Cross-Cutting)

**Purpose**: Move existing projects onto sections, then delete everything the fixed list required. This phase is last on purpose: nothing is removed until its replacement has been used in anger.

**⚠️ This phase touches live client-visible content.** The published set must stay byte-identical through it (plan, Risks).

### Migration

- [ ] T057 Write the data migration in `apps/api/prisma/migrations/` creating one section per category that holds content, in the current order, named per research Decision 7, with the project's current editorial profile copied onto each
- [ ] T058 Re-point existing approved reference content and client content at the new sections in the same `apps/api/prisma/migrations/` migration, publishing nothing new
- [ ] T059 Write `apps/api/src/documentation/sections/section-migration.spec.ts` proving, against a seeded database, that a project's published set is unchanged before and after and that its client reads exactly what they read before

### Ingestion stops classifying

- [ ] T060 Remove category assignment from `apps/api/src/documentation/source/prompts/extraction.prompt.ts` and `extraction-output.schema.ts`, bumping the contract version
- [ ] T061 Remove category assignment from `apps/api/src/documentation/source/prompts/consolidation.prompt.ts` and the consolidation output contract, bumping its version
- [ ] T062 Update `apps/api/src/documentation/source/extraction-output.schema.spec.ts`, `document-extraction.handler.spec.ts`, `source-consolidation.handler.spec.ts` and `canonical-ingestion.e2e-spec.ts` for the reduced contracts
- [ ] T063 Drop `DocumentObservationCategory`, `SourceRevisionItemCategory` and `SourceRevisionImpact` from the schema and migrate

### The old journey goes

- [ ] T064 Delete `apps/api/src/documentation/review/` and `apps/api/src/documentation/editorial/`, their controllers, their routes and their tests
- [ ] T065 Drop `DocumentationCategoryReferenceDraft`, `CategoryProjectionState`, `EditorialProfileRevision`, `EditorialProfileProposal`, `EditorialPreview` and `ProjectEditorialSettings`, and migrate
- [ ] T066 Drop `CategoryExtract`, `CategoryContent`, `CategoryReference` and `CategoryReferenceDraft` — measured at zero consumers before this feature began (research Decision 8)
- [ ] T067 Drop the `DocumentationCategoryKey` enum and `apps/api/src/documentation/documentation-categories.ts`
- [ ] T068 Delete `category-review-list.tsx`, `editorial-profile-settings.tsx` and the four-step scaffolding from `documentation-workspace.tsx`, with their tests
- [ ] T069 Reshape `client-category-view.tsx` into `client-section-view.tsx` and update every caller
- [ ] T070 Remove every translated string left without a call site from `apps/web/messages/fr.json` and `apps/web/messages/en.json`

### Verification

- [ ] T071 Run `pnpm test:cov`, `pnpm lint`, `pnpm knip`, `pnpm i18n:orphans` and `pnpm design:check` — all green
- [ ] T072 Verify by hand that no Prisma model remains without a reader in `apps/api/src`. The automated gates do not catch this, which is how four dead models survived from features 013 and 014 into this one (FR-024)
- [ ] T073 Run the whole of `specs/017-documentation-review-journey/quickstart.md` against a migrated project, including its "what to watch" section

---

## Dependencies

```
Phase 1 (Setup)
   └─► Phase 2 (Foundational) ── blocks everything below
          ├─► Phase 3 (US1) ── the MVP; nothing else depends on it being finished
          │      └─► Phase 4 (US2) ── needs a proposal to correct
          │             └─► Phase 5 (US3) ── refresh must honour exclusions
          │                    └─► Phase 6 (US4)
          └─► Phase 7 (Migration and Removal) ── needs US1–US4 in use, not merely written
```

US2 depends on US1 because a correction needs something to correct. US3 depends on US2 because a refresh must carry accumulated exclusions forward, which is the point of FR-016. US4 is independent of US2 and US3 in principle and could be pulled earlier if managing sections becomes urgent before refreshing them does.

## Parallel opportunities

Within Phase 2: T006 and T007 (shared contracts) run alongside T003–T005 (schema), different files.

Within Phase 3: the web tasks T023–T031 and the API tasks T012–T022 are separate trees. The web work can be built against the contracts from T006 before the API handler exists.

Within Phase 4: T041 and T042 are independent of the API work.

Phase 7 is deliberately sequential. Migrating and deleting in parallel is how a published set gets lost.

## Implementation Strategy

**MVP is Phase 3.** A contributor who can create one section, read what was proposed, approve it and have their client read it has the whole idea in their hands. Everything after that makes it livable.

**Ship Phases 3–6 while the old journey still runs.** They add; they do not replace. If the model turns out wrong in use — and research records that composition quality at this shape is unproven — the cost of stopping is deleting new code, not restoring deleted code.

**Phase 7 is a decision, not a formality.** Take it once real sections have been composed, corrected and published on a real project. It is the only irreversible part of this feature.
