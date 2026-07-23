# Tasks: Rich Project Content & Client View

**Input**: Design documents from `/specs/003-rich-project-view/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included as mandatory, not optional — Constitution I (Test-First Coverage Discipline) requires every changed/new file to ship with tests in the same change; the 80% coverage gate is enforced in CI.

**Organization**: Tasks are grouped by phase, then by user story. Both user stories depend on the same Foundational phase (both need to know the viewer's role/admin status); User Story 1 and User Story 2 are independent of *each other* once Foundational is done.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 or US2

---

## Phase 1: Setup

No new scaffolding needed — this feature extends the existing `apps/api` `projects` module and `apps/web` `features/projects`/`features/invitations`. Skipping directly to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Give the frontend a way to know the signed-in user's own `role`/`isAdmin` for a project, and loosen the members-list read path to any member — both User Story 1 and User Story 2 depend on this.

**⚠️ CRITICAL**: Neither user story can be correctly implemented until this phase is complete.

- [X] T001 [P] Add `ProjectMemberRoleSchema` (if not already defined) and a `ProjectDetailSchema` (extends `ProjectSchema` with `role: ProjectMemberRoleSchema` and `isAdmin: z.boolean()`) plus its inferred `ProjectDetail` type, in `packages/schemas/src/project.ts`.
- [X] T002 Add a private `assertIsMember(userId, projectId)` method to `apps/api/src/projects/projects.service.ts` — returns the caller's own membership row, throws `NotFoundException` if the caller is not a member (mirrors `assertIsAdmin`'s existing not-a-member branch, without the admin check).
- [X] T003 In `apps/api/src/projects/projects.service.ts`, replace the `assertIsAdmin` call in `findMembersForProject` with `assertIsMember` (depends on T002).
- [X] T004 In `apps/api/src/projects/projects.service.ts`, extend `findOneForUser` to also return the caller's `role` and `isAdmin` from the membership row it already queries to confirm membership (depends on T001).
- [X] T005 [P] Update `apps/api/src/projects/projects.controller.ts` (and any response-mapping helper) so `GET /projects/:id` returns the shape defined by `ProjectDetailSchema` (depends on T004).
- [X] T006 [P] In `apps/web/features/projects/api.ts` and `hooks.ts`, change `getProject`'s return type to `ProjectDetail` (from `schemas`) so `useProject(id)` exposes `role`/`isAdmin` to callers (depends on T005).
- [X] T007 [P] Add/extend tests in `apps/api/src/projects/projects.service.spec.ts`: a non-member calling `findMembersForProject` gets `NotFoundException`; a non-admin member successfully receives the list; `findOneForUser` returns the correct `role`/`isAdmin` for the caller (depends on T002, T003, T004).
- [X] T008 [P] Add/extend tests in `apps/api/src/projects/projects.controller.spec.ts` covering the extended `GET /projects/:id` response shape (depends on T005).

**Checkpoint**: Foundation ready — both user stories can now proceed.

---

## Phase 3: User Story 1 - Role-appropriate project page (Priority: P1) 🎯 MVP

**Goal**: A contributor keeps the full management view; a client sees a simplified, read-only view; an admin client keeps member/invitation management despite the simplified view.

**Independent Test**: Log in as a contributor, an admin client, and a non-admin client on the same project; confirm each sees exactly the controls their role/admin status grants (see `quickstart.md`).

### Implementation for User Story 1

- [X] T009 [US1] In `apps/web/features/projects/components/project-members-list.tsx`, accept a `canManageMembers: boolean` prop; only render the Remove button (and only call `useRemoveMember`'s mutation) when `true`.
- [X] T010 [US1] In `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`, read `project.role`/`project.isAdmin` (from T006); pass `canManageMembers={project.isAdmin}` to `ProjectMembersList`; render `InvitationsCard` only when `project.isAdmin`; render the existing Settings/Documentation-as-dev-tooling placeholder cards only when `project.role === "contributor"` (depends on T006, T009).

### Tests for User Story 1

- [X] T011 [P] [US1] Update `apps/web/features/projects/components/project-members-list.test.tsx`: add cases for `canManageMembers={false}` (no Remove button rendered, no removal mutation call possible) and `={true}` (existing behavior preserved) (depends on T009).
- [X] T012 [P] [US1] Update `apps/web/app/[locale]/(protected)/projects/[id]/page.test.tsx`: add scenarios for contributor+admin, contributor+non-admin, client+non-admin, and client+admin, asserting presence/absence of the Invitations card, Settings/Documentation placeholders, and member-removal controls in each case (depends on T010).

**Checkpoint**: User Story 1 is fully functional and independently testable — this alone is a shippable increment.

---

## Phase 4: User Story 2 - Reserved space for future project content (Priority: P2)

**Goal**: A client sees six clearly-labeled, honest "coming soon" placeholder cartouches (project overview, discovery/audit findings, technical decisions, roadmap, documentation, current task) — no fabricated content, no data-entry control.

**Independent Test**: Open a project page as a client; confirm all six placeholders are present, clearly labeled, and contain no form control or invented content (see `quickstart.md`).

### Implementation for User Story 2

- [X] T013 [P] [US2] Create `apps/web/features/projects/components/coming-soon-card.tsx` — a small reusable presentational component (icon, title, message), extracted from the existing inline Settings/Documentation-as-dev-tooling placeholder markup on the project page.
- [X] T014 [P] [US2] Add translation keys under `Projects.ProjectPage` for the six new placeholders (overview, discoveryAudit, technicalDecisions, roadmap, documentation, currentTask — title + "coming soon" message each) in `apps/web/messages/en.json` and `apps/web/messages/fr.json`.
- [X] T015 [US2] In `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`, replace the inline Settings/Documentation-as-dev-tooling card markup with `ComingSoonCard` (depends on T013); render the six new `ComingSoonCard` instances only when `project.role === "client"` (depends on T006, T013, T014).

### Tests for User Story 2

- [X] T016 [P] [US2] Create `apps/web/features/projects/components/coming-soon-card.test.tsx`: renders the icon/title/message it's given (depends on T013).
- [X] T017 [P] [US2] Update `apps/web/app/[locale]/(protected)/projects/[id]/page.test.tsx`: assert the six placeholders render for a client viewer, do not render for a contributor viewer, and contain no form control (depends on T015).

**Checkpoint**: Both user stories independently functional — this is the full feature.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T018 [P] Run `pnpm --filter web lint` and `pnpm --filter api lint`; fix any findings introduced by the above tasks.
- [X] T019 [P] Run `pnpm --filter web test:cov` and `pnpm --filter api test:cov`; confirm the 80% coverage gate holds.
- [X] T020 Manually run through every scenario in `specs/003-rich-project-view/quickstart.md` against a local dev server.
- [X] T021 Flag to the user (do not perform automatically) that `docs/PRODUCT.md`'s "Out of scope" list should eventually be updated once the tool-connector/AI-extraction direction becomes active work — a deliberate, separate step per the spec's Assumptions, not part of this task list.

---

## Dependencies & Execution Order

- **Setup**: none — skipped.
- **Foundational (Phase 2)**: T001 → T002/T004 (schema first) → T003/T005 → T006 → T007/T008. Blocks both user stories.
- **User Story 1 (Phase 3)**: starts after Foundational. T009 and T010 are sequential (page depends on the prop the component adds); T011/T012 depend on their respective implementation tasks but can run in parallel with each other.
- **User Story 2 (Phase 4)**: starts after Foundational; independent of User Story 1 (different cards, same page file — see note below). T013/T014 can run in parallel; T015 depends on both; T016/T017 depend on their respective implementation tasks.
- **Polish (Phase 5)**: after both user stories are complete.

**Note on shared file**: T010 (US1) and T015 (US2) both edit `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`. They are conceptually independent (different cards on the same page) but cannot literally run in parallel against the same file — implement US1's page changes (T010) before US2's (T015), or reconcile a merge conflict if done in parallel branches.

## Implementation Strategy

**MVP first**: Foundational (T001-T008) → User Story 1 (T009-T012) → stop and validate independently → ship. User Story 2 (T013-T017) is a purely additive follow-up increment with no risk to User Story 1's behavior.
