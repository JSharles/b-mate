# Tasks: Explicit Account Kind (Developer vs Client)

**Input**: Design documents from `/specs/004-account-kind/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included as mandatory, not optional — Constitution I requires every changed/new file to ship with tests in the same change; the 80% coverage gate is enforced in CI. Exception: the raw SQL migration itself (T002) has no Jest-testable unit — it's verified manually via `quickstart.md`, consistent with how this repo doesn't unit-test Prisma migrations elsewhere.

**Organization**: User Stories 1, 2, and 3 all depend on the same Foundational schema/migration phase, but are otherwise independent of each other. User Story 4 (clean migration) is delivered by the Foundational migration itself; its own phase below is verification, not new implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3, or US4

---

## Phase 1: Setup

No new scaffolding needed — this feature extends existing `apps/api` `auth`/`invitations`/`projects` modules and `apps/web` `features/auth`/`features/projects`. Skipping directly to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the `accountKind` column (with a correct one-time backfill for existing accounts) and expose it end to end in the shared schemas — every user story depends on this existing first.

**⚠️ CRITICAL**: No user story can be implemented until this phase is complete.

- [X] T001 Add `enum AccountKind { developer client }` and `accountKind AccountKind @map("account_kind")` on `User` in `apps/api/prisma/schema.prisma`.
- [X] T002 Create the Prisma migration (`pnpm --filter api prisma:migrate`, then hand-edit the generated SQL per `data-model.md`): add `account_kind` nullable, backfill via the `CASE` query (`contributor` membership anywhere → `developer`; membership(s) but none `contributor` → `client`; no memberships → `developer`), then `ALTER COLUMN ... SET NOT NULL` — all in one migration file (depends on T001).
- [X] T003 [P] Add `accountKind: z.enum(["developer", "client"])` to `UserSchema` and `SignupRequestSchema` in `packages/schemas/src/auth.ts` (depends on T001).

**Checkpoint**: Schema and shared types ready — all user stories can now proceed.

---

## Phase 3: User Story 1 - Explicit choice at direct signup (Priority: P1) 🎯 MVP

**Goal**: A person signing up through the public `/signup` page must explicitly choose "developer" or "client" before their account is created.

**Independent Test**: Complete signup choosing "developer"; confirm the account's kind is `developer`. Repeat choosing "client"; confirm `client`. Attempt to submit without choosing; confirm it's rejected.

### Implementation for User Story 1

- [X] T004 [US1] Add `accountKind` to `apps/api/src/auth/dto/signup.dto.ts` (`@IsEnum(AccountKind)`, required).
- [X] T005 [US1] In `apps/api/src/auth/auth.service.ts`, `signup()` persists `dto.accountKind` on `prisma.user.create` (depends on T004).
- [X] T006 [US1] In `apps/web/features/auth/schemas.ts`, add `accountKind: z.enum(["developer", "client"], { message: messages.accountKindRequired })` to `createSignupFormSchema` and its `SignupFormMessages` interface (depends on T003).
- [X] T007 [US1] In `apps/web/features/auth/components/signup-form.tsx`, add an explicit two-option "developer"/"client" choice control (no default selected) wired to the `accountKind` field, submitted alongside the rest of the form (depends on T006).
- [X] T008 [P] Add translation keys under `Auth.SignupForm` for the two option labels and the required-choice message, in `apps/web/messages/en.json` and `apps/web/messages/fr.json`.

### Tests for User Story 1

- [X] T009 [P] [US1] Add/extend tests in `apps/api/src/auth/auth.service.spec.ts`: signup persists the given `accountKind` (depends on T005).
- [X] T010 [P] [US1] Add/extend tests in `apps/web/features/auth/schemas.test.ts`: rejects a missing `accountKind` with the required message; accepts `"developer"` and `"client"` (depends on T006).
- [X] T011 [P] [US1] Add/extend tests in `apps/web/features/auth/components/signup-form.test.tsx`: both choice options render and are selectable; submission includes the chosen value (depends on T007).

**Checkpoint**: User Story 1 fully functional and independently testable — this alone is a shippable increment.

---

## Phase 4: User Story 2 - Automatic client kind via invitation (Priority: P1)

**Goal**: An account created by accepting a project invitation is automatically `client`-kind, with no choice presented.

**Independent Test**: Accept a valid invitation and complete account creation through it; confirm the resulting account's kind is `client` and no kind-selection step was shown.

### Implementation for User Story 2

- [X] T012 [US2] In `apps/api/src/invitations/invitations.service.ts`, the new-account branch of `accept()` sets `accountKind: 'client'` on `prisma.user.create` (depends on T001).

### Tests for User Story 2

- [X] T013 [P] [US2] Add/extend tests in `apps/api/src/invitations/invitations.service.spec.ts`: a brand-new account created via `accept()` has `accountKind: 'client'` (depends on T012).

**Checkpoint**: User Story 2 fully functional and independently testable.

### Amendment (FR-009): reject developer-kind accounts from client-role invitations

Added after initial implementation, per user feedback confirming the reverse of Decision 1 (research.md Decision 1b): a developer-kind account must never end up as a `client`-role project member, including via invitation.

- [X] T012b [US2] In `apps/api/src/invitations/invitations.service.ts`, `create()` rejects (403) when the invited email already belongs to a `developer`-kind account, before the existing membership check (depends on T012).
- [X] T012c [US2] In `apps/api/src/invitations/invitations.service.ts`, `accept()` rejects (403) when the resolved account is `developer`-kind, after password verification (depends on T012).
- [X] T013b [P] [US2] Add tests in `apps/api/src/invitations/invitations.service.spec.ts` for both new rejections (depends on T012b/T012c).

---

## Phase 5: User Story 3 - Home reflects account kind (Priority: P2)

**Goal**: "Create a project" is visible and usable only for `developer`-kind accounts — hidden from `client`-kind accounts on Home, and rejected by the API if attempted directly.

**Independent Test**: Log in as each kind; confirm the UI difference on Home. As a `client`-kind account, call `POST /projects` directly; confirm it's rejected.

### Implementation for User Story 3

- [X] T014 [US3] In `apps/api/src/projects/projects.controller.ts`, pass `user.accountKind` into `projectsService.create(...)` (depends on T001).
- [X] T015 [US3] In `apps/api/src/projects/projects.service.ts`, `create()` throws `ForbiddenException` when the caller's `accountKind` is `'client'`, before creating anything (depends on T014).
- [X] T016 [US3] In `apps/web/features/projects/components/project-list.tsx`, read `useCurrentUser()` and hide both the "New project" header button and the empty-state "Create a project" CTA when `accountKind === "client"` (depends on T003).

### Tests for User Story 3

- [X] T017 [P] [US3] Add/extend tests in `apps/api/src/projects/projects.service.spec.ts`: `create()` rejects a `client`-kind caller and does not call `prisma.project.create` (depends on T015).
- [X] T018 [P] [US3] Add/extend tests in `apps/api/src/projects/projects.controller.spec.ts`: `create()` forwards the caller's `accountKind` to the service (depends on T014).
- [X] T019 [P] [US3] Add/extend tests in `apps/web/features/projects/components/project-list.test.tsx`: both buttons render for a `developer`-kind user; neither renders for a `client`-kind user (depends on T016).

**Checkpoint**: User Story 3 fully functional and independently testable.

---

## Phase 6: User Story 4 - Clean migration of existing accounts (Priority: P3)

**Goal**: Every pre-existing account has a coherent, non-null `accountKind` after the Foundational migration (T002) runs — delivered there, verified here.

**Independent Test**: Per `quickstart.md` User Story 4 — query accounts before and after the migration; confirm none is left null and the rule matches each account's current `ProjectMember` rows.

- [X] T020 [US4] Manually verify the migration's backfill against real local data, per `quickstart.md` User Story 4 (depends on T002). No new code — this is a verification pass, not an implementation task.

**Checkpoint**: All four user stories independently functional — this is the full feature.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T021 [P] Run `pnpm --filter web lint` and `pnpm --filter api lint`; fix any findings.
- [X] T022 [P] Run `pnpm --filter web test:cov` and `pnpm --filter api test:cov`; confirm the 80% coverage gate holds.
- [X] T023 Manually run through every scenario in `specs/004-account-kind/quickstart.md` (including the direct `POST /projects` rejection check) against a local dev server.
- [X] T024 Note for the user (do not act automatically): `docs/PRODUCT.md`'s three newly-logged Open Decisions (merging role fully onto `User`, whether per-project permission roles are still needed, what happens to project settings on ownership transfer) remain unresolved and are out of scope for this implementation.

---

## Dependencies & Execution Order

- **Setup**: none — skipped.
- **Foundational (Phase 2)**: T001 → T002 → T003. Blocks all four user stories.
- **User Story 1 (Phase 3)**: T004 → T005; T006 → T007, in parallel with T004/T005 (different apps); T008 independent; T009-T011 depend on their respective implementation tasks.
- **User Story 2 (Phase 4)**: T012 → T013. Independent of US1 and US3.
- **User Story 3 (Phase 5)**: T014 → T015 (API); T016 independent (frontend) — both depend only on Foundational. T017-T019 depend on their respective implementation tasks. Testing US3 end-to-end is easiest once at least one client-kind account exists (via US1 or US2), but there is no code dependency between them.
- **User Story 4 (Phase 6)**: T020 depends only on T002 (Foundational) — can be verified immediately after Foundational, independent of US1-US3.
- **Polish (Phase 7)**: after all four user stories.

## Implementation Strategy

**MVP first**: Foundational (T001-T003) → User Story 1 (T004-T011) → stop and validate independently → ship. User Stories 2, 3, and 4 are additive, independent follow-ups with no risk to User Story 1's behavior.
