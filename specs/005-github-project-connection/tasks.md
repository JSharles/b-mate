# Tasks: GitHub Projects Board Connection

**Input**: Design documents from `/specs/005-github-project-connection/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included as mandatory — Constitution I requires every changed/new file to ship with tests in the same change; the 80% coverage gate is enforced in CI. The new GitHub GraphQL client is injectable specifically so it can be mocked in tests (no test needs a live network call, per plan.md).

**Organization**: User Stories 1, 2, and 3 all depend on the same Foundational schema/module-scaffolding phase, but are otherwise independent — US1 delivers "connect", US2 "see", US3 "disconnect/switch". A project with a connection (from US1) is the natural setup for testing US2/US3, but there is no code dependency between them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, or US3

---

## Phase 1: Setup

No new scaffolding needed — this feature adds one new `apps/api` module (`board-connections`) and one new `apps/web` feature (`features/board-connections`), following the exact structure already used by `invitations`. Skipping directly to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, shared request/response schemas, token encryption, and the GitHub GraphQL client — every user story depends on all of these existing first.

**⚠️ CRITICAL**: No user story can be implemented until this phase is complete.

- [X] T001 Add `enum BoardProvider { github }` and `model BoardConnection` (per `data-model.md`: unique `projectId`, `onDelete: Cascade`, encrypted token column, board identity fields) to `apps/api/prisma/schema.prisma`; add the inverse `boardConnection BoardConnection?` relation on `Project`.
- [X] T002 Create the Prisma migration (`pnpm --filter api prisma:migrate`) for the new `BoardProvider` enum and `board_connections` table (depends on T001). Purely additive — no backfill needed (new table, no existing rows).
- [X] T003 [P] Add `BOARD_CONNECTION_ENCRYPTION_KEY` to `apps/api/.env.example` (with a comment on how to generate one, e.g. `openssl rand -hex 32`), and to the local `apps/api/.env`.
- [X] T004 [P] Create `packages/schemas/src/board-connection.ts` with `AvailableBoardSchema`, `PreviewBoardConnectionRequestSchema`, `CreateBoardConnectionRequestSchema`, `BoardConnectionSchema` (per `data-model.md`); export it from `packages/schemas/src/index.ts`.
- [X] T005 [P] Implement `apps/api/src/board-connections/token-encryption.ts` — `encrypt(plaintext)` / `decrypt(ciphertext)` using AES-256-GCM and `BOARD_CONNECTION_ENCRYPTION_KEY` (research.md Decision 4), plus `token-encryption.spec.ts` (round-trip encrypt/decrypt; decrypt fails clearly on tampered ciphertext).
- [X] T006 [P] Implement `apps/api/src/board-connections/github-projects.client.ts` — an injectable provider wrapping GitHub's GraphQL API: `listAccessibleBoards(token): Promise<AvailableBoard[]>` (research.md Decision 2, `viewer.projectsV2`) and `verifyBoardAccess(token, ownerLogin, ownerType, number): Promise<AvailableBoard | null>` (research.md Decision 3); sanitizes/never logs the token in any thrown error. Plus `github-projects.client.spec.ts` mocking `global.fetch` — success, empty-list, and GitHub-error-response cases.

**Checkpoint**: Schema, shared types, encryption, and the GitHub client are ready — all user stories can now proceed.

---

## Phase 3: User Story 1 - Connect a project to a board (Priority: P1) 🎯 MVP

**Goal**: A contributor on a project with no board connected can paste a GitHub PAT, see the boards it can access, pick one, and have it connected.

**Independent Test**: As a contributor, open Settings on a project with no connection, connect a real board through the two-step flow, and confirm it's persisted (survives a reload).

### Implementation for User Story 1

- [X] T007 [US1] Create `apps/api/src/board-connections/board-connections.module.ts` registering the controller, service, and `github-projects.client.ts` provider; import it into `AppModule` (depends on T001–T006).
- [X] T008 [US1] Implement `apps/api/src/board-connections/board-connections.service.ts`: a private `assertIsContributor(userId, projectId)` (own copy, mirrors `ProjectsService`/`InvitationsService`'s `assertIsMember`/`assertIsAdmin` precedent per Constitution III — same `NotFoundException` for non-member and non-contributor alike, FR-009); `preview(userId, projectId, token)` calls `listAccessibleBoards` and returns the list (stores nothing); `connect(userId, projectId, dto)` calls `verifyBoardAccess` (FR-002), throws if it returns null, otherwise encrypts the token (T005) and upserts on `projectId` (FR-006) (depends on T007).
- [X] T009 [US1] Implement `apps/api/src/board-connections/dto/preview-board-connection.dto.ts` (`{ token: string }`, class-validator) and `dto/create-board-connection.dto.ts` (`{ token, ownerLogin, ownerType, number }`, class-validator) (depends on T007).
- [X] T010 [US1] Implement `apps/api/src/board-connections/board-connections.controller.ts`: `POST /projects/:projectId/board-connection/preview` and `POST /projects/:projectId/board-connection`, both `@UseGuards(SessionGuard)`, delegating to the service (depends on T008, T009).
- [X] T011 [US1] Create `apps/web/features/board-connections/api.ts` (`previewBoardConnection`, `connectBoard`) and `hooks.ts` (`usePreviewBoardConnection`, `useConnectBoard` — invalidates the board-connection query on success) (depends on T004).
- [X] T012 [US1] Create `apps/web/features/board-connections/components/connect-board-dialog.tsx`: step 1 (paste token → preview), step 2 (radio-select a board from the preview results → confirm) (depends on T011).
- [X] T013 [US1] In `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`, replace the Settings `ComingSoonCard` with a `BoardConnectionCard` (new, minimal for now — "not connected, connect a board" state wired to `ConnectBoardDialog`) when `isContributor` (depends on T012). Full "connected" display comes in US2.

### Tests for User Story 1

- [X] T014 [P] [US1] Add tests in `apps/api/src/board-connections/board-connections.service.spec.ts`: `preview()` returns the client's list; `connect()` rejects (and stores nothing) when `verifyBoardAccess` returns null (FR-002); `connect()` upserts and encrypts the token; non-contributor gets `NotFoundException` from both (depends on T008).
- [X] T015 [P] [US1] Add tests in `apps/api/src/board-connections/board-connections.controller.spec.ts`: both routes delegate to the service with the current user/project id/dto (depends on T010).
- [X] T016 [P] [US1] Add tests in `apps/web/features/board-connections/components/connect-board-dialog.test.tsx`: token submission triggers preview; board selection + confirm triggers connect; a rejected preview/connect shows an inline error (depends on T012).

**Checkpoint**: User Story 1 fully functional and independently testable — this alone is a shippable increment (a developer can connect a board; nothing yet shows it beyond the dialog closing).

---

## Phase 4: User Story 2 - See which board is connected (Priority: P2)

**Goal**: Any contributor can see, at a glance, whether a board is connected and which one; a client-role member never sees any of it.

**Independent Test**: As a contributor (including one who didn't connect it), open Settings on a project with a board connected and confirm its name/link are shown. As a client-role member of that project, confirm nothing board-related is visible anywhere.

### Implementation for User Story 2

- [X] T017 [US2] In `apps/api/src/board-connections/board-connections.service.ts`, add `findForProject(userId, projectId): Promise<BoardConnection | null>` — contributor-gated (reuses `assertIsContributor`), returns `null` (not a 404) when nothing is connected (FR-004) (depends on T008).
- [X] T018 [US2] Add `GET /projects/:projectId/board-connection` to `board-connections.controller.ts`, mapping the entity to `BoardConnectionSchema`'s shape — the encrypted token column is never included in the response (FR-012) (depends on T017).
- [X] T019 [US2] Add `getBoardConnection` to `apps/web/features/board-connections/api.ts` and `useBoardConnection(projectId)` to `hooks.ts` (depends on T011).
- [X] T020 [US2] Finish `apps/web/features/board-connections/components/board-connection-card.tsx`: reads `useBoardConnection`, shows the board's name + GitHub link when connected, the "connect a board" invitation when not, a loading skeleton while pending (mirrors `invitations-card.tsx`'s structure) (depends on T013, T019).

### Tests for User Story 2

- [X] T021 [P] [US2] Add tests in `board-connections.service.spec.ts`: `findForProject()` returns `null` when nothing connected, the connection when one exists, throws for a non-contributor (depends on T017).
- [X] T022 [P] [US2] Add tests in `board-connections.controller.spec.ts` for the new `GET` route (depends on T018).
- [X] T023 [P] [US2] Add tests in `board-connection-card.test.tsx`: connected state shows name/link; not-connected state shows the invitation, not an error (depends on T020).
- [X] T024 [P] [US2] Extend `apps/web/app/[locale]/(protected)/projects/[id]/page.test.tsx`: a client-role project member (`isContributor === false`) never renders `BoardConnectionCard` (FR-009, SC-003) — same gate as the existing Settings placeholder (depends on T020).

**Checkpoint**: User Story 2 fully functional and independently testable.

---

## Phase 5: User Story 3 - Disconnect or switch to a different board (Priority: P2)

**Goal**: A contributor can remove a project's board connection, or connect a different one directly without disconnecting first.

**Independent Test**: On a project with a board connected, disconnect it and confirm Settings reverts to "not connected" with no residual data (`psql` check). Connect a second board without disconnecting and confirm it replaces the first.

### Implementation for User Story 3

- [X] T025 [US3] In `board-connections.service.ts`, add `disconnect(userId, projectId): Promise<void>` — contributor-gated, hard-deletes the row if one exists, no-op (not an error) if none does (FR-005) (depends on T008).
- [X] T026 [US3] Add `DELETE /projects/:projectId/board-connection` to `board-connections.controller.ts`, returning `204` (depends on T025).
- [X] T027 [US3] Add `disconnectBoard` to `api.ts` and `useDisconnectBoard(projectId)` to `hooks.ts` (invalidates the board-connection query on success) (depends on T019).
- [X] T028 [US3] Add a "Disconnect" action to `board-connection-card.tsx` (only in the connected state) wired to `useDisconnectBoard` (depends on T020, T027).

### Tests for User Story 3

- [X] T029 [P] [US3] Add tests in `board-connections.service.spec.ts`: `disconnect()` removes the row; `disconnect()` on an already-disconnected project is a no-op, not an error; `connect()` when a connection already exists replaces it (upsert, not a second row) (FR-006) (depends on T025, and re-exercises T008's `connect()`).
- [X] T030 [P] [US3] Add tests in `board-connections.controller.spec.ts` for the new `DELETE` route (depends on T026).
- [X] T031 [P] [US3] Add tests in `board-connection-card.test.tsx`: clicking "Disconnect" calls the mutation and the card returns to the not-connected state (depends on T028).

**Checkpoint**: All three user stories independently functional — this is the full feature.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T032 [P] Run `pnpm --filter web lint` and `pnpm --filter api lint`; fix any findings.
- [X] T033 [P] Run `pnpm --filter web test:cov` and `pnpm --filter api test:cov`; confirm the 80% coverage gate holds.
- [X] T034 Manually run through every scenario in `specs/005-github-project-connection/quickstart.md` against a local dev server, using a real GitHub classic PAT and a real Projects (v2) board (including the security checks: inaccessible board rejected, `encrypted_token` column not plaintext, token never in any API response, non-member gets the same "not found" as everyone else).
- [X] T035 Confirm the regression check in `quickstart.md` — an existing project with no board connection shows the "connect a board" state cleanly, and no other project-page cartouche is affected.

---

## Dependencies & Execution Order

- **Setup**: none — skipped.
- **Foundational (Phase 2)**: T001 → T002; T003, T004, T005, T006 can run in parallel with each other and with T001/T002 (different files). Blocks all three user stories.
- **User Story 1 (Phase 3)**: T007 → T008 → T009 → T010 (API, sequential — same module); T011 → T012 → T013 (web, sequential); web and API tracks are independent of each other until T013 needs T010's endpoints live. T014–T016 depend on their respective implementation tasks.
- **User Story 2 (Phase 4)**: T017 → T018 (API); T019 → T020 (web, depends on T013's card existing). T021–T024 depend on their respective implementation tasks. Independent of US3.
- **User Story 3 (Phase 5)**: T025 → T026 (API); T027 → T028 (web, depends on T020's card existing). T029–T031 depend on their respective implementation tasks. Independent of US2.
- **Polish (Phase 6)**: after all three user stories.

## Implementation Strategy

**MVP first**: Foundational (T001-T006) → User Story 1 (T007-T016) → stop and validate independently → ship. User Stories 2 and 3 are additive, independent follow-ups — US1 alone lets a developer connect a board (verifiable directly against the database/API even before US2 gives it a UI to view).
