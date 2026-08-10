---

description: "Task list for 015 — Reference Documentation Layer & Derived Client Content"
---

# Tasks: Reference Documentation Layer & Derived Client Content

**Input**: Design documents from `/specs/015-document-reference-layer/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/reference-review.md)

**Tests**: **Included and non-optional.** Constitution I makes the 80% gate a hard requirement and forbids bolting tests on afterwards. This change deletes as much as it adds in places, so coverage must be re-measured after each removal, not assumed to hold.

**Removals are not a phase.** FR-024/FR-025 are honoured by deleting each thing in the phase that orphans it — the section routes die with the review API that replaces them, the accordion dies with the tab that stops stacking blocks. Phase 8 only *proves* nothing was missed; if it finds something, that is a bug in an earlier phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md
- Paths are repo-root-relative

---

## Phase 1: Setup

**Purpose**: put the verification tooling in place *before* the demolition starts, so it can be trusted at the end.

- [X] T001 Add `knip` as a dev dependency at the repo root, create `knip.json` covering both apps and `packages/schemas`, and add a `knip` script to the root `package.json`
- [X] T002 Run `pnpm knip` once against the untouched codebase and triage the baseline — legitimate cases (Next.js route files, shadcn primitives in use, config entry points) go into `knip.json`'s ignore lists so the tool starts green. A tool that is noisy from day one gets ignored by day three
- [X] T003 [P] Write `scripts/check-i18n-orphans.mjs` comparing every key in `apps/web/messages/{en,fr}.json` against its `t("…")` call sites, exiting non-zero on an orphan, and wire it as an `i18n:orphans` root script — knip cannot see translation keys, they are not code symbols (research.md Decision 8)

**Checkpoint**: both checks pass on the current tree. From here, any red is something this feature introduced.

---

## Phase 2: Foundational (Blocking)

**Purpose**: the shared shapes and the data model. Everything depends on all of it.

**⚠️ The repo will not build between T007 and the end of Phase 3.** That is expected and scoped by T010.

- [X] T004 [P] Create `packages/schemas/src/category-content.ts` — read shapes for a pending draft (`categoryKey`, `content`, `status`, `attempt`, `trigger`, triggering document name), for validated reference content, and for client content (`categoryKey`, `content` locale-resolved); plus `RegenerateDraftRequestSchema` (`{ instruction }`)
- [X] T005 Export the new module from `packages/schemas/src/index.ts`
- [X] T006 Update `packages/schemas/src/resource.ts` — remove `ResourceSectionSchema`, `ResourceSectionStatusSchema`, `MoveResourceSectionRequestSchema` and the `sections` field; narrow `ResourceStatusSchema` to `pending | absorbed | failed` (data-model.md)
- [X] T007 Rewrite the resource models in `apps/api/prisma/schema.prisma` per data-model.md — add `CategoryExtract`, `CategoryReference`, `CategoryReferenceDraft`, `CategoryContent`, `ReferenceQuestion` and the `ReferenceDraftStatus` / `DraftTrigger` enums; remove `ResourceSection` and `ResourceSectionStatus`; rewrite `ResourceStatus`; keep `ResourceCategoryKey` untouched
- [X] T008 Generate the migration, then hand-edit it to add the wipe from data-model.md § Migration: `DELETE FROM resources;`. Q1 is a clean start, and every surviving row would carry a status value that no longer exists and extracts that were never produced
- [X] T009 Run `pnpm --filter api prisma:generate` and collect the resulting type errors — this is the compiler enumerating the blast radius, and it is the input to Phase 3. Do not fix them here
- [X] T010 [P] Update `apps/api/src/test/prisma-mock.ts` — drop `resourceSection`, add the five new models with the methods the services will need (`findUnique`, `findMany`, `create`, `update`, `upsert`, `delete`, `deleteMany`, `count`)

**Checkpoint**: schema and shared types ready; build red by design.

---

## Phase 3: User Story 1 — A messy corpus becomes structured reference documentation (Priority: P1) 🎯

**Goal**: ingesting a document produces, for each category it genuinely addresses, an extract of what it contributes and a draft of the merged reference content.

**Independent Test**: ingest a project brief, then meeting notes revising one of its dates. Confirm the second produces a draft holding one integrated text with the revised date — not two blocks — and that no fact from either source is missing (quickstart.md Scenarios 1–2).

- [X] T011 [P] [US1] Create `apps/api/src/resources/reference-output.schema.ts` — Zod schema for `{ categories: [{ categoryKey, extract, reference }] }`, `categoryKey` constrained to the frozen four, all strings non-empty
- [X] T012 [US1] Create `apps/api/src/resources/reference-analysis.client.ts` with the ingestion request from contracts/ — forced tool use on `submit_reference_update`, input = the document plus the current reference content of all four categories, one request per ingestion (research.md Decision 2)
- [X] T013 [US1] Write the ingestion system prompt in the same file — reference register, **not** vulgarized; clean in form (no repetition, no padding) and **exhaustive in substance**, with exhaustiveness named as the constraint that wins where they conflict (FR-003); merge into existing content rather than appending (FR-004); describe visual content; never invent; omit categories the document does not address (FR-005)
- [X] T014 [US1] Implement poll/parse in the same file — Zod-narrow at the boundary; an empty `categories` array fails the resource with a readable reason; a truncated tool call fails the resource, leaving every category's live content untouched (contracts/)
- [X] T015 [US1] Rewrite the transaction in `apps/api/src/resources/resource-batch-sweep.service.ts` — persist one `CategoryExtract` per returned category and upsert one `CategoryReferenceDraft` per category, then mark the resource `absorbed`. Handle the unique-constraint collision on `(projectId, categoryKey)` as serialisation, not as an error: the second ingestion's material waits rather than racing (data-model.md)
- [X] T016 [US1] Update `apps/api/src/resources/resources.service.ts` — both ingestion entry points submit the new request; resource status becomes `pending` on creation; remove `findExistingCategories` leftovers and the section-shaped response fields
- [X] T017 [US1] **Remove** `apps/api/src/resources/document-vulgarization.client.ts`, `document-sections-output.schema.ts` and their specs — superseded by T012/T014 (FR-024)
- [X] T018 [P] [US1] Write `apps/api/src/resources/reference-analysis.client.spec.ts` — one request per ingestion, prompt carries the exhaustiveness-wins wording and the four categories, empty-`categories` failure, truncated-tool-call failure, category omitted means not regenerated
- [X] T019 [P] [US1] Update `apps/api/src/resources/resource-batch-sweep.service.spec.ts` — extracts and drafts persisted together, resource marked `absorbed`, a colliding draft does not raise, failure path leaves live content alone
- [X] T020 [P] [US1] Update `apps/api/src/resources/resources.service.spec.ts` for the new status values and the new submission shape

**Checkpoint**: the reference layer fills up. Verifiable in the database; nothing renders it yet.

---

## Phase 4: User Story 2 — The contributor validates facts once (Priority: P1)

**Goal**: a queue of independent per-category drafts the contributor accepts, discards, or sends back with instructions — and the only gate that makes anything client-visible.

**Independent Test**: with a draft pending, discard it and confirm the live version is untouched; regenerate with a plain-words correction and confirm the new draft reflects it; hit the cap on the third attempt; accept and confirm the category goes live on its own while other pending drafts stay pending (quickstart.md Scenario 3).

### API

- [X] T021 [P] [US2] Create `apps/api/src/resources/dto/regenerate-draft.dto.ts` validating a non-empty, length-bounded `instruction`
- [X] T022 [US2] Add the **rebuild** request to `apps/api/src/resources/reference-analysis.client.ts` — input is the surviving extracts for one category plus an optional instruction, output is a single `reference` string, no `extract` field (contracts/). Used by both regeneration and deletion
- [X] T023 [US2] Create `apps/api/src/resources/category-reference.service.ts` — `listDrafts` (oldest first, independent items, never grouped by document), `accept` (promote to `CategoryReference`, delete the draft, enqueue derivation), `discard` (delete the draft, touch nothing else), `regenerate` (store the instruction, increment `attempt`, submit a rebuild; refuse with 409 at the cap of 3)
- [X] T024 [US2] Create `apps/api/src/resources/categories.controller.ts` with the four routes from contracts/, contributor-only, collapsing not-found / wrong-project / not-a-contributor into one response
- [X] T025 [US2] **Remove** from `apps/api/src/resources/resources.controller.ts` and `resources.service.ts`: the three `/sections/:sectionId/*` routes, the `/publish` route, `publish()` and everything that existed to serve it (FR-019a, Q3) — *done in Phase 3: the Prisma change orphaned them, so the compiler forced it there rather than here*
- [X] T026 [US2] **Remove** `apps/api/src/resources/dto/move-resource-section.dto.ts` (FR-024, named explicitly by the user) — *done in Phase 3, same reason as T025*
- [X] T027 [US2] Register the new controller and services in `apps/api/src/resources/resources.module.ts`
- [X] T028 [P] [US2] Write `apps/api/src/resources/category-reference.service.spec.ts` — accept promotes and enqueues; discard leaves live content and client content untouched; the cap refuses a fourth attempt; accepting one category touches no other draft or content; a client-role caller gets the same 404 as a non-member
- [X] T029 [P] [US2] Write `apps/api/src/resources/categories.controller.spec.ts` for the four routes, and update `resources.controller.spec.ts` for the removed ones

### Contributor UI

- [X] T030 [US2] Update `apps/web/features/resources/api.ts` and `hooks.ts` — `getReferenceDrafts`, `acceptDraft`, `discardDraft`, `regenerateDraft`; delete `approveResourceSection`, `rejectResourceSection`, `moveResourceSection`, `publishResource` and their hooks
- [X] T031 [P] [US2] Create `apps/web/features/resources/components/reference-draft-queue.tsx` — one card per pending draft showing its category, why it exists, its attempt count and its full text, with accept and refuse actions. Items are independent: acting on one never blocks another
- [X] T032 [P] [US2] Create `apps/web/features/resources/components/regenerate-draft-dialog.tsx` — the refusal popup offering discard or an instruction field, with the instruction path disabled and explained once the cap is reached
- [X] T033 [US2] **Remove** `apps/web/features/resources/components/section-review-list.tsx` and its test — replaced by the queue
- [X] T034 [US2] Update `apps/web/features/resources/components/resource-detail-page-content.tsx` — no publish action, no section review, no `hasApprovedSection` logic. **Decide here** whether the page still earns its route now that review is project-level, or whether document management folds into the project page (plan.md flags this deliberately)
- [X] T035 [P] [US2] Update `apps/web/messages/en.json` and `fr.json` — remove every `section*` and `publishBlocked` key, add the draft-queue and refusal-dialog strings
- [X] T036 [P] [US2] Write `apps/web/features/resources/components/reference-draft-queue.test.tsx` and `regenerate-draft-dialog.test.tsx` — independence of items, the cap disabling the instruction path, discard vs regenerate calling different mutations
- [X] T037 [P] [US2] Update `resource-detail-page-content.test.tsx` and the resource page test for whatever T034 decides

**Checkpoint**: a contributor can drive the whole loop. The client still sees 014's output.

---

## Phase 5: User Story 3 — The client reads one coherent text per category (Priority: P2)

**Goal**: accepted reference content becomes plain-language text in both locales, and a category tab holds one continuous read.

**Independent Test**: with three documents ingested and validated, confirm each tab is one text with no visible seams, no source-document links, and that a category with nothing in it has no tab (quickstart.md Scenario 4).

- [X] T038 [US3] Add the **derivation** request to `apps/api/src/resources/reference-analysis.client.ts` — input is validated reference content only, output `{ contentEn, contentFr }` in one request, which is what makes FR-010 and FR-011 true by construction
- [X] T039 [US3] Create `apps/api/src/resources/category-content.service.ts` — derive on accept, replace the existing `CategoryContent`, and read for the client with the locale resolved and the frozen category order applied
- [X] T040 [US3] Add `GET /projects/:projectId/categories/content` to `apps/api/src/resources/categories.controller.ts` — both roles; a category without content is **absent** from the array, which is the only mechanism producing "no empty tab"
- [X] T041 [US3] Rewrite `apps/web/app/[locale]/(protected)/projects/[id]/client-main-tabs.tsx` — one tab per category with content, each holding a single text; drop the section grouping entirely
- [X] T042 [US3] **Remove** `apps/web/features/resources/components/category-section-accordion.tsx` and `apps/web/shared/components/ui/accordion.tsx` — a tab no longer stacks blocks, and the shadcn primitive has no other consumer (research.md Decision 10)
- [X] T043 [P] [US3] Write `apps/api/src/resources/category-content.service.spec.ts` — derived from reference and never from itself, locale resolution, category order, absent categories omitted
- [X] T044 [P] [US3] Update `apps/web/app/[locale]/(protected)/projects/[id]/client-main-tabs.test.tsx` — one text per tab, frozen order, no tab for an empty category, and that no draft or reference content can reach this surface
- [X] T045 [P] [US3] Update the `Resource` fixtures in the remaining web tests for the new shape

**Checkpoint**: the full loop is visible end to end. This is the demo.

---

## Phase 6: User Story 4 — Removing a document removes its contribution (Priority: P2)

**Goal**: deleting an absorbed document regenerates the categories it fed as if it had never existed.

**Independent Test**: add two documents where the second revises a date, delete it, and confirm the regenerated draft carries the first document's version and has lost the second's additions (quickstart.md Scenario 5).

**Depends on**: US1 for extracts and US2 for the rebuild request — both already exist by here.

- [X] T046 [US4] Update `delete()` in `apps/api/src/resources/resources.service.ts` — cascade removes the document's extracts; for each category it fed, submit a rebuild over the surviving extracts and open a draft with trigger `document_removed`
- [X] T047 [US4] Handle the empty case in the same path — a category left with no extract has its `CategoryReference` and `CategoryContent` removed outright, with no analysis request and no draft (FR-020)
- [X] T048 [P] [US4] Extend `apps/api/src/resources/resources.service.spec.ts` — exactly the fed categories are rebuilt, the deletion draft enters the same queue, the last-extract case removes reference and client content, and deleting a document whose own draft is still pending abandons that draft (spec Edge Cases)

**Checkpoint**: the corpus is fully mutable in both directions.

---

## Phase 7: User Story 5 — The system asks before it guesses (Priority: P3)

**Goal**: contradictions and consequential gaps are raised as a handful of skippable questions rather than arbitrated in silence.

**Independent Test**: ingest two documents contradicting each other on a client-visible fact; confirm a question is raised rather than one being picked, and that skipping it yields a draft where the point is explicitly flagged (quickstart.md Scenario 7).

- [X] T049 [US5] Extend the ingestion tool schema and prompt in `apps/api/src/resources/reference-analysis.client.ts` — up to five questions, ranked by impact on what the client will read, only for ambiguities, contradictions and gaps that change that; never style or completeness for its own sake (FR-021, FR-022)
- [X] T050 [US5] Persist questions against the draft in `apps/api/src/resources/resource-batch-sweep.service.ts` and set the draft to `awaiting_answers` when any exist
- [X] T051 [US5] Add answer and skip handling to `apps/api/src/resources/category-reference.service.ts` — answering feeds the next rebuild; skipping is always allowed, and every unanswered point is explicitly marked in the reference content rather than silently resolved (FR-023)
- [X] T052 [US5] Add the questions surface to `apps/web/features/resources/components/reference-draft-queue.tsx` plus its strings in both message catalogues
- [X] T053 [P] [US5] Tests across the three layers — the five-question cap and ranking, validation succeeding with questions unanswered, unanswered points marked in the content

**Checkpoint**: all five stories are functional.

---

## Phase 8: Verification & Polish

**Not a cleanup phase.** Every removal happened in the phase that orphaned it; this proves it.

- [X] T054 Run `pnpm knip` and `pnpm i18n:orphans`. Anything reported is a removal missed in an earlier phase — fix it there rather than adding an ignore rule (FR-025, SC-009)
- [X] T055 Run `pnpm test:cov` from the repo root and close whatever the deletions opened. This feature removes a great deal of tested code, so the gate must be re-measured, not assumed
- [X] T056 [P] Update `docs/PRODUCT.md` — the two layers, the category as the unit, one validation gate, no per-document publication
- [X] T057 [P] Mark `specs/014-category-sections/spec.md` as superseded by 015, recording that "one document = one section" broke on the second document
- [ ] T058 Walk quickstart.md Scenarios 1–6 against a running stack, allowing for real batch latency between each action and its assertion
- [ ] T059 Perform the one-off SC-003 check by hand — six documents ingested one at a time versus the same six in a single pass, comparing the two reference layers for lost facts (research.md Decision 7). There is no automated form of this; do it once before calling the feature done

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: none. Do it first anyway — a baseline taken after the demolition is worthless
- **Phase 2 (Foundational)**: **blocks everything**
- **Phase 3 (US1)**: after Phase 2. Restores the build
- **Phase 4 (US2)**: after Phase 3 — the queue needs drafts to show
- **Phase 5 (US3)**: after Phase 4 — derivation is triggered by acceptance
- **Phase 6 (US4)**: after Phase 4 (rebuild request) — can run in parallel with Phase 5
- **Phase 7 (US5)**: after Phase 4
- **Phase 8**: after every shipped phase

### Within a story

Schema before service, service before controller, API before UI. Tests accompany the change that introduces them rather than trailing it (Constitution I).

### Parallel opportunities

- T003 alongside T001–T002
- T004 and T010 (different packages)
- T018, T019, T020 (US1 specs, different files)
- T021, T028, T029 and the UI trio T031, T032, T035 within US2
- T043, T044, T045 within US3
- Phase 6 entirely in parallel with Phase 5, by a second person
- T056, T057 in polish

---

## Implementation Strategy

### MVP scope

**Phases 2 + 3 + 4.** That gets a contributor from a pile of documents to validated reference documentation — which has standalone value even before the client sees anything, since it is the structured doc they never had. But note it has **no client-visible change**: Phase 5 is what the demo needs.

### Incremental delivery

1. Phase 1 → verification tooling green on the untouched tree
2. Phase 2 → data model in place (build red in between; keep it one commit range)
3. Phase 3 → the reference layer fills, verifiable in the database
4. Phase 4 → the contributor drives the loop
5. Phase 5 → the client reads it → **demo**
6. Phase 6 → deletion works
7. Phase 7 → questions
8. Phase 8 → prove nothing was left behind

### Parallel team strategy

Phase 2 is a single-owner job — one migration and one set of shapes; splitting it invites drift. After Phase 4, one person can take Phase 5 while another takes Phase 6; they touch different files.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- Phases 2–3 leave the repo non-building in between; T009 is where the compiler tells you the full extent
- Commit per task or per logical group; branch is `feat/document-reference-layer`
- If a task seems to require a decision neither spec.md nor research.md made, stop and ask rather than decide (Constitution IV)
- Two things in here have no automated test and are meant to be done by hand: T059 (erosion) and the fact-survival spot-check inside quickstart Scenario 1. Skipping them is a choice, not an oversight — make it knowingly
