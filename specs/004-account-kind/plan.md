# Implementation Plan: Explicit Account Kind (Developer vs Client)

**Branch**: `004-account-kind` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-account-kind/spec.md`

## Summary

Add a durable, account-level `accountKind` (`developer` | `client`) to `User`, distinct from and orthogonal to the existing per-project `role`/`isAdmin`. It's set explicitly at direct signup (a new required choice in the signup form), set automatically to `client` when an account is created via invitation acceptance, and drives one concrete behavior today: "Create a project" is hidden from `client`-kind accounts on Home **and rejected by the API** if attempted directly — developer and client are non-overlapping audiences by design, so there is no legitimate case to leave open. Pre-existing accounts are backfilled from their current `ProjectMember` rows: `developer` if they hold any `contributor` membership, `client` if all memberships are `client`, `developer` if they have none (the only completed flow before this feature was direct signup).

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 (`apps/web`), NestJS 11 (`apps/api`) — existing stack, no change.

**Primary Dependencies**: Existing stack only — Prisma 7, Zod (`packages/schemas`), React Hook Form, next-intl. No new dependency.

**Storage**: PostgreSQL via Prisma. One schema change: a new `AccountKind` enum and a required `account_kind` column on `users`. Requires a real migration with a backfill step (existing rows can't be left null), not just an additive nullable column.

**Testing**: Vitest + RTL (`apps/web`), Jest (`apps/api`) — same as the rest of the repo; 80% coverage gate applies.

**Target Platform**: Web (existing app), no new platform.

**Project Type**: Web application — extends existing `apps/api` `auth`/`invitations` modules and `apps/web` `features/auth`/`features/projects`, plus one Prisma migration. No new module.

**Performance Goals**: N/A — reading one extra column on an already-fetched row; no new query pattern.

**Constraints**: The migration must never leave an existing account with a null/undefined kind (FR-005); it must run as a single deploy-time migration, consistent with this repo's existing `prisma migrate deploy` workflow (see AGENTS.md), not a manual one-off script.

**Scale/Scope**: One schema migration, one new signup form field, one small backend branch (invitation acceptance sets kind automatically), one gated UI element (Home's "Create a project"). Small and contained.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage**: Applies. Every touched file (signup DTO/service, invitation acceptance, `ProjectList` gating, migration backfill logic) needs tests in the same change.
- **II. Type Safety**: Applies. `accountKind` is a real Zod enum (`z.enum(["developer", "client"])`) end to end — request schema, `User` response schema, Prisma enum — never a loose string or `any`.
- **III. Feature Isolation**: The signup-kind choice lives in `features/auth` (already owns signup). The Home gating lives in `features/projects` (`ProjectList` already owns Home's project UI and already calls its own hooks); it reads the current user via the existing shared `useCurrentUser` hook rather than a new prop threaded through the page, consistent with why that hook lives in `shared/` (AGENTS.md: "almost every feature needs to know who's logged in").
- **IV. Never Resolve Open Product Decisions Unilaterally**: The one real open question (mutability of `accountKind` after creation) was raised to and resolved with the user during specification (kind is not permanently locked, but no self-service change UI is built now). Nothing else discovered during planning warrants a further pause.
- **V. Security and Privacy by Default**: `accountKind` gates one real capability — `POST /projects` rejects client-kind callers — in addition to the matching UI hide on Home. This is a narrow, single, well-understood authorization check (one endpoint, one enum comparison), not a broad new access-control surface.
- **VI. Spec Before Multi-Screen/Multi-Endpoint Features**: This is why we're here — spec already written, clarified, and discussed at length with the user before this plan.

No violations. Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-account-kind/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/api/prisma/
└── schema.prisma                 # add `enum AccountKind { developer client }`;
                                    # add `accountKind AccountKind @map("account_kind")` on User
└── migrations/                   # new migration: add column + backfill + NOT NULL, in one migration

apps/api/src/auth/
├── dto/signup.dto.ts              # add accountKind (validated enum)
├── auth.service.ts                # signup() persists dto.accountKind
└── auth.service.spec.ts

apps/api/src/invitations/
├── invitations.service.ts         # accept(): new-account branch sets accountKind: 'client'
└── invitations.service.spec.ts

apps/api/src/projects/
├── projects.service.ts            # create(): reject with ForbiddenException when the
│                                    # caller's accountKind is 'client'
└── projects.service.spec.ts

packages/schemas/src/
├── auth.ts                        # UserSchema += accountKind; SignupRequestSchema += accountKind
└── (no change to project.ts — unrelated to per-project role)

apps/web/features/auth/
├── schemas.ts                     # createSignupFormSchema += accountKind (required enum)
└── components/
    ├── signup-form.tsx            # new explicit "developer"/"client" choice control
    └── signup-form.test.tsx

apps/web/features/projects/
├── components/project-list.tsx    # reads useCurrentUser(); hides "New project" header button
│                                    # and the empty-state "Create a project" CTA when
│                                    # accountKind === "client"
└── components/project-list.test.tsx
```

**Structure Decision**: Extends existing `apps/api` `auth`/`invitations` modules and `apps/web` `features/auth`/`features/projects` — no new module, no new app. One Prisma migration.

## Complexity Tracking

*No violations — table not needed.*
