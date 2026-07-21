<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: n/a (initial ratification)
- Added sections: Core Principles (I–VI), Technical Constraints, Development Workflow, Governance
- Removed sections: none
- Templates requiring updates:
  ✅ .specify/templates/plan-template.md — generic Constitution Check gate, compatible as-is
  ✅ .specify/templates/spec-template.md — generic, compatible as-is
  ✅ .specify/templates/tasks-template.md — generic, compatible as-is
  ✅ .claude/skills/speckit-*/SKILL.md — agent-agnostic, no CLAUDE-only references found
  ⚠ AGENTS.md — already contains most of this detail operationally; not modified by this
    pass, but should eventually link here rather than duplicate. Left as follow-up.
- Follow-up TODOs: none blocking; see AGENTS.md cross-reference note above.
-->

# b-mate Constitution

## Core Principles

### I. Test-First Coverage Discipline (NON-NEGOTIABLE)
New code MUST ship with tests that keep the 80% coverage gate green (statements,
branches, functions, lines — enforced by `pnpm test:cov` locally and in CI on every
push to `main` and every PR). Tests MUST NOT be bolted on after a feature is
"done" — write them as part of the same change. Framework-only wiring that
provides no logic to test (documented exclusion lists in each app's test config)
is exempt; do not chase coverage there, extend the exclusion list instead if a
new such file appears.

### II. Type Safety, No Escape Hatches
TypeScript strict mode MUST NOT be weakened (no relaxing `tsconfig.json` compiler
options) to silence an error — fix the underlying type instead. Business logic
MUST NOT rely on unchecked `any`; if a boundary genuinely can't be typed (e.g. a
third-party payload), narrow it explicitly at that boundary, not throughout.

### III. Feature Isolation
In `apps/web`, a feature (`features/<name>/`) MUST NOT import from another
feature. Code needed by more than one feature belongs in `shared/`. In
`apps/api`, one NestJS module per domain concern; a module's service MUST NOT
reach into another module's Prisma queries directly — go through that module's
own service/public API.

### IV. Never Resolve Open Product Decisions Unilaterally
Anything listed as an "Open decision" in `docs/PRODUCT.md`, or any product/
architecture question discovered to be undecided during implementation, MUST be
raised to the user before code commits to an answer. Raise each decision when
the current implementation step actually needs it — not as an upfront batch —
but never guess silently and move on.

### V. Security and Privacy by Default
Invitation and session tokens MUST be cryptographically random. API responses
MUST NOT reveal whether an account, project, or invitation exists to someone who
isn't already a member or the token holder (identical response shape for "not
found" and "not authorized" where the distinction itself would leak
information). Passwords are Argon2id-hashed, never stored or logged in
plaintext. Sessions are server-side and instantly revocable — no bare JWTs for
authentication.

### VI. Spec Before Multi-Screen or Multi-Endpoint Features
A feature that spans more than one screen, more than one API endpoint, or
introduces a new business rule MUST go through the `/speckit.specify` →
`/speckit.plan` → `/speckit.tasks` → `/speckit.implement` workflow, with the
spec reviewed and approved by the user before implementation begins. Small,
single-endpoint or single-file changes do not require this ceremony — use
judgment, and ask if unsure whether a change qualifies.

## Technical Constraints

- **Package manager**: pnpm only (pinned via `devEngines`), invoked from the
  repo root. A second lockfile or workspace file inside `apps/*` or
  `packages/*` is a bug — delete it and reinstall from root.
- **Stack**: Next.js 16 (App Router) + Tailwind v4 + shadcn/ui for `apps/web`;
  NestJS 11 + Prisma 7 (`prisma-client-js` generator, not the ESM-only
  `prisma-client` generator) + PostgreSQL for `apps/api`. Hosting on Railway.
- **Auth**: hand-rolled server-side sessions (`Session` table, `httpOnly`
  cookie), not Passport, not JWT, not a frontend auth library. See
  `docs/PRODUCT.md` § Authentication for the rationale before proposing a
  change here.
- **Shared types**: `packages/schemas` (Zod, source-only, no build step) is the
  only shared package. Check whether a type or validation rule belongs there
  before duplicating it between `apps/web` and `apps/api`.

## Development Workflow

- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
- Only create commits or push when the user explicitly asks — a request for a
  commit message is not authorization to run `git commit`.
- One concern per branch/PR (e.g. an API module and its corresponding UI ship
  as separate PRs when both are substantial) so review stays scoped.
- Never amend a published/pushed commit or force-push without explicit
  instruction; create a new commit instead, even to fix a mistake in the
  previous one.
- Prisma migrations are applied with `prisma migrate dev` locally and
  `prisma migrate deploy` in production (as part of the Railway deploy step,
  never run by hand against prod).

## Governance

This constitution states the project's non-negotiables; `AGENTS.md` and
`docs/PRODUCT.md` carry the operational detail (commands, data model,
business-rule rationale) and remain the first place to check for how a
principle is actually implemented. Where the two conflict, this file wins for
process/principle questions and `docs/PRODUCT.md` wins for product/data-model
questions — surface the conflict to the user rather than picking silently.

Amendments happen via `/speckit-constitution`, follow semantic versioning
(MAJOR: incompatible principle removal/redefinition; MINOR: new principle or
materially expanded guidance; PATCH: wording/clarification only), and must
propagate to any dependent template or skill file flagged in that run's Sync
Impact Report. Every PR is expected to be compliant with the principles above;
a PR that knowingly deviates must say so and why in its description.

**Version**: 1.0.0 | **Ratified**: 2026-07-21 | **Last Amended**: 2026-07-21
