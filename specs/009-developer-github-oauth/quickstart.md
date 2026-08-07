# Quickstart: Developer GitHub OAuth Login

Validates the feature end-to-end against a running local stack (`pnpm dev`, Postgres via `docker compose up -d postgres`).

## Prerequisites

1. Register a GitHub OAuth App (github.com → Settings → Developer settings → OAuth Apps → New OAuth App):
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3001/auth/github/callback`
2. Add the new required env vars to `apps/api/.env` (and its `.env.example` counterpart, per AGENTS.md convention):
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
3. Run `pnpm --filter api prisma:migrate` to apply the `add_github_oauth` migration (nullable `password_hash`, new `github_id`).

## User Story 1 — A developer authenticates with GitHub

1. Open `http://localhost:3000/en/signup` (no existing Diaphane session). Confirm the page shows a Developer/Client toggle (`AuthGateway`) with "Developer" selected by default, and a single "Continue with GitHub" action below it — no email/name/password fields visible.
2. Click it. Confirm the browser navigates to GitHub's own authorization page (not a Diaphane modal/iframe), showing the OAuth App's name and the requested `read:user user:email` scopes.
3. Approve. Confirm you land on `http://localhost:3000/en/home`, logged in, with a new developer account (check via `prisma:studio` — a new `users` row with `account_kind = developer`, `password_hash = null`, `github_id` set, `email`/`image` populated from your GitHub profile).
4. Log out. Open `http://localhost:3000/en/login`. Confirm it shows the same toggle, "Developer" selected by default, "Continue with GitHub" below (same destination as step 1, different page heading).
5. Click it, approve again. Confirm you land back on the **same** account from step 3 (same `id` in `prisma:studio`), not a duplicate.
6. While logged in, navigate directly to `/en/login` or `/en/signup`. Confirm you're redirected straight to `/en/home` without being asked to authorize again (spec Acceptance Scenario 4).

## Edge cases

1. **Denied authorization**: start the flow, click "Cancel"/"Deny" on GitHub's consent screen. Confirm you land back on Diaphane's login/signup page with a plain-language message and no new row was created in `users`.
2. **Missing verified email**: on a test GitHub account, go to Settings → Emails and uncheck "Keep my email address private" is irrelevant — instead ensure no email on the account is verified, or use a GitHub account whose only email is unverified. Attempt sign-up. Confirm you're redirected back with the `github_email_required` message and no account is created (FR-006). Restore a verified email afterward to unblock further testing.
3. **CSRF state mismatch**: manually hit `http://localhost:3001/auth/github/callback?code=fake&state=wrong` without having started the flow (no flow cookie present). Confirm it redirects to login with an error and does **not** attempt the GitHub token exchange.
4. **Locale-aware redirect**: repeat the main flow starting from `http://localhost:3000/fr/login` instead of `/en/login`. Confirm the final redirect lands on `/fr/home`, not `/en/home` (research.md Decision 9).

## Regression checks

1. As a **client** (existing invitation-based account, e.g. `client1@client.com` from seed data), open `http://localhost:3000/en/login`, click "Client". Confirm the familiar email/password form appears in place and logging in works exactly as before (research.md Decision 10, revised).
2. On the same page, confirm "Developer" is selected by default and shows "Continue with GitHub" — no email/password fields visible until "Client" is explicitly chosen.
3. Confirm `apps/web/features/board-connections` (the separate GitHub Projects PAT flow) still works exactly as before — connecting a board still asks for a manually-pasted Personal Access Token, with no interaction with the new OAuth login (FR-007).
4. Confirm `pnpm test:cov` still passes the 80% coverage gate on both apps after the new code (auth module additions, new `GitHubAuthCard`/`AuthGateway` components).
5. Confirm no GitHub access token appears anywhere in the database (`users` table or elsewhere) after a successful login — only `github_id` (research.md Decision 4).
