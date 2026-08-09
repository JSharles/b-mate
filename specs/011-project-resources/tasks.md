---
description: "Task list for Project Resources"
---

# Tasks: Project Resources

**Input**: Design documents from `/specs/011-project-resources/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (all present, no `contracts/` — matching `specs/005`/`specs/009`/`specs/010`'s convention)

**Tests**: Included — Constitution Principle I (Test-First Coverage Discipline) is non-negotiable for this repo; new logic ships with tests in the same change.

**Organization**: Four user stories. US1 (upload → processing) and US2 (developer review/publish gate) are both P1 and tightly coupled — US2 has nothing to review without US1, and US1's resources are worthless without US2's gate (nothing would ever reach a client legitimately). US3 (client browsing) is the other P1 half of the core value. US4 (Notion) is P2 and fully additive — it reuses US1/US2's processing pipeline and review/publish/delete actions, only adding a second intake path.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to US1/US2/US3/US4

---

## Phase 1: Setup

- [X] T001 [P] Add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, and `mammoth` to `apps/api` dependencies (`pnpm --filter api add ...`).
- [X] T002 [P] Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `RESOURCE_VULGARIZATION_MODEL` (documented default: `claude-sonnet-5`) to `apps/api/.env.example`, with a comment pointing at quickstart.md's R2 provisioning prerequisite — no real values committed.

**Checkpoint**: Dependencies and env var contract documented. R2 bucket/credentials still need the user to provision them manually before T007/T017 can be exercised against a real bucket (plan.md Constitution Check) — tasks below can still be written and unit-tested with the S3 client mocked.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared types, and the storage client every user story's resource-creation path depends on.

**⚠️ CRITICAL**: No user story work can begin until T003/T004 (schema) land; T005–T008 can proceed in parallel with each other once T001 is done.

- [X] T003 Add `ResourceSource`, `ResourceStatus` enums and `Resource`, `NotionConnection` models to `apps/api/prisma/schema.prisma` (data-model.md).
- [X] T004 Generate and apply the migration: `pnpm --filter api prisma:migrate` (name suggestion: `add_resources`); depends on T003.
- [X] T005 [P] Add `packages/schemas/src/resource.ts`: `ResourceSchema` (list/detail response shape — id, projectId, source, status, title, timestamps, and, when present, vulgarizedTitle/vulgarizedContent, originalFileUrl/originalFileName/originalFileMimeType, notionPageUrl, failureReason), `CreateResourceNotionRequestSchema` (token + pageUrl). The upload request has no JSON schema — it's `multipart/form-data`, validated by a NestJS DTO instead (T018).
- [X] T006 [P] Create `apps/api/src/resources/resources.module.ts` (imports `AuthModule` for `SessionGuard`, empty `ResourcesController`/`ResourcesService` registered) — skeleton other tasks extend.
- [X] T007 [P] Create `apps/api/src/resources/resource-storage.client.ts`: `uploadFile(key, buffer, mimeType)`, `getPresignedDownloadUrl(key, ttlSeconds)`, `deleteFile(key)` — thin wrapper over `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` against the R2 bucket (research.md Decision 6).
- [X] T008 [P] `apps/api/src/resources/resource-storage.client.spec.ts`: mocked S3 client — upload/presign/delete each call the SDK with the expected bucket/key; presign respects the given TTL.

**Checkpoint**: Schema, shared types, and storage client ready. All four user stories can now proceed (US1 first, since US2–US4 build on its resources).

---

## Phase 3: User Story 1 - A developer adds a resource by uploading a document (Priority: P1) 🎯 MVP (part 1 of 2 — see US2)

**Goal**: Uploading a PDF/DOCX/image creates a resource immediately in "processing" state; AI processing (Claude Batch, whole-document/vision for PDF/image, text+image extraction for DOCX) completes asynchronously and moves it to "ready for review," visible only to the developer throughout.

**Independent Test**: Upload a PDF with a diagram to a project with no resources; confirm "processing" appears immediately, then transitions to "ready for review" with a draft that describes the diagram — never visible to a client (quickstart.md Scenario 1, steps 1–3).

### Tests for User Story 1 ⚠️ write first, confirm they fail before implementing

- [X] T009 [P] [US1] `apps/api/src/resources/resources.controller.spec.ts`: `POST :projectId/resources` (upload) — a contributor uploading a valid PDF/DOCX/PNG/JPEG under 25 MB gets a 201 with the resource in `processing` state; a non-contributor/non-member gets the same 404 other endpoints already return; an unsupported MIME type or a file over 25 MB is rejected with a clear 400, no resource created (FR-013).
- [X] T010 [P] [US1] `apps/api/src/resources/resources.service.spec.ts`: `createFromUpload()` — uploads the file via `ResourceStorageClient`, creates a `Resource` row (`status: processing`, `source: upload`), submits a batch job via `DocumentVulgarizationClient` and stores the returned `anthropicBatchId`; a storage or batch-submission failure rolls back cleanly (no orphaned R2 object or half-created row).
- [X] T011 [P] [US1] `apps/api/src/resources/document-vulgarization.client.spec.ts`: `submitBatch()` sends a PDF/image as a native document/image content block (mocked Anthropic client) using the model from `RESOURCE_VULGARIZATION_MODEL` (defaulting to `claude-sonnet-5` when unset), as **two batch requests in one `batches.create()` call** — `custom_id: 'en'` and `custom_id: 'fr'`, one per supported locale (research.md Decision 3, revised); for a `.docx` buffer, text (and any extractable embedded images) are extracted via `mammoth` first and sent as text/image content instead (research.md Decisions 1–3). `retrieveBatchResult()` polls the batch via `batches.retrieve()`, and once `processing_status: 'ended'`, reads both results from `batches.results()`, parsing each into `{ locale, title, content }` via a Zod-validated tool-call output (mirroring `AnthropicVulgarizationClient`'s pattern) — returns a "not yet done" status while `processing_status !== 'ended'`, and a "failed" status if either locale's result isn't `succeeded`.
- [X] T012 [P] [US1] `apps/api/src/resources/resource-batch-sweep.service.spec.ts`: the sweep finds resources with a non-null `anthropicBatchId` still in `processing`; for a batch that ended with both the `en` and `fr` custom_id results succeeding, it creates two `ResourceVulgarization` rows (one per locale), clears `anthropicBatchId`, and sets `status: ready_for_review`; if either locale's result errored (or the batch as a whole failed), or a `.docx` whose text extraction failed earlier, it sets `status: failed` with a `failureReason` and clears `anthropicBatchId` — no partial one-locale-only `ready_for_review` state; a resource with no `anthropicBatchId` (or already terminal) is left untouched; one failing resource doesn't stop the sweep from processing the rest (mirrors `TaskVulgarizationService.sweep()`'s existing per-connection isolation).
- [X] T013 [P] [US1] `apps/web/features/resources/components/add-resource-dialog.test.tsx`: the upload tab has a file input and submit button; submitting calls the upload mutation with the selected file; on success, the dialog closes and the new resource (in "processing") is reflected (via query invalidation).
- [X] T014 [P] [US1] `apps/web/features/resources/components/resources-list.test.tsx` (developer view): renders a tile per resource with a status badge for `processing`/`ready_for_review` (in addition to `published`, exercised in US3) — a developer sees all of these, not just published ones (FR-005).

### Implementation for User Story 1

- [X] T015 [US1] Implement `DocumentVulgarizationClient.submitBatch()`/`retrieveBatchResult()` in `apps/api/src/resources/document-vulgarization.client.ts` per research.md Decisions 1–3 (system prompt: vulgarize while preserving important information and describing diagrams/images, per spec.md FR-003) — makes T011 pass.
- [X] T016 [US1] Implement the `.docx` extraction path (`mammoth`) inside `document-vulgarization.client.ts`, feeding extracted text/images into the same `submitBatch()` call shape as PDF/image (research.md Decision 2) — covered by T011.
- [X] T017 [US1] Implement `ResourcesService.createFromUpload()` in `apps/api/src/resources/resources.service.ts`: contributor membership check (local copy, Constitution III — mirrors `BoardConnectionsService.assertIsContributor`), MIME/size validation (FR-013), upload to R2 (T007), create `Resource` row, submit batch (T015), store `anthropicBatchId` — makes T010 pass. Depends on T003/T004, T007, T015.
- [X] T018 [US1] Implement `POST :projectId/resources` in `apps/api/src/resources/resources.controller.ts` using `FileInterceptor` (multer, 25 MB limit + MIME allowlist) — makes T009 pass. Depends on T017.
- [X] T019 [US1] Implement `ResourceBatchSweepService` (`@Cron`, mirrors `TaskVulgarizationService.sweep()`'s structure) in `apps/api/src/resources/resource-batch-sweep.service.ts`, registered in `resources.module.ts` — makes T012 pass. Depends on T003/T004, T015.
- [X] T020 [US1] Implement the upload tab of `apps/web/features/resources/components/add-resource-dialog.tsx` (file picker + submit) — makes T013 pass.
- [X] T021 [US1] Implement `apps/web/features/resources/components/resources-list.tsx` (developer view: tiles with status badges for all states) — makes T014 pass.
- [X] T022 [P] [US1] Implement `apps/web/features/resources/components/resource-detail-page-content.tsx` (developer view, read-only for now — publish/delete buttons land in US2): shows title + vulgarized content once `ready_for_review`, a "still processing" state otherwise.
- [X] T023 [P] [US1] Wire `ResourcesList` + `AddResourceDialog` into the contributor branch of `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`, replacing the `documentation` `ComingSoonCard` (spec.md "Supersedes").

**Checkpoint**: A developer can upload a document and watch it reach "ready for review" with a diagram-aware draft — nothing client-visible yet (quickstart.md Scenario 1 steps 1–3, Scenario 2, Scenario 3).

---

## Phase 4: User Story 2 - A developer reviews and publishes a processed resource (Priority: P1) 🎯 MVP (part 2 of 2)

**Goal**: A developer can publish a "ready for review" resource (making it client-visible) or delete it in any state.

**Independent Test**: With a resource in "ready for review," publish it and confirm it becomes reachable by a client (US3); separately, delete a resource in each state and confirm it's gone (quickstart.md Scenario 1 steps 5–6, Scenario 5).

### Tests for User Story 2

- [X] T024 [P] [US2] Extend `resources.controller.spec.ts`: `POST :projectId/resources/:resourceId/publish` — succeeds only from `ready_for_review`; a contributor gets a clear rejection attempting to publish a `processing`/`failed`/already-`published` resource; a non-contributor gets the standard 404.
- [X] T025 [P] [US2] Extend `resources.controller.spec.ts`: `DELETE :projectId/resources/:resourceId` — succeeds from any state (`processing`, `ready_for_review`, `published`, `failed`); a non-contributor gets the standard 404.
- [X] T026 [P] [US2] Extend `resources.service.spec.ts`: `publish()` sets `status: published`, `publishedAt`, `publishedByUserId`, only from `ready_for_review` (throws otherwise); `delete()` removes the `Resource` row and, for an `upload`-sourced one, also deletes the R2 object via `ResourceStorageClient.deleteFile()` (and the `NotionConnection` row via cascade for a `notion`-sourced one, verified in US4).
- [X] T027 [P] [US2] `apps/web/features/resources/components/resource-detail-page-content.test.tsx` (developer view): a `ready_for_review` resource shows Publish and Delete buttons; a `published`/`processing`/`failed` resource shows only Delete (no Publish unless `ready_for_review`, per FR-016); clicking Publish/Delete calls the corresponding mutation.

### Implementation for User Story 2

- [X] T028 [US2] Implement `ResourcesService.publish()` — makes the publish half of T026 pass. Depends on T017.
- [X] T029 [US2] Implement `ResourcesService.delete()`, including R2 object cleanup (T007) — makes the delete half of T026 pass. Depends on T017, T007.
- [X] T030 [US2] Implement `POST :projectId/resources/:resourceId/publish` and `DELETE :projectId/resources/:resourceId` in `resources.controller.ts` — makes T024/T025 pass. Depends on T028, T029.
- [X] T031 [US2] Wire Publish/Delete buttons into `resource-detail-page-content.tsx` (developer view) — makes T027 pass. Depends on T022, T030.

**Checkpoint**: quickstart.md Scenario 1 (full run) and Scenario 5 pass — the developer-facing half of the feature (US1 + US2) is complete and independently testable end to end.

---

## Phase 5: User Story 3 - A client browses and reads a project's resources (Priority: P1)

**Goal**: A client sees only published resources as tiles, can open one to read the vulgarized content, and can preview/download the original.

**Independent Test**: As a client on a project with one published and one still-in-review resource, confirm only the published one appears, is readable, and its original is reachable (quickstart.md Scenario 1 step 6–7, Scenario 6).

### Tests for User Story 3

- [X] T032 [P] [US3] Extend `resources.controller.spec.ts`: `GET :projectId/resources` for a client-role member returns only `published` resources; for a contributor, returns all. `GET :projectId/resources/:resourceId` for a client-role member returns the standard 404 for a non-published resource (processing/ready_for_review/failed) — identical shape to a nonexistent one (FR-010, spec.md Edge Cases).
- [X] T033 [P] [US3] Extend `resources.service.spec.ts`: `findAllForProject()`/`findOne()` apply the role-based visibility above; both take a `locale` param and resolve `vulgarizedTitle`/`vulgarizedContent` from the matching `ResourceVulgarization` row (data-model.md, mirrors `CurrentTaskService`'s existing locale handling); `findOne()` on a `published`, `upload`-sourced resource attaches a presigned `originalFileUrl` (short TTL) via `ResourceStorageClient.getPresignedDownloadUrl()`; on a `notion`-sourced resource, returns `notionPageUrl` instead, no file URL.
- [X] T034 [P] [US3] `apps/web/features/resources/components/resources-list.test.tsx` (client view): renders a tile only for each published resource, none for other states.
- [X] T035 [P] [US3] `resource-detail-page-content.test.tsx` (client view): read-only — no Publish/Delete buttons; renders an in-browser preview for PDF/image (`<iframe>`/`<img>` against the presigned URL) with a download link, or, for `.docx`, a download-only link (no preview); for a Notion-sourced resource, a link back to the Notion page instead of preview/download.

### Implementation for User Story 3

- [X] T036 [US3] Implement `ResourcesService.findAllForProject()`/`findOne()` role-based filtering and presigned-URL attachment — makes T033 pass. Depends on T007, T017.
- [X] T037 [US3] Implement `GET :projectId/resources` and `GET :projectId/resources/:resourceId` in `resources.controller.ts` — makes T032 pass. Depends on T036.
- [X] T038 [US3] Create `apps/web/app/[locale]/(protected)/projects/[id]/resources/[resourceId]/page.tsx` (resource detail route, both roles).
- [X] T039 [US3] Extend `resource-detail-page-content.tsx` with the client-facing read-only rendering (preview/download/Notion-link, no action buttons) — makes T035 pass. Depends on T022, T038.
- [X] T040 [US3] [P] Extend `resources-list.tsx` for the client role-filtered view (or confirm T021's implementation already role-agnostically renders whatever the API returns, in which case this is verification only) — makes T034 pass.
- [X] T041 [US3] Wire `ResourcesList` into the client branch of `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`, replacing the `clientDocumentation` `ComingSoonCard`.

**Checkpoint**: quickstart.md Scenario 1 (full run, both roles) and Scenario 6 pass — US1+US2+US3 together deliver the feature's complete core value (upload → review → publish → client reads it).

---

## Phase 6: User Story 4 - A developer adds a resource by connecting a Notion page (Priority: P2)

**Goal**: Connecting a Notion page creates a resource that goes through the exact same processing/review/publish/delete lifecycle as an upload.

**Independent Test**: Connect a valid Notion page; confirm it reaches "ready for review" with a text-based vulgarized draft, then publish/delete it exactly like an uploaded resource (quickstart.md Scenario 4).

### Tests for User Story 4

- [X] T042 [P] [US4] `apps/api/src/resources/notion.client.spec.ts`: `fetchPageContent()` recursively retrieves block children (mocked Notion API) and flattens them to plain text; throws a clear, typed error for an invalid token or an inaccessible page (research.md Decision 5, spec.md US4 AC3).
- [X] T043 [P] [US4] Extend `resources.controller.spec.ts`: `POST :projectId/resources/notion` — a contributor providing a valid token + page URL gets a 201 with the resource in `processing`; an invalid token/inaccessible page returns a clear 400 and no resource is created; non-contributor gets the standard 404.
- [X] T044 [P] [US4] Extend `resources.service.spec.ts`: `createFromNotion()` — verifies access via `NotionClient` before creating anything (mirrors `BoardConnectionsService.connect()`'s re-verify-before-persist pattern), encrypts the token (reusing `token-encryption.ts`, research.md Decision 7), creates `Resource` (`source: notion`) + `NotionConnection` rows, submits a batch job with the flattened text (T015's text path).
- [X] T045 [P] [US4] `apps/web/features/resources/components/add-resource-dialog.test.tsx`: extend for the Notion tab — token + page URL fields, submit calls the Notion-connect mutation; a submission error (invalid token/page) shows inline, dialog stays open.

### Implementation for User Story 4

- [X] T046 [US4] Implement `NotionClient.fetchPageContent()` in `apps/api/src/resources/notion.client.ts` — makes T042 pass.
- [X] T047 [US4] Implement `ResourcesService.createFromNotion()` — makes T044 pass. Depends on T003/T004, T015, T046.
- [X] T048 [US4] Implement `POST :projectId/resources/notion` in `resources.controller.ts` — makes T043 pass. Depends on T047.
- [X] T049 [US4] Extend `add-resource-dialog.tsx` with the Notion tab (token + page URL inputs) — makes T045 pass. Depends on T020.
- [X] T050 [US4] Extend `ResourcesService.delete()`/`resources.service.spec.ts` coverage to confirm the `NotionConnection` row is removed (via `onDelete: Cascade` from `Resource`, or explicit deletion if not cascaded) when a `notion`-sourced resource is deleted — closes the loop opened in T026.

**Checkpoint**: quickstart.md Scenario 4 passes — Notion is a fully working second intake path, reusing US1–US3's processing/review/publish/client-view machinery unchanged.

---

## Phase 7: Polish & Cross-Cutting

- [X] T051 [P] Add `Projects.ResourcesList`, `Projects.AddResourceDialog`, `Projects.ResourceDetailPage` (or similarly-scoped) translation keys to `apps/web/messages/en.json`/`fr.json`; remove the now-superseded `documentation`/`clientDocumentation` `ComingSoonCard` keys once confirmed unused elsewhere.
- [X] T052 [P] Update `docs/PRODUCT.md` if it documents the "Documentation" placeholder anywhere specific — otherwise confirm (as done for specs/010) that nothing there makes an now-inaccurate claim; no changes if not.
- [X] T053 Remove the `documentation`/`clientDocumentation` `ComingSoonCard` usages entirely from `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx` once T023/T041 land (should already be done by those tasks — this is a verification pass, not new work, unless something was missed).
- [X] T054 Run `pnpm lint`, `pnpm typecheck`, `pnpm test:cov` from the repo root; fix any fallout across both apps.
- [ ] T055 Walk through quickstart.md end-to-end against a real Cloudflare R2 bucket, a real Notion integration, and the real Anthropic Batch API — all 6 scenarios. Requires the manual R2/Notion prerequisites (quickstart.md) to be in place first; flag to the user if they aren't yet, rather than skipping verification silently.

---

## Dependencies & Execution Order

- **Setup (T001–T002)**: no dependencies, run in parallel.
- **Foundational (T003–T008)**: T004 depends on T003; T005–T008 are independent of each other and of T003/T004 (T008 depends on T007) — can proceed in parallel threads once T001 lands.
- **US1 tests (T009–T014)**: independent of each other — write and confirm-failing in parallel; all depend on Foundational.
- **US1 implementation (T015–T023)**: T015 → T016 (same file) → T017 (needs T007, T015) → T018 (needs T017); T019 independent of T018, needs T015; T020/T021 independent of each other, need their respective test files to target; T022/T023 depend on T020/T021 existing (component composition).
- **US2 (T024–T031)**: all depend on US1 being complete (T017 especially); T028/T029 can proceed in parallel (different methods, same file — coordinate); T030 needs both; T031 needs T030 and T022.
- **US3 (T032–T041)**: all depend on US1 (T017) and, for the "only after publish" tests, US2 (T028) being complete; T036 → T037 → (T038, T039, T040, T041 in parallel).
- **US4 (T042–T050)**: depends on Foundational and US1's T015 (text-processing path) — otherwise independent of US2/US3, can be built in parallel with them once US1 lands.
- **Polish (T051–T055)**: T051/T052 independent of code and of each other; T053 depends on T023/T041; T054/T055 come last.

## Parallel Example: Foundational

```
# Independent tracks once T001 (deps) lands:
Task: "Add Resource/NotionConnection schema + enums" (T003)
Task: "Create resources.module.ts skeleton" (T006)
Task: "Create resource-storage.client.ts" (T007)
Task: "Add packages/schemas/src/resource.ts" (T005)
```

## Implementation Strategy

### MVP First (User Stories 1 + 2 only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1) + Phase 4 (US2) — these two together are the smallest slice that's actually safe to ship: nothing reaches a client without deliberate developer publication.
3. **STOP and VALIDATE**: quickstart.md Scenario 1 end-to-end (upload → processing → ready for review → publish), Scenario 5 (delete in each state).
4. US3 (client browsing) technically ships separately in terms of task phases, but has no real standalone value without US1/US2 already live — in practice, ship all three P1 stories together as the MVP.

### Incremental Delivery

1. Foundational → Foundation ready.
2. US1 + US2 + US3 (all P1) → the complete core value → ship.
3. US4 (Notion, P2) → an additive second intake path → ship whenever ready, no rush relative to the P1 slice.

## Notes

- Commit after each task or logical group, per repo convention (Conventional Commits, only when the user explicitly asks for a commit).
- Verify each spec'd test (T009–T014, T024–T027, T032–T035, T042–T045) actually fails before writing its corresponding implementation — the constitution's Test-First principle is non-negotiable here, not aspirational.
- T007/T017's R2 calls and T015's Anthropic Batch calls are mocked in unit tests throughout Phases 3–6 — only T055 (final walkthrough) exercises the real external services, once the user has provisioned the R2 bucket and a test Notion integration (quickstart.md Prerequisites).
- The exact shape of `DocumentVulgarizationClient`'s Batch API submission/polling calls (T015/T019) is an implementation judgment call within research.md Decision 4's constraints — resolve exact Anthropic SDK method names/shapes against the installed `@anthropic-ai/sdk` version's types during implementation, not by guessing further here.
