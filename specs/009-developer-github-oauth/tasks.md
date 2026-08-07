---
description: "Task list for Developer GitHub OAuth Login"
---

# Tasks: Developer GitHub OAuth Login

**Input**: Design documents from `/specs/009-developer-github-oauth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (all present, no `contracts/` — see plan.md)

**Tests**: Included — Constitution Principle I (Test-First Coverage Discipline) is non-negotiable for this repo; new logic ships with tests in the same change.

**Organization**: Spec.md has a single user story (US1). Work that's required for the feature to ship safely but isn't part of US1's own independent test (the new `/client-login` page, required by FR-005/research.md Decision 10) sits in Foundational, since it has no dependency on the OAuth mechanism itself and can proceed in parallel with it.

**Implementation note (2026-08-07):** `GitHubAuthCard` shipped without the `mode` prop T014–T016 describe — the page heading was already externalized to each page's own `<h1>{t("title")}</h1>` (unchanged), so the button/link content never needed to vary by login vs. signup after all. Same outcome (one shared component, no behavioral difference), simpler than planned.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to US1 where applicable

---

## Phase 1: Setup

- [X] T001 Add `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` to `apps/api/.env.example` with a comment pointing at quickstart.md's OAuth App registration steps (no real values committed).

**Checkpoint**: Env var contract documented.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema change and the reusable client-login path that FR-005 requires — both have no dependency on the OAuth mechanism itself.

**⚠️ CRITICAL**: T010+ (US1 implementation) depends on T002/T003 for the schema change; the rest of Phase 2 can run alongside US1.

- [X] T002 Update `apps/api/prisma/schema.prisma`: make `User.passwordHash` nullable (`String?`), add `User.githubId String? @unique @map("github_id")` (data-model.md).
- [X] T003 Generate and apply the migration: `pnpm --filter api prisma:migrate` (name: `add_github_oauth`); depends on T002.
- [X] T004 [P] Create `apps/api/src/auth/oauth-state-cookie.ts`: name/options/TTL (~10 min, `httpOnly`, `sameSite=lax`) for the short-lived `state`+`locale` OAuth flow cookie, sibling to `session-cookie.ts` (research.md Decisions 3, 9). No behavior yet, just the cookie contract other tasks build on.
- [X] T005 [P] Create `apps/web/app/[locale]/(public)/client-login/page.tsx`, mounting the existing, **unmodified** `LoginForm` component exactly as `apps/web/app/[locale]/(public)/login/page.tsx` does today (research.md Decision 10) — copy the page shell (logo, `Card` wrapper), point it at `LoginForm`. No new component, no new schema, no new hook.
- [X] T006 [P] Add a `client-login.test.tsx` (or extend the moved page's existing test coverage) confirming the new page renders `LoginForm` and reaches `/home` on success, mirroring the current `/login` page test before it's repurposed in T014.

**Checkpoint**: Schema ready for US1; clients have a working, independent login path regardless of US1's progress.

---

## Phase 3: User Story 1 - A developer authenticates with GitHub (Priority: P1) 🎯 MVP

**Goal**: A single "Continue with GitHub" entry point creates-or-logs-into a developer account via GitHub OAuth, replacing the developer-facing email/password forms on `/login` and `/signup`.

**Independent Test**: A developer with no existing Diaphane account completes the GitHub authorization flow and arrives at their dashboard with a usable account; repeating the same action later returns them to that same account (quickstart.md steps 1–6).

### Tests for User Story 1 ⚠️ write first, confirm they fail before implementing

- [X] T007 [P] [US1] `apps/api/src/auth/github-oauth.client.spec.ts`: mocked HTTP — code→token exchange, `/user` fetch, `/user/emails` fetch, and the "no verified primary email" case (research.md Decisions 4, 5).
- [X] T008 [P] [US1] Extend `apps/api/src/auth/auth.service.spec.ts` with `findOrCreateFromGitHub` cases: brand-new `githubId` → account created (`accountKind: developer`, `passwordHash: null`); existing `githubId` → logs into that same account, no duplicate; a verified GitHub email that collides with another row's unique `email` → a clean, typed conflict error, not a raw Prisma exception (research.md Decision 6).
- [X] T009 [P] [US1] Extend `apps/api/src/auth/auth.controller.spec.ts`: `GET /auth/github` sets the state+locale cookie and redirects to GitHub's authorize URL with `scope=read:user user:email` and the generated `state`; `GET /auth/github/callback` — state mismatch → redirect to login with `?error=state_mismatch`, no account/session created; no verified email → redirect with `?error=github_email_required`, no account/session created; success → `session_token` cookie set, redirect to `/<locale>/home` using the locale carried in the flow cookie.
- [X] T010 [P] [US1] `apps/web/features/auth/components/github-auth-card.test.tsx`: renders one link whose `href` points at `${NEXT_PUBLIC_API_URL}/auth/github?locale=<current-locale>` for both `mode="login"` and `mode="signup"` (differing only in heading copy); renders the `github_email_required` / `state_mismatch` plain-language messages when present as a URL query param.

### Implementation for User Story 1

- [X] T011 [US1] Implement `GithubOauthClient` in `apps/api/src/auth/github-oauth.client.ts` per data-model.md's narrowed external-response shapes (makes T007 pass).
- [X] T012 [US1] Implement `findOrCreateFromGitHub` in `apps/api/src/auth/auth.service.ts` (makes T008 pass; depends on T002/T003 for the schema, T011 for the profile shape it receives).
- [X] T013 [US1] Implement `GET /auth/github` and `GET /auth/github/callback` in `apps/api/src/auth/auth.controller.ts` (makes T009 pass; depends on T004 cookie helper, T011, T012).
- [X] T014 [P] [US1] Implement `GitHubAuthCard` in `apps/web/features/auth/components/github-auth-card.tsx` (makes T010 pass) — a styled link (not a form/mutation, per research.md Decision 8), `mode: "login" | "signup"` prop for heading copy only.
- [X] T015 [US1] Update `apps/web/app/[locale]/(public)/login/page.tsx` to render `<GitHubAuthCard mode="login" />` instead of `<LoginForm />` (depends on T014).
- [X] T016 [US1] Update `apps/web/app/[locale]/(public)/signup/page.tsx` to render `<GitHubAuthCard mode="signup" />` instead of `<SignupForm />` (depends on T014).

**Checkpoint**: US1 fully functional — `/login` and `/signup` are GitHub-only by default for developers; `/client-login` (Phase 2) independently covers clients. (Superseded by Phase 5 below — `/client-login` was later folded into `/login`/`/signup` themselves.)

---

## Phase 4: Cleanup & Cross-Cutting

- [X] T017 Delete `apps/web/features/auth/components/signup-form.tsx` and `signup-form.test.tsx`, and the `useSignup` hook in `apps/web/features/auth/hooks.ts` (confirmed unused elsewhere — only `signup-form.tsx` called it); trim `apps/web/features/auth/schemas.ts` of the now-unused signup/account-kind schema pieces. Keep `login-form.tsx`, `useLogin`, and the login schema — still used by `/client-login` (Phase 2). Depends on T015, T016, T005.
- [X] T018 Remove the now-unreferenced `POST /auth/signup` route from `apps/api/src/auth/auth.controller.ts` and its `SignupDto` — first verify `apps/api/src/features/invitations` (or equivalent invitations module) does not internally call `AuthService.signup()` for first-time invitation acceptance; if it does, keep the service method and only remove the now-dead HTTP route, updating `auth.controller.spec.ts` accordingly either way. Depends on T017 (frontend no longer calls it).
- [X] T019 [P] Update `apps/web/messages/en.json` and `fr.json`: add `GitHubAuthCard` copy (button label, both error messages) under `Auth`; remove now-unused `Auth.SignupForm`/account-kind-toggle keys (verify nothing else references them first).
- [X] T020 [P] Update `docs/PRODUCT.md` § Authentication: replace "Both developer and client sign up and log in with email + password" with an accurate split (developers: GitHub OAuth only; clients: email + password, unchanged); remove or update the "OAuth (Google/GitHub)... a possible later addition, not MVP" note now that GitHub OAuth is implemented (for developers only — Google remains a real future option, not this feature).
- [X] T021 Run `pnpm lint`, `pnpm typecheck`, `pnpm test:cov` from the repo root; fix any fallout across both apps.
- [X] T022 Walk through quickstart.md end-to-end against a real (dev) GitHub OAuth App — both the main flow and all four edge cases (denied auth, missing verified email, state mismatch, locale-aware redirect) — plus all regression checks. *(Everything except the live GitHub redirect itself was verified — no real OAuth App was registered in this session; see completion report.)*

---

## Phase 5: Post-implementation correction — `AuthGateway`

**Why**: asking "how do clients log in now?" after Phase 4 shipped surfaced that `/client-login` (Phase 2, T005/T006) was unlinked from any nav — a returning client had no discoverable way back in. See spec.md Clarifications (2026-08-07, post-implementation) and research.md Decision 10 (revised).

- [X] T023 [P] Write `apps/web/features/auth/components/auth-gateway.test.tsx` first: defaults to showing the (mocked) `GitHubAuthCard`; clicking "client" swaps to the (mocked) `LoginForm`; clicking "developer" swaps back. Confirmed failing (module didn't exist) before implementing.
- [X] T024 Implement `AuthGateway` in `apps/web/features/auth/components/auth-gateway.tsx` — a two-button Developer/Client toggle (same visual pattern as the old `SignupForm` account-kind toggle) wrapping the unchanged `GitHubAuthCard`/`LoginForm`. Makes T023 pass.
- [X] T025 Wire `AuthGateway` into `apps/web/app/[locale]/(public)/login/page.tsx` and `signup/page.tsx` in place of the bare `GitHubAuthCard`; delete the `/client-login` route and its page test; update `login/page.test.tsx` and `signup/page.test.tsx` to mock `AuthGateway` instead.
- [X] T026 [P] Add `Auth.AuthGateway` translation keys (`developer`, `client`) to `en.json`/`fr.json`.
- [X] T027 [P] Update spec.md, research.md, data-model.md, quickstart.md, and `docs/PRODUCT.md` to reflect the corrected design; mark the superseded `/client-login` decision as revised, not silently rewritten.
- [X] T028 Re-run `pnpm lint`, `pnpm typecheck`, `pnpm test:cov` (both apps) and live-verify both pages in-browser: default Developer view, toggle to Client, form appears in place, toggle back.

---

## Phase 6: UX polish — no default selection, no layout jump

**Why**: direct feedback on Phase 5's result — defaulting to "Developer" selected put GitHub content in front of clients before they'd done anything (friction Phase 5 was supposed to remove), and switching panels visibly jumped the card's height (`GitHubAuthCard` vs. `LoginForm` are very different sizes). See research.md Decision 11.

- [X] T029 [P] Rewrite `auth-gateway.test.tsx` first: neither toggle button `aria-pressed` on initial render, both panels `inert`; choosing either sets that panel's `inert` off and `aria-pressed` on; switching leaves the previous panel `inert` again. Confirmed failing against the old implementation before changing it.
- [X] T030 Rewrite `AuthGateway`: `kind` state starts `null`; both panels always mounted, stacked via `col-start-1 row-start-1` so the grid cell sizes to the taller one; outer `grid-template-rows: 0fr → 1fr` animates the one real reveal; inactive panel gets `inert`. Makes T029 pass.
- [X] T031 [P] Add the `Auth.AuthGateway.prompt` translation key ("I am a...") to `en.json`/`fr.json`.
- [X] T032 Re-run `pnpm lint`, `pnpm typecheck`, `pnpm test:cov` (web) and live-verify: neither button selected on load, choosing "Client" reveals the form with an animated height change, switching to "Developer" and back cross-fades without resizing the card.

---

## Dependencies & Execution Order

- **Setup (T001)**: no dependencies.
- **Foundational (T002–T006)**: T003 depends on T002; T004, T005, T006 are independent of each other and of T002/T003 — all four of T002–T006 can proceed in parallel across two people/threads (schema+migration vs. client-login page).
- **US1 tests (T007–T010)**: no dependencies on each other — write and confirm-failing in parallel. T009 additionally needs T004 to exist (the cookie contract its tests assert against), though the assertions themselves can be drafted first.
- **US1 implementation (T011–T016)**: T011 → T012 → T013 (strict chain, each builds on the last); T014 is independent and parallel to T011–T013; T015 and T016 both depend on T014 (and can run in parallel with each other once it lands).
- **Cleanup (T017–T022)**: T017 depends on T015, T016, T005; T018 depends on T017; T019/T020 are independent of code and of each other; T021 and T022 come last, after everything else.

## Parallel Example: Foundational + early US1 tests

```
# Two independent tracks can start immediately after Setup:
Task: "Update apps/api/prisma/schema.prisma — nullable passwordHash, new githubId" (T002)
Task: "Create apps/web/app/[locale]/(public)/client-login/page.tsx" (T005)

# Once T002 lands, in parallel:
Task: "Generate + apply migration" (T003)
Task: "Create apps/api/src/auth/oauth-state-cookie.ts" (T004)
Task: "Write github-oauth.client.spec.ts" (T007)
Task: "Write github-auth-card.test.tsx" (T010)
```

## Implementation Strategy

**MVP = all of the above** — this feature has one user story, and FR-005 makes the `/client-login` Foundational work non-optional, not a nice-to-have to defer. There is no meaningful "ship half of this" increment: a developer needs the full GitHub flow working end-to-end (T002–T016) before any of it is usable, and clients need T005 landed before `/login` is repurposed (T015) or they lose access mid-rollout. Land Setup → Foundational → US1 → Cleanup in that order in one pass; do not deploy T015/T016 (repurposing `/login`/`/signup`) ahead of T005 (`/client-login` existing) reaching the same environment.

## Notes

- Commit after each task or logical group, per repo convention (Conventional Commits, only when the user explicitly asks for a commit).
- Verify each spec'd test (T007–T010) actually fails before writing its corresponding implementation (T011, T012, T013, T014) — the constitution's Test-First principle is non-negotiable here, not aspirational.
- T018's verification step (does `InvitationsService` call `AuthService.signup()`?) is the one task in this list whose scope may change based on what implementation finds — resolve it in code, not by guessing here.
