---

description: "Task list for The Reference Document"
---

# Tasks: The Reference Document

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: Required. New code ships with tests that keep the 80% gate green, written as part of the same change.

## Format: `[ID] [P?] [Slice] Description`

- **[P]**: can run in parallel — different files, no dependency on incomplete work

---

## Slice 1 — The document exists 🎯

**Goal**: a developer opens the documentation page, sees a short state instead of a hundred rows, and reads their reference document on its own screen.

### The developer's language

- [ ] T001 Add `locale` to `User` in `apps/api/prisma/schema.prisma`, nullable, and migrate
- [ ] T002 Send the interface locale on every call from `apps/web/shared/lib/api-client.ts`, and cover it in `api-client.test.ts`
- [ ] T003 Persist it in `apps/api/src/auth/session.guard.ts` when it differs from what the user row holds, with its spec — a write on every request would be waste, so only a change writes

### The contract

- [ ] T004 Create `packages/schemas/src/reference-document.ts`: the document, its parts, its blocks, its summary; re-export from `index.ts`
- [ ] T005 [P] Write `packages/schemas/src/reference-document.test.ts` covering accepted and rejected shapes, including a block citing nothing

### The data

- [ ] T006 Add `ReferenceDocument` and `ReferenceDocumentStatus` to `apps/api/prisma/schema.prisma` per plan Decision 1
- [ ] T007 Add `activeReferenceDocumentId` (unique, nullable) and `referenceNeedsRewrite` to `ProjectSource`; migrate
- [ ] T008 Add `reference_document` to `GenerationOperationType`, to `GENERATION_POLICY_STAGE_KEYS`, and to `GENERATION_POLICY_JSON` in `apps/api/.env.example` — the policy is strict, so the API will not boot without it

### The stage

- [ ] T009 Create `apps/api/src/documentation/reference/prompts/reference-document.prompt.ts`: the canonical statements, the developer's language, named parts, continuous prose, mark an unresolved statement in place, say plainly when there is nothing usable
- [ ] T010 Create `apps/api/src/documentation/reference/reference-output.schema.ts`: parts, blocks, outcome. Nothing echoed back — no identifier the model has to copy
- [ ] T011 [P] Write `reference-output.schema.spec.ts`, including that a "nothing usable" outcome cannot carry parts
- [ ] T012 Create `apps/api/src/documentation/reference/reference-document.handler.ts` — `buildRequest`, `apply` validating every cited id against what was sent, `onTerminalFailure` releasing the slot
- [ ] T013 Write `reference-document.handler.spec.ts`, including that a block citing a statement we never sent is refused and nothing is written

### The service and routes

- [ ] T014 Create `apps/api/src/documentation/reference/reference-document.service.ts`: trigger a write (one at a time), read the current one, read the summary
- [ ] T015 Write `reference-document.service.spec.ts` covering one-at-a-time and the hidden-not-found rule for a caller without access
- [ ] T016 Create `apps/api/src/documentation/controllers/reference-document.controller.ts` with `POST /reference`, `GET /reference`, `GET /reference/summary`; register in the module
- [ ] T017 Write `reference-document.controller.spec.ts`
- [ ] T018 Mark the source as needing a rewrite wherever the canonical head moves, beside the existing `markSectionsForRefresh` in `source-revision.service.ts` and `document-removal.service.ts`, with tests

### The screens

- [ ] T019 Add the reference calls to `apps/web/features/documentation/api.ts` and hooks to `hooks.ts` — body objects, never `JSON.stringify`, and an absent document returns `null`
- [ ] T020 Create `apps/web/app/[locale]/(protected)/projects/[id]/documentation/reference/page.tsx` and its feature component: named parts, continuous text, provenance and correction on demand per sentence
- [ ] T021 [P] Write the reference screen tests, including the never-written, being-written, failed and nothing-usable states
- [ ] T022 Replace the statement list in `documentation-workspace.tsx` with a short state and a way to the document; delete `canonical-source-view.tsx` and its test once nothing imports them
- [ ] T023 [P] Update `documentation-workspace.test.tsx` and add the summary component's tests
- [ ] T024 Add every string these screens need to `apps/web/messages/fr.json` and `en.json`

### Verification

- [ ] T025 `pnpm test:cov`, `pnpm lint`, `pnpm knip`, `pnpm i18n:orphans`, `pnpm build` — all green
- [ ] T026 Open the real app: a document is written, reads top to bottom, every sentence traces to its source, and the working page fits in three screens

---

## Slice 2 — The questions

- [ ] T027 Carry the developer's locale into the consolidation prompt so points to clarify are written in it, with tests
- [ ] T028 Build the clarification card: one at a time whatever the number, position shown, skippable, no arrows on a single point
- [ ] T029 [P] Its tests, including a single point and the set closing on the last answer
- [ ] T030 Replace `clarifications-panel.tsx` on the working page with the card, and delete what it leaves behind

---

## Slice 3 — The guard

- [ ] T031 Add `awaiting_relevance` to `SourceDocumentStatus`, and `document_relevance` to the generation stages and the policy; migrate
- [ ] T032 The relevance prompt and output contract: belongs / does not belong, and one sentence saying why
- [ ] T033 The handler, skipping the project's first document entirely
- [ ] T034 Raise the verdict as an ordinary `Clarification` carrying the document it concerns
- [ ] T035 Answering it resumes consolidation or removes the document through the existing removal path
- [ ] T036 Tests, including a document on a genuinely new subject that must not be flagged — the false positive that would make the check worse than useless

---

## Slice 4 — The download

- [ ] T037 Print rules on the reference screen: drop the navigation and the actions, keep the parts and the marked gaps
- [ ] T038 A download action opening the browser's print dialog, unavailable while the document is being written
- [ ] T039 [P] Tests for the unavailable state

---

## Dependencies

Slice 1 blocks nothing else but is worth having first — it is the complaint that started the feature. Slices 2, 3 and 4 are independent of each other and can be dropped without the feature failing.
