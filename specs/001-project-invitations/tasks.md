---

description: "Task list for feature implementation"
---

# Tasks: Project Invitations

**Input**: Design documents from `/specs/001-project-invitations/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/invitations-api.md, quickstart.md

**Tests**: Included — constitution Principle I (Test-First Coverage Discipline) makes the 80% coverage gate non-negotiable in this repo, so every implementation task ships with its test task.

**Organization**: Tasks are grouped by user story (spec.md), in priority order (P1 → P2).

**Note on existing code**: A partial implementation already exists on the
not-yet-merged `feat/invitations` branch (base invite/accept flow, but no
cancel/resend/remove-member, and no already-member block). These tasks
describe the complete, correct feature per the spec — once this branch is
reconciled with `feat/invitations`, run `/speckit-converge` to mark what's
already satisfied rather than re-doing it.

**Revision note (2026-07-22, pass 1)**: Updated after `/speckit-analyze`
found 4 issues — C1 (zero task coverage for the pending-invitations list
endpoint), C2 (no explicit test for idempotent accept / FR-016), U1 (no
explicit test for the invitation page showing project + email / FR-010),
and I1 (an admin-check task misplaced in Foundational when only one story
needs it). Fixed via T007, T008, T018, T026, and T057.

**Revision note (2026-07-22, pass 2)**: Updated after a second
`/speckit-analyze` pass found 2 more issues — X1 (FR-011/data-model.md had
drifted to say invited clients get admin status by default, contradicting
the rest of the spec; corrected in spec.md/data-model.md, no task impact)
and X2 (no task verified that `POST /invitations/:token/accept` actually
refuses a non-pending invitation — only the GET-status-display path was
covered, leaving SC-004 unverified). Fixed via new T036 and T039 in Phase 7,
which shifted every task ID from the old T036 onward by +2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps the task to a user story (US1–US8) for traceability

## Path Conventions

Monorepo, real paths per plan.md: `apps/api/src/...` (NestJS), `apps/web/...` (Next.js), `packages/schemas/src/...` (shared Zod types).

---

## Phase 1: Setup

- [X] T001 Confirm no new dependency or Prisma migration is needed (research.md §1 — `Invitation.status` stays a plain string; `"cancelled"` is just a new value)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Must complete before any user story phase below.

- [X] T002 [P] Add `"cancelled"` to the invitation status type in `packages/schemas/src/invitation.ts`
- [X] T003 [P] Extend `apps/api/src/test/prisma-mock.ts` with any `projectMember`/`invitation` mock methods needed by later phases (e.g. `projectMember.delete`, `projectMember.findMany` for admin-count checks)

**Checkpoint**: Foundation ready — user story phases can begin.

---

## Phase 3: User Story 1 - Admin invites someone to a project (Priority: P1) 🎯 MVP

**Goal**: An admin invites a person by email and receives a shareable link; the already-a-member case is blocked with a clear error (FR-022); the admin can see the project's pending invitations (FR-018).

**Independent Test**: Admin submits an email on a project they administer, receives a unique link and sees it in the pending list; a non-admin's attempt is refused; inviting an existing member is refused with a distinct error.

### Tests for User Story 1

- [X] T004 [P] [US1] Invitation creation success + non-admin refusal in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T005 [P] [US1] Already-a-member invite is refused (409) in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T006 [P] [US1] `POST /projects/:projectId/invitations` delegates correctly in `apps/api/src/invitations/invitations.controller.spec.ts`
- [X] T007 [P] [US1] `findAllForProject` returns only that project's *pending* invitations (FR-018) in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T008 [P] [US1] `GET /projects/:projectId/invitations` delegates correctly in `apps/api/src/invitations/invitations.controller.spec.ts`
- [X] T009 [P] [US1] `createInvitation` request shape in `apps/web/features/invitations/api.test.ts`
- [X] T010 [P] [US1] Submit + already-a-member error display in `apps/web/features/invitations/components/invite-client-form.test.tsx`

### Implementation for User Story 1

- [X] T011 [US1] Implement `create` (admin-only, token + 7-day expiry, already-member check per FR-022) in `apps/api/src/invitations/invitations.service.ts`
- [X] T012 [US1] Implement `POST /projects/:projectId/invitations` in `apps/api/src/invitations/invitations.controller.ts`
- [X] T013 [P] [US1] Implement `createInvitation` in `apps/web/features/invitations/api.ts`
- [X] T014 [US1] Implement `InviteClientForm` (surface the already-a-member error) in `apps/web/features/invitations/components/invite-client-form.tsx`

**Checkpoint**: User Story 1 fully functional and testable independently.

---

## Phase 4: User Story 2 - New person accepts by creating an account (Priority: P1)

**Goal**: Someone with no existing account creates one directly from the invite link and gains project access — as a non-admin client (FR-011, clarified 2026-07-22).

**Independent Test**: Open a pending invitation for an unregistered email, confirm the page shows which project and email it's for, complete the signup-style form, confirm sign-in + non-admin project access.

### Tests for User Story 2

- [X] T015 [P] [US2] `GET /invitations/:token` returns `accountExists: false` for an unregistered email in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T016 [P] [US2] `accept` creates account + non-admin membership (`isAdmin: false`) + marks accepted (new-account branch) in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T017 [P] [US2] `invitation-acceptance.controller.spec.ts`: accept sets session cookie, strips password hash
- [X] T018 [P] [US2] Signup-style form fields render + submit, **and the page shows the project's name and the invited email (FR-010)**, in `apps/web/features/invitations/components/accept-invitation-form.test.tsx` / `apps/web/app/[locale]/(public)/invite/[token]/page.test.tsx`
- [X] T019 [P] [US2] `/invite/[token]` renders signup form when `accountExists: false` in `apps/web/app/[locale]/(public)/invite/[token]/page.test.tsx`

### Implementation for User Story 2

- [X] T020 [US2] Implement `getByToken` + `accept` new-account branch (membership created with `isAdmin: false`) in `apps/api/src/invitations/invitations.service.ts`
- [X] T021 [US2] Implement `GET /invitations/:token` + `POST /invitations/:token/accept` in `apps/api/src/invitations/invitation-acceptance.controller.ts`
- [X] T022 [P] [US2] Implement `getInvitationByToken` + `acceptInvitation` in `apps/web/features/invitations/api.ts`
- [X] T023 [US2] Implement `AcceptInvitationForm` signup-style fields in `apps/web/features/invitations/components/accept-invitation-form.tsx`
- [X] T024 [US2] Implement `/invite/[token]` page (shows project name + invited email) in `apps/web/app/[locale]/(public)/invite/[token]/page.tsx`

**Checkpoint**: User Stories 1–2 both functional independently.

---

## Phase 5: User Story 3 - Returning person accepts by logging in (Priority: P1)

**Goal**: Someone who already has an account joins by confirming their password — no duplicate account, no duplicate membership even if already a member (FR-016).

**Independent Test**: Open a pending invitation for a registered email; wrong password is refused without consuming the invitation; correct password signs them in with access, without a second account or duplicate membership.

### Tests for User Story 3

- [X] T025 [P] [US3] `accept` existing-account branch: correct password succeeds, wrong password refused (401) and invitation stays usable, in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T026 [P] [US3] Accepting an invitation for a project the person already belongs to does **not** create a duplicate `ProjectMember` row (FR-016) in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T027 [P] [US3] Login-style form (password only) renders when `accountExists: true` in `apps/web/features/invitations/components/accept-invitation-form.test.tsx`

### Implementation for User Story 3

- [X] T028 [US3] Implement `accept` existing-account branch (argon2 verify, idempotent membership check) in `apps/api/src/invitations/invitations.service.ts`
- [X] T029 [US3] Extend `AcceptInvitationForm` to render password-only when `accountExists: true` in `apps/web/features/invitations/components/accept-invitation-form.tsx`

**Checkpoint**: User Stories 1–3 functional independently.

---

## Phase 6: User Story 4 - Invitee sees their invited project(s) (Priority: P1)

**Goal**: After signing in through either acceptance path, the invitee's own space lists every project they belong to, including the one just joined.

**Independent Test**: Accept an invitation, then confirm the project appears in that user's project list; confirm a user in several projects sees all of them.

### Tests for User Story 4

- [X] T030 [P] [US4] Newly created membership appears in `findAllForUser` in `apps/api/src/projects/projects.service.spec.ts` (extend existing test with an invitation-originated membership fixture, if not already covered)
- [X] T031 [P] [US4] Dashboard shows the newly joined project in `apps/web/features/projects/components/project-list.test.tsx` (extend existing test if needed)

### Implementation for User Story 4

- [X] T032 [US4] Verify `ProjectsService.findAllForUser` (already built) requires no change — membership created by acceptance is a normal `ProjectMember` row
- [X] T033 [US4] Run `quickstart.md` § US4 manually to confirm end-to-end

**Checkpoint**: User Stories 1–4 (all P1) functional independently — this is the full MVP slice.

---

## Phase 7: User Story 5 - Invitee opens a link that is no longer valid (Priority: P2)

**Goal**: Expired, cancelled, already-accepted, and unknown-token links each show a clear, correct message instead of a broken form — and critically, none of them can actually be accepted (FR-012/013/014, SC-004).

**Independent Test**: Open an expired link, a cancelled link, an already-accepted link, and a nonexistent token — confirm each shows the right message and no form. Separately, attempt to `POST .../accept` on each non-pending state and confirm all are refused.

### Tests for User Story 5

- [X] T034 [P] [US5] `getByToken` reports `status: 'expired'`/`'cancelled'`/`'accepted'` correctly and 404s for an unknown token, in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T035 [P] [US5] `/invite/[token]` renders the correct message per status (invalid / no-longer-available / already-accepted) in `apps/web/app/[locale]/(public)/invite/[token]/page.test.tsx`
- [X] T036 [P] [US5] `accept` refuses (409) when the invitation is expired, cancelled, or already accepted, and creates no session in any case (FR-012/FR-013/FR-014, SC-004), in `apps/api/src/invitations/invitations.service.spec.ts`

### Implementation for User Story 5

- [X] T037 [US5] Ensure `getByToken` distinguishes `cancelled` from `expired` internally but the page (per spec Assumptions) shows one generic "no longer available" message for both, and a distinct "already accepted" message
- [X] T038 [US5] Update `apps/web/app/[locale]/(public)/invite/[token]/page.tsx` messaging accordingly
- [X] T039 [US5] Add a pending-status guard at the start of `accept` — refuse with `409` before either the new-account or existing-account branch runs when the invitation isn't `pending` — in `apps/api/src/invitations/invitations.service.ts`

**Checkpoint**: User Stories 1–5 functional independently.

---

## Phase 8: User Story 6 - Admin cancels a pending invitation (Priority: P2)

**Goal**: An admin cancels a pending invitation; its link stops working; non-admins can't cancel.

**Independent Test**: Create an invitation, cancel it, confirm its link no longer leads to a working form and it drops out of the pending list.

### Tests for User Story 6

- [X] T040 [P] [US6] `cancel`: success, non-admin refusal, refuses cancelling a non-pending invitation (409), in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T041 [P] [US6] `PATCH /projects/:projectId/invitations/:invitationId/cancel` delegates correctly in `apps/api/src/invitations/invitations.controller.spec.ts`
- [X] T042 [P] [US6] `useCancelInvitation` in `apps/web/features/invitations/hooks.test.tsx`
- [X] T043 [P] [US6] Cancel action per row in `apps/web/features/invitations/components/invitations-list.test.tsx`

### Implementation for User Story 6

- [X] T044 [US6] Implement `cancel` in `apps/api/src/invitations/invitations.service.ts`
- [X] T045 [US6] Implement `PATCH /projects/:projectId/invitations/:invitationId/cancel` in `apps/api/src/invitations/invitations.controller.ts`
- [X] T046 [P] [US6] Implement `cancelInvitation` + `useCancelInvitation` in `apps/web/features/invitations/api.ts` / `hooks.ts`
- [X] T047 [US6] Add cancel action to `apps/web/features/invitations/components/invitations-list.tsx`

**Checkpoint**: User Stories 1–6 functional independently.

---

## Phase 9: User Story 7 - Admin resends a pending invitation (Priority: P2)

**Goal**: Resending (or re-inviting an already-pending email) keeps the same link valid and resets its expiration, without creating a duplicate invitation.

**Independent Test**: Resend a pending invitation and confirm the same link still works with a later expiry; re-invite the same pending email and confirm exactly one invitation remains.

### Tests for User Story 7

- [X] T048 [P] [US7] `resend`: extends `expiresAt`, keeps `token`, refuses on non-pending (409), in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T049 [P] [US7] `create` on an email with an existing pending invitation delegates to resend (FR-008), in `apps/api/src/invitations/invitations.service.spec.ts`
- [X] T050 [P] [US7] `POST /projects/:projectId/invitations/:invitationId/resend` delegates correctly in `apps/api/src/invitations/invitations.controller.spec.ts`
- [X] T051 [P] [US7] `useResendInvitation` in `apps/web/features/invitations/hooks.test.tsx`
- [X] T052 [P] [US7] Resend action per row in `apps/web/features/invitations/components/invitations-list.test.tsx`

### Implementation for User Story 7

- [X] T053 [US7] Implement `resend` in `apps/api/src/invitations/invitations.service.ts`; update `create` to delegate to it when a pending invitation already exists for that (project, email)
- [X] T054 [US7] Implement `POST /projects/:projectId/invitations/:invitationId/resend` in `apps/api/src/invitations/invitations.controller.ts`
- [X] T055 [P] [US7] Implement `resendInvitation` + `useResendInvitation` in `apps/web/features/invitations/api.ts` / `hooks.ts`
- [X] T056 [US7] Add resend action to `apps/web/features/invitations/components/invitations-list.tsx`

**Checkpoint**: User Stories 1–7 functional independently.

---

## Phase 10: User Story 8 - Admin removes a member from the project (Priority: P2)

**Goal**: An admin removes any existing member (including another admin), except when it would leave the project with zero admins.

**Independent Test**: Remove a client member — access revoked. Attempt to remove the project's only admin — refused. Non-admins can't remove anyone.

- [X] T057 [US8] Add an admin-membership check to `apps/api/src/projects/projects.service.ts` (mirrors `InvitationsService`'s existing `assertIsAdmin` pattern — Feature Isolation means each module keeps its own copy rather than importing the other's). *Relocated here from Foundational — only this story needs it.*

### Tests for User Story 8

- [X] T058 [P] [US8] `removeMember`: success (client and admin target), non-admin refusal, last-admin protection (409), in `apps/api/src/projects/projects.service.spec.ts`
- [X] T059 [P] [US8] `DELETE /projects/:projectId/members/:userId` delegates correctly in `apps/api/src/projects/projects.controller.spec.ts`
- [X] T060 [P] [US8] `useRemoveMember` in `apps/web/features/projects/hooks.test.tsx`
- [X] T061 [P] [US8] Remove action + last-admin disabled state in `apps/web/features/projects/components/project-members-list.test.tsx`

### Implementation for User Story 8

- [X] T062 [US8] Implement `removeMember` (last-admin check via T057) in `apps/api/src/projects/projects.service.ts`
- [X] T063 [US8] Implement `DELETE /projects/:projectId/members/:userId` in `apps/api/src/projects/projects.controller.ts`
- [X] T064 [P] [US8] Implement `removeMember` + `useRemoveMember` in `apps/web/features/projects/api.ts` / `hooks.ts`
- [X] T065 [US8] Create `apps/web/features/projects/components/project-members-list.tsx`; render it in `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`

**Checkpoint**: All 8 user stories functional independently.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T066 [P] Run `pnpm test:cov` on both apps — confirm the 80% gate holds
- [X] T067 [P] Run `pnpm lint` and `pnpm build` on both apps
- [X] T068 Run every scenario in `quickstart.md` manually against a real dev server — full curl-based smoke pass against a live Postgres + NestJS + Next.js stack covering US1–US8, plus a browser check of the project page and invite-acceptance page (no console errors, last-admin button correctly disabled)
- [X] T069 Reconcile against the not-yet-merged `feat/invitations` branch — run `/speckit-converge` to identify what's already satisfied vs. still to build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → no dependencies
- **Foundational (Phase 2)** → depends on Setup; BLOCKS every user story phase (now genuinely story-agnostic — T002/T003 are needed regardless of which story runs first)
- **User Stories (Phases 3–10)** → all depend on Foundational; independent of each other, but P1 stories (US1–4, Phases 3–6) form the MVP and are listed first
- **Polish (Phase 11)** → depends on whichever user stories are in scope for a given delivery

### User Story Dependencies

- US1 (Phase 3): no dependency on other stories — true entry point
- US2 (Phase 4), US3 (Phase 5): both depend on US1 existing (need a pending invitation to accept), but are independently testable once one exists
- US4 (Phase 6): depends on US2 or US3 having granted at least one membership
- US5 (Phase 7): independent — only needs invitations in various terminal states
- US6 (Phase 8), US7 (Phase 9): both depend on US1 (need a pending invitation to act on)
- US8 (Phase 10): depends on at least one non-admin membership existing (via US2/US3); its own admin-check prerequisite (T057) now lives inside this phase rather than Foundational

### Parallel Opportunities

- Foundational tasks T002/T003 in parallel
- Within each user story phase, all test tasks marked [P] run in parallel; most implementation tasks touch shared files (`invitations.service.ts`, `invitations.controller.ts`) sequentially within a phase
- Different user story phases can be staffed in parallel once Foundational is done, respecting the dependencies above

---

## Implementation Strategy

### MVP First

Phases 1 → 2 → 3 → 4 → 5 → 6 (Setup, Foundational, US1–US4) deliver the
complete P1 slice: invite (with visible pending list), accept (both paths,
idempotent), and see the joined project. Stop and validate here before
moving to the P2 admin-control stories (cancel/resend/remove, Phases 7–10).

### Incremental Delivery

Each phase after Foundational is an independently testable increment — validate with `quickstart.md`'s matching section before moving to the next phase.

---

## Phase 12: Convergence

Appended by `/speckit-converge` (2026-07-22) after assessing the actual code
on the not-yet-merged `feat/invitations` branch against this spec/plan/tasks
set. Ordered CRITICAL/HIGH first per finding; see the in-session
Convergence Findings report for full evidence.

- [X] T070 Change `isAdmin: true` to `isAdmin: false` when creating an invitation in `apps/api/src/invitations/invitations.service.ts` (`create()`), so accepted invitations grant client, non-admin membership per FR-011 (contradicts)
- [X] T071 Update the `isAdmin: true` expectations in `apps/api/src/invitations/invitations.service.spec.ts` to `isAdmin: false` to match T070 per FR-011 (contradicts)
- [X] T072 Filter `findAllForProject` in `apps/api/src/invitations/invitations.service.ts` to return only currently-pending invitations (excluding accepted, cancelled, and time-expired) per FR-018 (contradicts)
- [X] T073 Reconcile the invitation status string used in code (`'invited'`) with the spec's terminology (`'pending'`) — either rename the stored value across `invitations.service.ts` / `invitations.service.spec.ts` / `packages/schemas/src/invitation.ts` / web consumers, or amend spec.md's Key Entities section to document `'invited'` as the accepted synonym per FR-004 (contradicts)
- [X] T074 Add an already-member guard to `create()` in `apps/api/src/invitations/invitations.service.ts` — reject with 409 before creating/touching an invitation when the invited email already has a `ProjectMember` row on the project per FR-022 (missing)
- [X] T075 Add a test for the already-member guard in `apps/api/src/invitations/invitations.service.spec.ts` per FR-022 (missing)
- [X] T076 Surface the "already a member" error distinctly in `apps/web/features/invitations/components/invite-client-form.tsx` (and its test) per FR-022 (missing)
- [X] T077 Add `'cancelled'` as a valid status value to `packages/schemas/src/invitation.ts` (`InvitationDetailsSchema` and any other status unions) per FR-004 (missing)
- [X] T078 Implement `cancel(userId, projectId, invitationId)` in `apps/api/src/invitations/invitations.service.ts` (admin-only, pending-only, 409 otherwise) with a test in `invitations.service.spec.ts` per FR-006 (missing)
- [X] T079 Implement `PATCH /projects/:projectId/invitations/:invitationId/cancel` in `apps/api/src/invitations/invitations.controller.ts` with a test in `invitations.controller.spec.ts` per FR-006 (missing)
- [X] T080 Implement `resend(userId, projectId, invitationId)` in `apps/api/src/invitations/invitations.service.ts` (extends `expiresAt`, keeps `token`, 409 on non-pending) with a test per FR-007 (missing)
- [X] T081 Update `create()` in `apps/api/src/invitations/invitations.service.ts` to delegate to `resend` when a pending invitation already exists for the same (project, email), with a test, per FR-008 (missing)
- [X] T082 Implement `POST /projects/:projectId/invitations/:invitationId/resend` in `apps/api/src/invitations/invitations.controller.ts` with a test per FR-007 (missing)
- [X] T083 Extend the pending-status guard at the start of `accept()` in `apps/api/src/invitations/invitations.service.ts` to also refuse (409) a cancelled invitation, with a test, per FR-012/FR-013/FR-014/SC-004 (partial)
- [X] T084 Update `apps/web/app/[locale]/(public)/invite/[token]/page.tsx` to render the *same* "no longer available" message for a cancelled invitation as for an expired one (per spec Assumptions — corrected wording; the original phrasing here said "distinct," which contradicted spec.md) per FR-013 (partial)
- [X] T085 Add `cancelInvitation`/`resendInvitation` to `apps/web/features/invitations/api.ts` and `useCancelInvitation`/`useResendInvitation` to `apps/web/features/invitations/hooks.ts`, with tests, per FR-006/FR-007 (missing)
- [X] T086 Add cancel/resend action buttons per row in `apps/web/features/invitations/components/invitations-list.tsx`, with a test, per FR-006/FR-007 (missing)
- [X] T087 Add an admin-membership check helper to `apps/api/src/projects/projects.service.ts` (mirrors `InvitationsService`'s `assertIsAdmin`, kept separate per Constitution III Feature Isolation) per FR-002 (missing)
- [X] T088 Implement `removeMember(userId, projectId, targetUserId)` in `apps/api/src/projects/projects.service.ts` with last-admin protection, with a test, per FR-019/FR-020 (missing)
- [X] T089 Implement `DELETE /projects/:projectId/members/:userId` in `apps/api/src/projects/projects.controller.ts` with a test per FR-019 (missing)
- [X] T090 Add `removeMember`/`useRemoveMember` to `apps/web/features/projects/api.ts` / `apps/web/features/projects/hooks.ts`, with tests, per FR-019 (missing)
- [X] T091 Create `apps/web/features/projects/components/project-members-list.tsx` (members list, remove action, last-admin disabled state) and render it on the project page, with a test, per FR-019/FR-020 (missing)
