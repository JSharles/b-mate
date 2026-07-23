# Implementation Plan: Rich Project Content & Client View

**Branch**: `003-rich-project-view` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-rich-project-view/spec.md`

## Summary

The project page currently shows the same developer-oriented, management-heavy layout to every viewer regardless of role. This feature (1) gates the existing Members/Invitations/Settings/Documentation-as-dev-tooling cartouches by the viewer's actual `role`/`is_admin` on that specific project, and (2) adds six honestly-labeled "coming soon" placeholder cartouches reserving space for future, AI/connector-sourced project content — with zero manual data entry, per the locked "zero added process" product principle.

Implementing (1) requires two small, well-scoped backend changes discovered during planning: the frontend currently has no way to learn the signed-in user's own `role`/`is_admin` for a project, and the existing members-list endpoint is fully admin-gated (not just the removal action) — confirmed with the user to loosen to "any member can read, only an admin can remove."

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 (App Router) on `apps/web`; NestJS 11 on `apps/api` — both already in place, no new language/runtime.

**Primary Dependencies**: Existing stack only — TanStack Query, next-intl, Zod (`packages/schemas`), shadcn/ui `Card`. No new dependency.

**Storage**: PostgreSQL via Prisma — no schema/migration change. `ProjectMember.role` and `.isAdmin` already exist; this feature only changes which existing columns are *read* by which endpoints, and adds no new tables (the six placeholders in User Story 2 store nothing).

**Testing**: Vitest + React Testing Library (`apps/web`), Jest (`apps/api`) — same as the rest of the repo; 80% coverage gate applies to all new/changed code.

**Target Platform**: Web (existing Next.js app + NestJS API), no new platform.

**Project Type**: Web application (existing `apps/web` + `apps/api` monorepo structure) — extends existing modules, adds no new app.

**Performance Goals**: N/A beyond existing page-load expectations — no new heavy computation; the placeholder cartouches are static markup.

**Constraints**: Must not regress the anti-enumeration pattern already used elsewhere (`findOneForUser`, existing `assertIsAdmin`) — a non-member must get the same "not found" response as a nonexistent project, never a distinct "forbidden" that would confirm the project exists.

**Scale/Scope**: Two existing endpoints modified, one existing endpoint extended, ~6 frontend components touched or added, no new backend module.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage**: Applies — every touched file (service methods, page, components) needs updated/new tests in the same change. No exemption applies.
- **II. Type Safety**: Applies — the new viewer-membership fields are added to `packages/schemas` as proper Zod fields, not `any`.
- **III. Feature Isolation**: The new `ComingSoonCard` presentational component is used only within the `projects` feature's own project-detail page, so it lives in `features/projects/components/`, not `shared/`. Backend: `ProjectsService.assertIsMember` is a **new, separate** private method (not shared with `InvitationsService`'s own `assertIsAdmin`), consistent with the existing documented pattern of per-module copies (see the comment already on `ProjectsService.assertIsAdmin`).
- **IV. Never Resolve Open Product Decisions Unilaterally**: The one real open question found during planning (should a non-admin see the member roster at all) was raised to and answered by the user before this plan was written; nothing else discovered warrants a further pause.
- **V. Security and Privacy by Default**: The loosened members-read endpoint still throws `NotFoundException` (not a distinct "forbidden") for a non-member, preserving the existing "never confirm a project exists to a non-member" pattern. `removeProjectMember` keeps its existing full `assertIsAdmin` gate unchanged.
- **VI. Spec Before Multi-Screen/Multi-Endpoint Features**: This is why we're here — spec already written and clarified before this plan.

No violations. Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-rich-project-view/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/api/src/projects/
├── projects.service.ts         # add assertIsMember; loosen findMembersForProject's gate;
│                                # extend findOneForUser's return with viewer role/isAdmin
├── projects.controller.ts       # no route changes, response shape only
└── dto/                         # extend project response DTO/mapping if a separate mapper exists

packages/schemas/src/
└── project.ts                   # add a ProjectDetail (or extended Project) schema carrying
                                   # the viewer's own `role`/`isAdmin` for GET /projects/:id

apps/web/features/projects/
├── hooks.ts                     # useProject(id) return type picks up the new fields
├── components/
│   ├── project-members-list.tsx # accept/derive canManageMembers; hide Remove when false
│   └── coming-soon-card.tsx     # NEW — small reusable placeholder card (icon, title, message)

apps/web/features/invitations/components/
└── invitations-card.tsx         # rendered only when the page's isAdmin check passes (page-level gate)

apps/web/app/[locale]/(protected)/projects/[id]/
└── page.tsx                     # read project.role/isAdmin; conditionally render Invitations
                                   # card, Settings/Documentation dev-tooling cards; render 6
                                   # ComingSoonCard instances for the client-facing placeholders
```

**Structure Decision**: Extends the existing `apps/api` `projects` module and `apps/web` `features/projects`/`features/invitations` — no new module, no new app. One new small presentational component (`ComingSoonCard`) inside `features/projects/components/` since it is not (yet) needed anywhere outside this page.

## Complexity Tracking

*No violations — table not needed.*
