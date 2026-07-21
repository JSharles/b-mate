# Implementation Plan: Project Invitations

**Branch**: `spec/invitations` (spec/plan work) → implementation lands on `feat/invitations` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-project-invitations/spec.md`

## Summary

Extend the existing invitation system with admin controls the current build
is missing — cancel, resend, and remove-member — plus one behavior fix
(block inviting someone who's already a member). The public token-based
acceptance flow (create account vs. log in, adapting to whether the email
already has an account) is already built and matches the spec; this plan
focuses on the gap between what's specified and what exists, so
`/speckit-tasks` → `/speckit-implement` (or `/speckit-converge` against the
not-yet-merged `feat/invitations` branch) only need to build the delta.

No new dependencies and no database migration are required: `Invitation.status`
is already an untyped string column, so "cancelled" is just a new value, not a
schema change.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js runtime via NestJS 11 (`apps/api`) and Next.js 16 App Router (`apps/web`)

**Primary Dependencies**: NestJS 11, Prisma 7 (`prisma-client-js` generator) + `@prisma/adapter-pg`, argon2, class-validator/class-transformer — backend. Next.js 16, React 19, Tailwind v4, shadcn/ui, TanStack Query, react-hook-form + Zod (`packages/schemas`) — frontend.

**Storage**: PostgreSQL via Prisma. `Invitation.status` is a plain `String` (no enum constraint at the DB level) — adding "cancelled" as a valid value requires no migration.

**Testing**: Jest with `apps/api/src/test/prisma-mock.ts` (`createPrismaMock`/`asPrismaService`) for `apps/api`; Vitest + React Testing Library for `apps/web`. 80% coverage gate enforced by `pnpm test:cov` locally and in CI.

**Target Platform**: Web — NestJS API on Railway (`apps/api`), Next.js web app (`apps/web`).

**Project Type**: Web application (monorepo, frontend + backend) — this repo's real structure (`apps/api`, `apps/web`), not a generic template layout.

**Performance Goals**: None new. Success Criteria in the spec (SC-001–SC-006) are UX-timing based (seconds to complete an action), not throughput-based, and are already comfortably met by the existing session-cookie auth path at this project's scale.

**Constraints**: Must satisfy constitution Principles I–VI (see Constitution Check below).

**Scale/Scope**: Extends the existing `apps/api/src/invitations` module and `apps/web/features/invitations` module (both already scaffolded on the not-yet-merged `feat/invitations` branch) with 3 new admin actions (cancel, resend, remove-member) and 1 new validation rule (block invite-if-already-member). No new top-level module on either app.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-First Coverage Discipline | PASS | Every new service method/endpoint/component gets a spec/test file alongside it, following the existing `*.service.spec.ts` / `*.test.tsx` pattern already in this codebase. |
| II. Type Safety, No Escape Hatches | PASS | New DTOs use `class-validator`; no `any`; shared types added to `packages/schemas`. |
| III. Feature Isolation | PASS | All new code stays inside the existing `invitations` module (api) and `features/invitations` (web) — no cross-feature imports. |
| IV. Never Resolve Open Product Decisions Unilaterally | PASS | This entire spec → clarify → plan sequence exists to satisfy this principle; every ambiguity was surfaced and answered by the user before this plan was written. |
| V. Security and Privacy by Default | PASS | Invitation tokens stay cryptographically random (`randomBytes(32)`, unchanged); the already-member block (FR-022) is admin-facing information about a project the admin already manages, not a stranger-facing existence leak; passwords stay Argon2id-hashed. |
| VI. Spec Before Multi-Screen/Multi-Endpoint Features | SATISFIED | This is that process, in progress. |

No violations. Complexity Tracking table intentionally left empty below.

**Post-Phase-1 re-check**: Confirmed after data-model.md and contracts were
drafted. The one structural decision worth double-checking against
Principle III — member removal living on `ProjectsService`/
`ProjectsController` rather than `InvitationsService` — actually
*reinforces* Feature Isolation rather than risking it: membership is a
Project-domain concern, not an Invitation-domain one, so it belongs with the
module that already owns `ProjectMember` mutations. No new violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-project-invitations/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── invitations-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
apps/api/src/invitations/
├── dto/
│   ├── create-invitation.dto.ts        # existing
│   ├── accept-invitation.dto.ts        # existing
│   ├── cancel-invitation.dto.ts        # new — no body, just params
│   └── remove-member.dto.ts            # new — no body, just params
├── invitations.service.ts               # existing — extend: cancel, resend, removeMember, already-member check
├── invitations.controller.ts            # existing — extend: PATCH .../cancel, POST .../resend
├── invitation-acceptance.controller.ts  # existing — unchanged
├── invitations.module.ts                # existing — unchanged (same providers/controllers, extended)
├── invitations.service.spec.ts          # existing — extend
├── invitations.controller.spec.ts       # existing — extend
└── invitation-acceptance.controller.spec.ts # existing — unchanged

apps/api/src/projects/
├── projects.controller.ts               # existing — add DELETE .../members/:userId route (member removal lives on the project resource, not the invitation one)
├── projects.service.ts                  # existing — extend: removeMember, with last-admin protection
└── (matching .spec.ts files extended)

apps/web/features/invitations/
├── api.ts                               # existing — extend: cancelInvitation, resendInvitation
├── hooks.ts                             # existing — extend: useCancelInvitation, useResendInvitation
├── schemas.ts                           # existing — unchanged (no new form fields; cancel/resend are button actions)
└── components/
    ├── invite-client-form.tsx           # existing — surface the new "already a member" error
    ├── invitations-list.tsx             # existing — extend: cancel/resend buttons per row
    └── accept-invitation-form.tsx       # existing — unchanged

apps/web/features/projects/
├── api.ts                               # existing — extend: removeMember
├── hooks.ts                             # existing — extend: useRemoveMember
└── components/
    └── project-members-list.tsx         # new — current members with a remove action per row

apps/web/app/[locale]/(protected)/projects/[id]/page.tsx  # existing — render project-members-list alongside the existing invite form/list

packages/schemas/src/invitation.ts       # existing — extend: status union includes "cancelled"
```

**Structure Decision**: Extend the existing feature-based modules on both
apps (`apps/api/src/invitations` + `apps/api/src/projects`, `apps/web/features/invitations`
+ `apps/web/features/projects`) rather than introducing a new top-level
module. Member removal is exposed on the `projects` resource
(`DELETE /projects/:id/members/:userId`), not the `invitations` one, since a
member is a `ProjectMember` row, not an `Invitation` row — the two are
already distinct entities in this codebase and should stay that way.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
