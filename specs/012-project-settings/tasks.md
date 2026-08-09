---
description: "Task list for Project Settings"
---

# Tasks: Project Settings

**Input**: Design documents from `/specs/012-project-settings/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (all present, no `contracts/` — matching `specs/005`/`specs/009`/`specs/010`/`specs/011`'s convention)

**Tests**: Included — Constitution Principle I (Test-First Coverage Discipline) is non-negotiable for this repo; new logic ships with tests in the same change.

**Organization**: Three user stories. US1 (P1, Settings page) and US2 (P2, Add Resource dialog redirect) both depend on the Foundational phase, which does the real structural work — extracting Notion connection management into its own `notion-connection` module/feature so Settings can compose it without violating feature isolation (research.md Decision 1). US2 additionally depends on US1 (its "connect first" link must resolve to a real Settings route). US3 (P3, connection-status summary on the project page) is a nice-to-have on top of US1 and can be dropped from an MVP cut without blocking US1/US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to US1/US2/US3

---

## Phase 1: Setup

No setup tasks. This feature reuses existing infrastructure end to end: no new npm dependencies, no new Prisma migration (`NotionConnection` is already project-scoped per specs/011's same-day revision), no new env vars (`BOARD_CONNECTION_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, GitHub OAuth vars are all already provisioned).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract Notion connection management (Prisma access, encryption, the Notion HTTP client, and its own endpoints) out of the `resources` module into a new, symmetric `notion-connection` module — mirroring `board-connections`' already-independent shape (research.md Decision 1). Both user stories depend on this existing first: US1 needs the new connect/disconnect endpoints and frontend feature to build Settings; US2 needs the shared read-only status hook and the simplified resource-creation contract.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for Foundational ⚠️ write first, confirm they fail before implementing

- [X] T001 [P] `apps/api/src/notion-connection/notion.client.spec.ts` (moved from `apps/api/src/resources/notion.client.spec.ts`, existing `fetchPage()` tests preserved as-is): add tests for the new `verifyToken(token)` — resolves for a 2xx from `GET /v1/users/me`, throws `NotionAccessError` for a non-2xx (research.md Decision 2).
- [X] T002 [P] `apps/api/src/notion-connection/notion-connection.service.spec.ts`: `findForProject()` returns `{ connected: false }` when no row exists, `{ connected: true }` when one does; `connect()` verifies the token via `NotionClient.verifyToken()` before upserting (rejects with a clear error and persists nothing if verification fails — mirrors `BoardConnectionsService.connect()`'s re-verify-before-persist pattern), encrypts the token, upserts on `projectId`; `disconnect()` is idempotent (`deleteMany`, no error when nothing is connected); all three reject with the standard not-found for a client-role member or non-member.
- [X] T003 [P] `apps/api/src/notion-connection/notion-connection.controller.spec.ts`: `GET/POST/DELETE projects/:projectId/notion-connection` each delegate to `NotionConnectionService` with the current user/project id (and, for `POST`, the request body's `token`); `DELETE` returns `204`.
- [X] T004 [P] Update `apps/api/src/resources/resources.service.spec.ts`: `createFromNotion()` now takes no `token` parameter — it resolves the project's stored token via an injected `NotionConnectionService` mock, and rejects with a clear 400 (pointing at Settings) when that service reports no connection; remove the `hasNotionConnection`/direct-`notionConnection`-Prisma-access tests (moved to T002).
- [X] T005 [P] Update `apps/api/src/resources/resources.controller.spec.ts`: `connectNotion()` delegates with `(userId, projectId, pageUrl)` only (no `token`); remove the `hasNotionConnection` endpoint tests (superseded by T003).

### Implementation for Foundational

- [X] T006 Move `apps/api/src/resources/notion.client.ts` → `apps/api/src/notion-connection/notion.client.ts` (delete the old path); add `verifyToken(token): Promise<void>` calling `GET /v1/users/me`, reusing the existing `request()` helper and `NotionAccessError` — makes T001 pass.
- [X] T007 [P] Create `apps/api/src/notion-connection/dto/create-notion-connection.dto.ts`: `{ token: string }` (class-validator, mirrors `CreateBoardConnectionDto`'s token field).
- [X] T008 Create `apps/api/src/notion-connection/notion-connection.service.ts`: `findForProject(userId, projectId): Promise<{ connected: boolean }>`, `connect(userId, projectId, token): Promise<{ connected: true }>` (verify-then-upsert, research.md Decision 2), `disconnect(userId, projectId): Promise<void>` (idempotent), plus an internal `getDecryptedToken(projectId): Promise<string | null>` for `resources`' use — makes T002 pass. Depends on T006.
- [X] T009 Create `apps/api/src/notion-connection/notion-connection.controller.ts`: `@Controller('projects/:projectId/notion-connection')`, `GET`/`POST`/`DELETE` per data-model.md — makes T003 pass. Depends on T007, T008.
- [X] T010 Create `apps/api/src/notion-connection/notion-connection.module.ts`: imports `AuthModule`; providers `[NotionConnectionService, NotionClient]`; controllers `[NotionConnectionController]`; exports `[NotionConnectionService]` (for `resources` to inject).
- [X] T011 Update `apps/api/src/resources/resources.module.ts`: import `NotionConnectionModule`; remove `NotionClient` from this module's own providers (moved to T010).
- [X] T012 Update `apps/api/src/resources/resources.service.ts`: `createFromNotion(userId, projectId, pageUrl)` (no `token` param) resolves the token via the injected `NotionConnectionService.getDecryptedToken()`, throwing `BadRequestException` pointing at Settings when it's `null`; remove `hasNotionConnection()`, `getStoredNotionToken()`, and all direct `prisma.notionConnection` access — makes T004 pass. Depends on T008, T010, T011.
- [X] T013 [P] Update `apps/api/src/resources/dto/create-resource-notion.dto.ts`: drop the `token` field entirely — `{ pageUrl: string }` only (research.md Decision 3).
- [X] T014 Update `apps/api/src/resources/resources.controller.ts`: `connectNotion()` drops the `token` argument; remove the `hasNotionConnection` endpoint (superseded by T009) — makes T005 pass. Depends on T012, T013.
- [X] T015 [P] Update `packages/schemas/src/resource.ts`: `CreateResourceNotionRequestSchema` drops `token` — `{ pageUrl: z.url() }` only.
- [X] T016 [P] Create `packages/schemas/src/notion-connection.ts`: `NotionConnectionStatusSchema` (`{ connected: z.boolean() }`), `CreateNotionConnectionRequestSchema` (`{ token: z.string().min(1) }`) — mirrors `board-connection.ts`'s shape; export both from `packages/schemas/src/index.ts`.
- [X] T017 [P] `apps/web/shared/hooks/use-notion-connection-status.test.ts`: the hook fetches `GET /projects/:projectId/notion-connection` and exposes `{ connected }` via TanStack Query, keyed so both features below can share cache invalidation.
- [X] T018 Create `apps/web/shared/hooks/use-notion-connection-status.ts` (+ the underlying fetch call, colocated or in `shared/api/`) — exports `notionConnectionStatusKey(projectId)` and `useNotionConnectionStatus(projectId)` — makes T017 pass (research.md Decision 4).
- [X] T019 Update `apps/web/features/resources/hooks.ts`/`api.ts`: remove the old resources-owned `getNotionConnectionStatus`/`useNotionConnectionStatus`/`notionConnectionKey` (superseded by T018); `useConnectNotionResource`'s mutation payload becomes `{ pageUrl }` only (matches T015).
- [X] T020 [P] Update `apps/api/src/test/prisma-mock.ts` if any mock shape drifted from the service moves above (verify `notionConnection.findUnique`/`upsert`/`delete` mocks still match `NotionConnectionService`'s usage — no new methods expected, this is a verification task).

**Checkpoint**: `notion-connection` exists as its own backend module and the resources module depends on it via DI, not raw Prisma access; the frontend has a shared read-only status hook. Both user stories can now proceed.

---

## Phase 3: User Story 1 - A developer manages every external connection from one place (Priority: P1) 🎯 MVP

**Goal**: A dedicated `/projects/[id]/settings` route shows both the GitHub board connection and the Notion connection, each connectable/reconnectable/disconnectable from there; neither remains manageable inline on the project's main page.

**Independent Test**: Open a project's Settings as a contributor; confirm both connections are visible and manageable from this single screen, with no connection-management UI left on the main project page (quickstart.md Scenario 1).

### Tests for User Story 1 ⚠️ write first, confirm they fail before implementing

- [X] T021 [P] [US1] `apps/web/features/notion-connection/hooks.test.tsx`: `useNotionConnection` reads status (via the shared hook or its own richer read, per implementation choice); `useConnectNotionConnection`/`useDisconnectNotionConnection` call the right endpoints and invalidate the shared status query key (T018) on success.
- [X] T022 [P] [US1] `apps/web/features/notion-connection/components/connect-notion-dialog.test.tsx`: a token field and submit button; submitting calls the connect mutation; a submission error (invalid token) shows inline, dialog stays open — mirrors `connect-board-dialog.test.tsx`'s shape.
- [X] T023 [P] [US1] `apps/web/features/notion-connection/components/notion-connection-card.test.tsx`: "not connected" state offers a Connect action; "connected" state shows connected status with reconnect/disconnect actions — mirrors `board-connection-card.test.tsx`'s shape.
- [X] T024 [P] [US1] `apps/web/app/[locale]/(protected)/projects/[id]/settings/page.test.tsx`: a contributor sees both `BoardConnectionCard` and `NotionConnectionCard`; a client-role member or non-member gets the same not-found treatment as every other contributor-only surface.
- [X] T025 [P] [US1] Update `apps/web/app/[locale]/(protected)/projects/[id]/page.test.tsx`: `BoardConnectionCard` is no longer rendered; a Settings link is present in its place.
- [X] T026 [P] [US1] Update `apps/api/src/auth/auth.controller.spec.ts`: `githubBoardConnectionCallback` redirects to `.../projects/:projectId/settings` (both the `?connectBoard=1` success case and the `?boardConnectError=...` failure case) instead of the project page (research.md Decision 5).

### Implementation for User Story 1

- [X] T027 [P] [US1] Create `apps/web/features/notion-connection/api.ts`: `getNotionConnection`, `connectNotionConnection(projectId, token)`, `disconnectNotionConnection(projectId)`.
- [X] T028 [US1] Create `apps/web/features/notion-connection/hooks.ts`: `useNotionConnection`, `useConnectNotionConnection`, `useDisconnectNotionConnection` — invalidates both this feature's own query and the shared `notionConnectionStatusKey` (T018) on connect/disconnect success — makes T021 pass. Depends on T027.
- [X] T029 [US1] Create `apps/web/features/notion-connection/components/connect-notion-dialog.tsx` (mirrors `connect-board-dialog.tsx`: token field only, no board picker) — makes T022 pass. Depends on T028.
- [X] T030 [US1] Create `apps/web/features/notion-connection/components/notion-connection-card.tsx` (mirrors `board-connection-card.tsx`: not-connected/connected states, reconnect/disconnect actions) — makes T023 pass. Depends on T028, T029.
- [X] T031 [US1] Create `apps/web/app/[locale]/(protected)/projects/[id]/settings/page.tsx`: fetches the project for role-gating (mirrors the resource detail route's pattern), renders `BoardConnectionCard` + `NotionConnectionCard` for a contributor, the standard not-found state otherwise — makes T024 pass. Depends on T030.
- [X] T032 [US1] Update `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`: remove `<BoardConnectionCard projectId={id} />` from the contributor grid; add a link to `/projects/${id}/settings` in its place — makes T025 pass. Depends on T031.
- [X] T033 [US1] Update `apps/api/src/auth/auth.controller.ts`: `githubBoardConnectionCallback`'s `projectUrl` becomes `${webOrigin}/${locale}/projects/${projectId}/settings` — makes T026 pass.

**Checkpoint**: Settings is fully functional and is the only place either connection is managed.

---

## Phase 4: User Story 2 - Adding a Notion resource without a configured connection routes to Settings (Priority: P2)

**Goal**: The "Add a resource" dialog's Notion tab never collects a token — it shows a page-URL field when a connection already exists, or an explanatory message with a link to Settings when it doesn't.

**Independent Test**: As a contributor on a project with no Notion connection, open "Add a resource" → Notion; confirm no token field is offered and a working link to Settings appears instead (quickstart.md Scenario 2). Depends on US1 (the link must resolve to a real route).

### Tests for User Story 2 ⚠️ write first, confirm they fail before implementing

- [X] T034 [P] [US2] Update `apps/web/features/resources/components/add-resource-dialog.test.tsx`: Notion tab, project with no connection → only the explanatory message + a link to `/projects/:projectId/settings`, no page-URL field, no submit control; Notion tab, project with a connection → page-URL field + submit only (no token field, no "use a different token" affordance — both already removed).

### Implementation for User Story 2

- [X] T035 [US2] Update `apps/web/features/resources/components/add-resource-dialog.tsx`: Notion tab reads `useNotionConnectionStatus` (T018, shared); unconfigured → message + `Link` to Settings, nothing else; configured → page-URL field + submit only; remove all now-dead token-field/`showTokenOverride`/"use a different token" state and markup — makes T034 pass. Depends on T018, T019, T031 (Settings route must exist).
- [X] T036 [US2] Update `apps/web/messages/en.json`/`fr.json`: remove the now-dead `notionTokenLabel`/`notionConnectedHint`/`notionUseDifferentToken` keys under `Projects.AddResourceDialog`; add keys for the "connect a Notion integration first" message and the Settings link label.

**Checkpoint**: US1 + US2 both functional — the full redirect flow works end to end (quickstart.md Scenarios 1–2).

---

## Phase 5: User Story 3 - A developer can tell at a glance whether connections are configured (Priority: P3)

**Goal**: The project's main page shows a compact, read-only summary of both connections' state, linking into Settings.

**Independent Test**: View a project's main page as a contributor with one connection configured and one not; confirm the summary reflects both states accurately and links to Settings (quickstart.md's spirit, spec.md US3 Acceptance Scenario 1).

### Tests for User Story 3 ⚠️ write first, confirm they fail before implementing

- [X] T037 [P] [US3] Update `apps/web/app/[locale]/(protected)/projects/[id]/page.test.tsx`: the Settings link (T032) shows each connection's state (e.g. "Board: connected", "Notion: not connected") reflecting `useBoardConnection`/`useNotionConnectionStatus`.

### Implementation for User Story 3

- [X] T038 [US3] Extend the Settings link from T032 into a compact summary reflecting both connections' current state, still linking to `/projects/${id}/settings` — makes T037 pass. Depends on T032.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T039 [P] i18n audit: add the new `Projects.SettingsPage`/`Projects.NotionConnectionCard`/`Projects.ConnectNotionDialog` (naming per implementation) keys to both `apps/web/messages/en.json` and `fr.json`, full parity check across both locale files.
- [X] T040 [P] Check `docs/PRODUCT.md` for any now-inaccurate claim about where board/Notion connections live (as done for specs/010/011) — update only if one exists, no change otherwise.
- [X] T041 Dead-code sweep: confirm no leftover references to the old `apps/api/src/resources/notion.client.ts` path, the removed `hasNotionConnection`/`GET /resources/notion-connection` endpoint, or the removed inline-token `AddResourceDialog` state remain anywhere (grep across both apps).
- [X] T042 Run `pnpm lint`, `pnpm typecheck`, `pnpm test:cov` from the repo root; fix any fallout across both apps.
- [ ] T043 Walk through quickstart.md end-to-end (all 4 scenarios) against the real GitHub OAuth App and real Notion integration already provisioned this session — no manual prerequisite blocks this one, unlike specs/011's R2 dependency.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — no tasks.
- **Foundational (Phase 2)**: No dependencies beyond Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational *and* User Story 1 (T031, the Settings route, must exist for its link to resolve).
- **User Story 3 (Phase 5)**: Depends on User Story 1 (T032, the Settings link it extends).
- **Polish (Phase 6)**: Depends on whichever of US1–US3 are in scope for this delivery being complete.

### Parallel Opportunities

- All Foundational tasks marked [P] (tests T001–T005, and independent implementation files T007, T013, T015, T016, T017, T020) can run in parallel with each other within their group.
- All US1 test tasks (T021–T026) can run in parallel with each other.
- T039/T040 (Polish) can run in parallel with each other and with T041.

## Implementation Strategy

### MVP First

1. Complete Foundational (Phase 2) — the `notion-connection` module extraction.
2. Complete User Story 1 (Phase 3) — Settings page live. **STOP and VALIDATE** independently (quickstart.md Scenario 1).
3. Complete User Story 2 (Phase 4) — redirect flow complete. **STOP and VALIDATE** (quickstart.md Scenario 2).
4. User Story 3 (Phase 5) is optional polish — add if time allows, drop otherwise without affecting US1/US2.
5. Phase 6 (Polish) before calling the feature done.
