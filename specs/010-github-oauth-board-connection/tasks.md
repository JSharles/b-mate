---
description: "Task list for GitHub OAuth Board Connection"
---

# Tasks: GitHub OAuth Board Connection

**Input**: Design documents from `/specs/010-github-oauth-board-connection/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (all present, no `contracts/` — see plan.md, matching `specs/005`/`specs/009`'s convention)

**Tests**: Included — Constitution Principle I (Test-First Coverage Discipline) is non-negotiable for this repo; new logic ships with tests in the same change.

**Organization**: Three user stories (US1 P1, US2 P2, US3 P3). US2 needs almost no new code — the existing empty-board-list UI already does the right thing, it just needs to be reachable via the new flow and get one regression test. US3 (the "reconnect" state) is the one story with real independent backend work (a new `needsReconnect` flag, set by the existing background sweep) and is fully separable from US1/US2 — it can ship after either, or be dropped from an MVP cut without blocking them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to US1/US2/US3

---

## Phase 1: Setup

No setup tasks. This feature reuses the GitHub OAuth App, `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET`/`GITHUB_OAUTH_CALLBACK_URL`, and `BOARD_CONNECTION_ENCRYPTION_KEY` already provisioned by `specs/009`/`specs/005` (research.md Decision 1) — nothing new to add to `.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared OAuth plumbing (cookie shape, scope parameter, module export), the one schema migration, and the typed error US3 needs — all with no dependency on each other beyond what's noted.

**⚠️ CRITICAL**: US1/US2/US3 all depend on T001–T005; US3 additionally depends on T006/T007.

- [X] T001 [P] Extend `OAuthFlowCookiePayload`/`parseOAuthFlowCookie` in `apps/api/src/auth/oauth-state-cookie.ts`: add `flow: 'login' | 'board-connection'` and `projectId?: string`. `parseOAuthFlowCookie` keeps returning `null` for anything malformed/incomplete — now also requiring `flow` to be one of the two literals, and `projectId` to be a non-empty string whenever `flow === 'board-connection'` (data-model.md).
- [X] T002 [P] Extend `GithubOauthClient.buildAuthorizeUrl` in `apps/api/src/auth/github-oauth.client.ts` to accept an optional `scope` parameter, defaulting to the existing `GITHUB_SCOPE` (`'read:user user:email'`) when omitted (research.md Decision 4).
- [X] T003 Update `apps/api/src/auth/auth.controller.ts`: `githubStart` now serializes `flow: 'login'` into the state cookie (payload shape changed by T001) — no behavior change to the login path itself. While here, rename `githubCallback`'s local `flow` variable (currently the whole parsed cookie payload) to `oauthFlow`, to avoid shadowing the payload's new `flow` field. Depends on T001.
- [X] T004 [P] Create `apps/api/src/auth/board-oauth-cookie.ts`: cookie name (`board_oauth_token`), TTL (~10 min), `httpOnly`/`secure` (prod)/`sameSite=lax`/`path=/projects` options, and serialize/parse helpers for an already-encrypted token string (data-model.md) — sibling to `oauth-state-cookie.ts`. Encryption/decryption itself stays in `board-connections/token-encryption.ts`; this file only handles the cookie envelope.
- [X] T005 [P] Export `GithubOauthClient` from `apps/api/src/auth/auth.module.ts`'s `exports` array (currently only `AuthService`, `SessionGuard`) — `BoardConnectionsModule` already imports `AuthModule` (for `SessionGuard`), so this is the only wiring change needed for it to inject `GithubOauthClient` too.
- [X] T006 Prisma migration: add `needsReconnect Boolean @default(false) @map("needs_reconnect")` to `BoardConnection` in `apps/api/prisma/schema.prisma`; generate and apply via `pnpm --filter api prisma:migrate` (name suggestion: `add_board_connection_needs_reconnect`) (data-model.md).
- [X] T007 [P] Add an exported `GithubAuthError` class in `apps/api/src/board-connections/github-projects.client.ts`, thrown by the private `query()` method instead of a generic `Error` specifically when the GitHub response status is `401` or `403`; every other non-OK status keeps throwing the existing generic `Error` (research.md Decision 6, needed by US3's T028).
- [X] T008 [P] Extend `apps/api/src/auth/github-oauth.client.spec.ts` for T002: omitting `scope` still requests `read:user user:email`; passing a scope override sends exactly that string.
- [X] T009 [P] Extend `apps/api/src/auth/auth.controller.spec.ts` for T003: `GET /auth/github` still sets a cookie with `flow: 'login'` and redirects with the unchanged login scope — a pure regression check, no new behavior.
- [X] T010 [P] Extend `apps/api/src/board-connections/github-projects.client.spec.ts` for T007: a `401`/`403` response throws `GithubAuthError`; other non-OK statuses (`500`, etc.) still throw the plain `Error` as before.

**Checkpoint**: Shared OAuth plumbing, migration, and typed-error groundwork ready. Existing login flow and board sync behavior are unaffected (regression tests T009/T010 confirm it).

---

## Phase 3: User Story 1 - A developer connects a board without ever touching a token (Priority: P1) 🎯 MVP

**Goal**: Replace the token-paste step in `ConnectBoardDialog` with a "Continue with GitHub" action that ends on the same board-picker UI the dialog already has today.

**Independent Test**: A developer with no existing board connection goes through the full flow (authorize → board list → pick → connected) without creating or pasting any token (quickstart.md Scenarios 1–2).

### Tests for User Story 1 ⚠️ write first, confirm they fail before implementing

- [X] T011 [P] [US1] Extend `apps/api/src/board-connections/board-connections.controller.spec.ts`: new `GET :projectId/board-connection/github/authorize` — a non-contributor/non-member gets the same 404 the other endpoints already return; a contributor gets redirected to GitHub's authorize URL requesting `read:user user:email read:project`, having set the state cookie with `flow: 'board-connection'` and the current `projectId`.
- [X] T012 [P] [US1] Extend `apps/api/src/auth/auth.controller.spec.ts`'s `githubCallback` tests: for `oauthFlow.flow === 'board-connection'`, a successful code exchange encrypts the token, sets the `board_oauth_token` cookie, and redirects to `${WEB_ORIGIN}/<locale>/projects/<projectId>?connectBoard=1` — no email-verification check on this branch (board access has no email requirement, unlike login/FR-006 of `specs/009`). State-mismatch and exchange-failure behave like today (an error-query redirect, no `board_oauth_token` cookie set).
- [X] T013 [P] [US1] Extend `apps/api/src/board-connections/board-connections.controller.spec.ts`: `preview`/`connect` resolve the token from the `board_oauth_token` cookie when present (decrypting it), ignoring `dto.token` in that case; when the cookie is absent, `dto.token` is used exactly as today — the FR-007 regression guard for the legacy PAT path.
- [X] T014 [P] [US1] Rewrite `apps/web/features/board-connections/components/connect-board-dialog.test.tsx`: no token `<Input>` anywhere; renders a "Continue with GitHub" link (styled like `GitHubAuthCard`, plain `<a href>`, not a form) pointing at the new authorize endpoint; when the dialog mounts with `connectBoard=1` present in the URL, it calls the preview mutation immediately with no `token`, going straight to the board-picker step.

### Implementation for User Story 1

- [X] T015 [US1] In `packages/schemas/src/board-connection.ts`: make `token` optional in `PreviewBoardConnectionRequestSchema` and `CreateBoardConnectionRequestSchema`; add `needsReconnect: z.boolean()` to `BoardConnectionSchema` (used by US3 too — added here since it's the same file/PR-sized change).
- [X] T016 [US1] Implement `GET :projectId/board-connection/github/authorize` in `apps/api/src/board-connections/board-connections.controller.ts`: reuse (or expose as a thin public wrapper around) `BoardConnectionsService`'s existing contributor check, then build the state cookie (T001) and redirect via the injected `GithubOauthClient.buildAuthorizeUrl(state, 'read:user user:email read:project')` (T002, T005) — makes T011 pass.
- [X] T017 [US1] Implement the `flow === 'board-connection'` branch of `apps/api/src/auth/auth.controller.ts`'s `githubCallback` — makes T012 pass. Depends on T001, T003, T004.
- [X] T018 [US1] Update `board-connections.controller.ts`'s `preview`/`connect` handlers to resolve the effective token from the `board_oauth_token` cookie (T004) when present, falling back to `dto.token`, and to clear that cookie once consumed — makes T013 pass. Depends on T004, T015.
- [X] T019 [US1] Update `BoardConnectionsService.connect()` to also reset `needsReconnect` to `false` on every successful (re)connection — a one-line addition to the existing upsert payload, landed now so US3 doesn't need a second pass through this method. Depends on T006, T015.
- [X] T020 [US1] Rewrite `ConnectBoardDialog` (`apps/web/features/board-connections/components/connect-board-dialog.tsx`): replace the token-paste form with a "Continue with GitHub" link to the new authorize endpoint; on mount, read `connectBoard` from the URL and, if present, call `preview()` immediately with no token, skipping straight to the board-picker step — makes T014 pass. Depends on T016, T017, T018.
- [X] T021 [P] [US1] Update `apps/web/features/board-connections/api.ts`/`hooks.ts`: `token` becomes optional in the preview/connect call signatures (unchanged for the legacy path; simply omitted on the OAuth path, matching T015).
- [X] T022 [P] [US1] Update `apps/web/features/board-connections/components/board-connection-card.tsx` (where `ConnectBoardDialog` is mounted) to open it automatically, already in board-picker mode, when the project page loads with `connectBoard=1` in the URL — matches T020's mount-time behavior.

**Checkpoint**: A developer can go from "no board connected" to "board connected" without creating, copying, or pasting a token at any point (quickstart.md Scenarios 1–2, SC-001/SC-002).

---

## Phase 4: User Story 2 - A developer with no accessible boards gets a clear message (Priority: P2)

**Goal**: The existing empty-board-list message stays correct once reached via the new OAuth flow.

**Independent Test**: Authorizing with a GitHub identity that has zero accessible Projects v2 boards shows the existing "no boards" message, no broken/empty picker (quickstart.md Scenario 3).

### Tests for User Story 2

- [X] T023 [P] [US2] Extend `connect-board-dialog.test.tsx`: after reaching the board-picker step via the OAuth path (`connectBoard=1`), an empty board list renders the existing `noBoards` message and no picker — the same branch the legacy PAT flow already exercises, now also reachable this way.

### Implementation for User Story 2

- [X] T024 [US2] Verify T020's rewrite preserves the existing `boards.length === 0` branch unchanged (no new backend logic needed — `listAccessibleBoards` already returns `[]` correctly); fix only if T023 finds a regression.

**Checkpoint**: quickstart.md Scenario 3 passes (SC-003).

---

## Phase 5: User Story 3 - A developer revokes access and the connected board keeps working until they act (Priority: P3)

**Goal**: When a board's stored token is revoked, the background sweep detects it and the board card shows a clear "reconnect" prompt instead of silently going stale.

**Independent Test**: Connect a board, revoke Diaphane's GitHub access from GitHub's side, and confirm the board card surfaces a reconnect prompt within one sweep cycle (quickstart.md Scenario 6).

### Tests for User Story 3

- [X] T025 [P] [US3] Extend `apps/api/src/task-vulgarization/task-vulgarization.service.spec.ts`: `processConnection()` sets `needsReconnect: true` on the connection when the caught error is a `GithubAuthError` (T007), and leaves it untouched (still `false`, or whatever it already was) for any other error type (network failure, 5xx, etc.) — matches FR-008's "explicit revocation triggers this, routine failures don't."
- [X] T026 [P] [US3] Extend `apps/api/src/board-connections/board-connections.service.spec.ts` (and/or `board-connections.controller.spec.ts`): `findForProject`/`GET :projectId/board-connection` includes `needsReconnect` in its response shape.
- [X] T027 [P] [US3] Extend `apps/web/features/board-connections/components/board-connection-card.test.tsx`: when `connection.needsReconnect` is `true`, renders a distinct "reconnect your board" prompt (linking into the same authorize flow as a first-time connect, T016) instead of the normal connected-state display.

### Implementation for User Story 3

- [X] T028 [US3] Update `TaskVulgarizationService.processConnection()`'s catch block (`apps/api/src/task-vulgarization/task-vulgarization.service.ts`) to set `needsReconnect: true` via `this.prisma.boardConnection.update(...)` when the caught error is `instanceof GithubAuthError`, keeping the existing log-and-continue behavior (unmodified) for every other error type — makes T025 pass. Depends on T006, T007.
- [X] T029 [US3] Add `needsReconnect` to `BoardConnectionsService.toDetails()`'s returned shape and the `BoardConnectionDetails` interface (`apps/api/src/board-connections/board-connections.service.ts`) — makes T026 pass. Depends on T006, T015.
- [X] T030 [US3] Update `BoardConnectionCard` (`apps/web/features/board-connections/components/board-connection-card.tsx`) to render the reconnect prompt when `connection.needsReconnect` — makes T027 pass. Depends on T020 (authorize link exists), T029.

**Checkpoint**: quickstart.md Scenario 6 passes — a revoked connection surfaces a clear "reconnect" state within one sweep cycle (≤5 min) instead of failing silently (FR-008).

---

## Phase 6: Polish & Cross-Cutting

- [X] T031 [P] Update `apps/web/messages/en.json`/`fr.json`: replace `Projects.ConnectBoardDialog`'s token-paste copy (`tokenLabel`, `tokenHint`, `tokenHintLink`, `previewSubmit`, `previewPending`) with "Continue with GitHub" copy; add copy for `Projects.BoardConnectionCard`'s reconnect prompt (US3).
- [X] T032 [P] Update `docs/PRODUCT.md`'s board-connection description (if present) to describe the OAuth-based flow, referencing this spec; remove/adjust any remaining reference to the manual-PAT flow as the current mechanism (it remains documented as still-supported-for-existing-connections, per FR-007).
- [X] T033 Remove now-dead PAT-specific UI strings/links left over after T020/T031 (e.g. the `github.com/settings/tokens/new?scopes=project...` help link), if any remain unused.
- [X] T034 Run `pnpm lint`, `pnpm typecheck`, `pnpm test:cov` from the repo root; fix any fallout across both apps.
- [ ] T035 Walk through quickstart.md end-to-end against the real registered GitHub OAuth App — all 6 scenarios, including actually revoking access on GitHub's side for Scenario 6.

---

## Dependencies & Execution Order

- **Setup**: none.
- **Foundational (T001–T010)**: T003 depends on T001; T006 (migration) has no dependency on T001–T005 and can run in parallel with them; T007 is independent; T008/T009/T010 depend on their respective implementation task (T002/T003/T007) existing to test against, but can be drafted in parallel and confirmed failing first.
- **US1 tests (T011–T014)**: independent of each other — write and confirm-failing in parallel; all depend on Foundational being complete.
- **US1 implementation (T015–T022)**: T015 first (schema shared by T016–T022's DTOs); T016/T017/T018 can proceed in parallel once T015 lands (different files: controller route, auth callback, preview/connect handlers); T019 depends on T015/T006; T020 depends on T016–T018; T021/T022 depend on T020 (component contract it relies on).
- **US2 (T023–T024)**: depends on US1's T020 existing; otherwise no new dependencies.
- **US3 tests (T025–T027)**: independent of each other; T025 additionally needs T007 to exist to test against; all depend on Foundational (T006/T007).
- **US3 implementation (T028–T030)**: T028 depends on T006, T007; T029 depends on T006, T015; T030 depends on T020, T029.
- **Polish (T031–T035)**: T031/T032 are independent of code and of each other; T033 depends on T020/T031; T034 and T035 come last, after everything else.

## Parallel Example: Foundational

```
# Independent tracks once Setup is confirmed done (there is none, so immediately):
Task: "Extend OAuthFlowCookiePayload with flow/projectId" (T001)
Task: "Extend GithubOauthClient.buildAuthorizeUrl with a scope param" (T002)
Task: "Create board-oauth-cookie.ts" (T004)
Task: "Export GithubOauthClient from auth.module.ts" (T005)
Task: "Prisma migration: needsReconnect" (T006)
Task: "Add GithubAuthError to github-projects.client.ts" (T007)
```

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 2: Foundational (T001–T010) — T006/T007 can be deferred to just before Phase 5 if the team wants a leaner MVP cut, since only US3 depends on them.
2. Complete Phase 3: User Story 1 (T011–T022).
3. **STOP and VALIDATE**: quickstart.md Scenarios 1–2 against a real GitHub OAuth authorization.
4. Ship — a developer can already connect a board with zero tokens touched; US2's existing empty-state handling already works even without US2's own dedicated test/verification pass (T023–T024), and US3's "reconnect" UX gap (stale silent failure) is a pre-existing condition, not a regression this MVP introduces.

### Incremental Delivery

1. Foundational → Foundation ready.
2. US1 → independently test → ship (MVP).
3. US2 → one regression test, near-zero new code → ship.
4. US3 → the one story with real new backend work (`needsReconnect`, sweep change, reconnect UI) → independently test → ship.

## Notes

- Commit after each task or logical group, per repo convention (Conventional Commits, only when the user explicitly asks for a commit).
- Verify each spec'd test (T008–T014, T023, T025–T027) actually fails before writing its corresponding implementation — the constitution's Test-First principle is non-negotiable here, not aspirational.
- T016's exact shape of "expose the contributor check publicly" is an implementation judgment call (thin wrapper vs. loosening the existing private method's visibility) — resolve it in code following whichever reads more consistently with `BoardConnectionsService`'s existing style, not by guessing further here.
