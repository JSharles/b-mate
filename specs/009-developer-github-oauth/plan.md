# Implementation Plan: Developer GitHub OAuth Login

**Branch**: `feat/developer-github-oauth` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-developer-github-oauth/spec.md`

## Summary

Replace the developer-facing email/password sign-up and login forms with a single "Continue with GitHub" entry point. The API gains a standard server-side OAuth Authorization Code flow (`GET /auth/github` → GitHub → `GET /auth/github/callback`) that finds-or-creates a `User` (`accountKind: developer`) from the developer's GitHub identity and issues the exact same kind of server-side session the app already uses for password logins. Client accounts (email + password, invitation by token) are untouched — this is purely a second, developer-only entry point into the same session system.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js (NestJS 11 runtime)

**Primary Dependencies**: NestJS 11 (`apps/api`), Next.js 16 App Router (`apps/web`), Prisma 7 + `@prisma/adapter-pg`, `argon2` (existing password path, untouched), a minimal `undici`/`fetch`-based GitHub OAuth token/user exchange (no new OAuth library — the flow is two plain HTTP calls; adding a full OAuth client library for two requests would be the kind of dependency this project avoids, see AGENTS.md "Auth: hand-rolled, not Passport")

**Storage**: PostgreSQL via Prisma — one new nullable column set on the existing `users` table (no new table)

**Testing**: Jest (`apps/api`, mocked `PrismaService` + a mocked GitHub HTTP client — no real network calls in tests), Vitest + React Testing Library (`apps/web`)

**Target Platform**: Web (server-rendered Next.js + NestJS API), existing Railway hosting

**Project Type**: Web application (existing `apps/web` + `apps/api` monorepo)

**Performance Goals**: No new performance requirement — this is a low-frequency, redirect-driven flow (auth, not a hot path)

**Constraints**: The OAuth `state` parameter MUST be verified on callback (CSRF protection) before any account is created or session issued; the session cookie set by the callback MUST be the existing `httpOnly`/`sameSite=lax` cookie from `session-cookie.ts`, not a new mechanism

**Scale/Scope**: 2 new API endpoints, 1 new outbound HTTP integration (GitHub's OAuth + REST API), 1 Prisma migration, replacement of 2 web pages' primary content (`/login`, `/signup`) for developers only — client-facing routes/components are unaffected

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage Discipline** — PASS (planned). New `auth.service.ts` logic (find-or-create-by-GitHub-id, state verification) and the new controller routes need Jest tests with a mocked GitHub HTTP client; new/changed web components need RTL tests. Tracked in tasks.md, not deferred.
- **II. Type Safety, No Escape Hatches** — PASS (planned). GitHub's API responses are the one true external/untyped boundary — narrow them with a Zod schema (or a hand-written interface) exactly at the point they're received, matching how `packages/schemas` is already used elsewhere; no `any` beyond that single boundary.
- **III. Feature Isolation** — PASS. All backend changes stay inside the existing `apps/api/src/auth` module (no new module needed — this is the same domain concern, a second way to establish the same kind of session). On the web side, changes stay inside `apps/web/features/auth`; the board-connections feature (a different, unrelated GitHub integration) is not touched, per FR-007.
- **IV. Never Resolve Open Product Decisions Unilaterally** — PASS. The three points that were genuinely undecided (existing-account handling, missing-email fallback, page structure) were raised and resolved with the user during `/speckit-specify`, not guessed.
- **V. Security and Privacy by Default** — PASS (planned, see Research). OAuth `state` param for CSRF protection on the callback; no bare JWT introduced (GitHub's own access token is used once, server-side, to fetch the developer's identity, then discarded — see research.md Decision 3); sessions remain server-side and instantly revocable, unchanged.
- **VI. Spec Before Multi-Screen or Multi-Endpoint Features** — PASS. This plan follows a reviewed and user-approved spec (spans 2 pages and 2 new endpoints, correctly routed through the full workflow).

No violations — Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/009-developer-github-oauth/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory — consistent with specs/005-github-project-connection (the closest prior GitHub-integration feature in this repo), endpoint shapes are documented directly in data-model.md rather than as separate contract files, since this is two small NestJS routes, not a published API surface.

### Source Code (repository root)

```text
apps/api/src/auth/
├── auth.controller.ts          # + GET /auth/github, GET /auth/github/callback
├── auth.service.ts             # + findOrCreateFromGitHub(profile)
├── github-oauth.client.ts      # NEW — the two outbound HTTP calls (code→token, token→user/emails)
├── github-oauth.client.spec.ts # NEW
├── dto/                        # unchanged (login/signup DTOs stay for the client flow)
└── auth.controller.spec.ts     # + new route tests (mocked github-oauth.client)

apps/api/prisma/
├── schema.prisma               # User.passwordHash → nullable; + User.githubId (unique, nullable)
└── migrations/<timestamp>_add_github_oauth/

apps/web/features/auth/
├── components/login-form.tsx    # replaced with a single "Continue with GitHub" action
├── components/signup-form.tsx   # replaced with a single "Continue with GitHub" action
│                                 (both may collapse to one shared component — see research.md)
└── components/*.test.tsx        # updated accordingly

apps/web/app/[locale]/(public)/login/page.tsx   # unchanged shell, new content
apps/web/app/[locale]/(public)/signup/page.tsx  # unchanged shell, new content
```

**Structure Decision**: Everything stays inside the existing `apps/api/src/auth` module and `apps/web/features/auth` feature — this is additional capability within the current auth domain, not a new module/feature (Constitution III). One new file, `github-oauth.client.ts`, isolates the two outbound GitHub HTTP calls so `auth.service.ts` stays a thin orchestrator and the GitHub-specific HTTP/JSON shape is mockable in tests behind one seam.

## Complexity Tracking

*No violations — this section is not applicable.*
