# Quickstart: GitHub OAuth Board Connection

Validates the feature end-to-end once implemented. Assumes `docker compose up -d postgres`, `apps/api` and `apps/web` running (`pnpm dev`), and a logged-in developer account with at least one project.

## Prerequisites

- `.env` (`apps/api`) already has `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET`/`GITHUB_OAUTH_CALLBACK_URL` from `specs/009-developer-github-oauth` — no new env vars needed (Decision 1: same OAuth App).
- The registered GitHub OAuth App's scopes aren't restricted in a way that blocks `read:project` (default OAuth Apps accept any scope; nothing to configure on GitHub's side beyond the app already existing).
- A GitHub account with at least one accessible Projects v2 board (personal or org), for the happy path — and, separately, one with zero boards, for User Story 2.

## Scenario 1 — First-time board connection, no token ever touched (US1, SC-001)

1. Open a project with no board connected, start "Connect a board".
2. Confirm the dialog shows a single "Continue with GitHub" action — no token field, no link to create a PAT.
3. Click it; approve the GitHub consent screen (first time, so it's shown — lists the requested permissions, including read access to projects).
4. Confirm you land back on the same dialog, now showing a list of your accessible GitHub Projects v2 boards.
5. Pick a board, confirm the estimate-unit toggle still works as before, click Connect.
6. Confirm the project now shows the connected board (title, org/user, link to GitHub) — identical presentation to a PAT-based connection.

**Expected**: No token was created on github.com or pasted into Diaphane at any point.

## Scenario 2 — Second connection skips the consent screen (US1 AC2, SC-002)

1. On a second project (same developer, already authorized from Scenario 1), start "Connect a board".
2. Confirm you go straight to the board list — no GitHub consent screen shown this time.

**Expected**: Elapsed time from clicking "Continue with GitHub" to seeing the board list is well under 15 seconds (no external round-trip requiring user interaction).

## Scenario 3 — No accessible boards (US2)

1. Using a GitHub account/org with zero accessible Projects v2 boards, go through the authorize step.
2. Confirm a clear "no boards found" message is shown — no crash, no empty list with a disabled/broken picker.

## Scenario 4 — Authorization declined (Edge Case)

1. Start "Connect a board", reach the GitHub consent screen, click "Cancel"/deny instead of approving.
2. Confirm you land back on Diaphane with a clear "authorization wasn't completed" message and no board connection was created.

## Scenario 5 — Existing PAT-based connection keeps working (FR-007, SC-004)

1. On a project connected via the old PAT flow before this feature shipped (or a fresh manual `BoardConnection` row seeded with a valid classic PAT, for testing), confirm the current-task card and board display still work exactly as before — no forced reconnect prompt, no error.
2. Optionally, start "Connect a board" on that same project and go through the new OAuth flow — confirm it replaces the PAT-based connection with an OAuth-based one (same single-connection-per-project behavior as today).

## Scenario 6 — Revoked authorization surfaces a reconnect state (US3, FR-008)

1. Connect a board via OAuth (Scenario 1).
2. On GitHub, go to Settings → Applications → Authorized OAuth Apps, and revoke Diaphane's access.
3. Trigger a sync of that board's data in Diaphane (e.g. reload the project's current-task card).
4. Confirm a clear "reconnect your board" state is shown — not a generic error, not a silent stale display.
