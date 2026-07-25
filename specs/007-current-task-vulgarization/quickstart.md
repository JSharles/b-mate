# Quickstart: Vulgarize the Current Task with AI

Validates the feature end-to-end against a running local stack (`pnpm dev`, Postgres via `docker compose up -d postgres`). Requires everything `specs/006-current-task-fetch`'s own quickstart requires (a connected board with at least one item), plus a valid `ANTHROPIC_API_KEY` in `apps/api/.env`.

## Prerequisites

1. Complete `specs/005-github-project-connection`'s and `specs/006-current-task-fetch`'s quickstarts first: connect a project's board, set an item's Status to "In Progress".
2. Set `ANTHROPIC_API_KEY` in `apps/api/.env` (see `.env.example`).
3. Run `pnpm --filter api prisma:migrate` to apply the new `vulgarized_tasks` table.

## User Story 1 — Client sees a plain-language current task

1. With an in-progress item already set on GitHub, wait for one scheduled sweep to run (up to 5 minutes — research.md Decision 2), or temporarily lower the cron interval locally to observe it sooner.
2. Log in as a client-role member of the project. Open the project page. Confirm the "Current task" cartouche shows a plain-language rewrite of the item's title/description — not the original GitHub text.
3. Compare against the raw GitHub item: confirm no fact, status, or detail appears in the vulgarized version that isn't present in the original (FR-002, no fabrication).

## User Story 1 — Locale (Acceptance Scenario 4)

1. Open the project page in `/fr/...`. Confirm the current task is shown in French.
2. Open the same project page in `/en/...`. Confirm the current task is shown in English, and reflects the same underlying item.

## User Story 2 — Vulgarized content stays in sync

1. Edit the in-progress item's description on GitHub.
2. Wait for the next scheduled sweep. Reload the project page as a client. Confirm the plain-language version now reflects the new description, not the old one.
3. Confirm exactly one new vulgarization call was made per locale for this item (e.g. via a temporary log line) — not on every sweep, only the one where content changed (FR-004/005, SC-002).

## Regression checks

1. As a contributor on the same project, open the project page. Confirm their own cartouches are unaffected (specs/006 regression check, unchanged by this feature).
2. As a client on a project with no board connected, confirm the same clean "nothing in progress" state as before (FR-005/specs/006) — not an error.
3. Temporarily set an invalid `ANTHROPIC_API_KEY` and force a content change on GitHub. After the next sweep, confirm the client still sees the *previous* plain-language version (FR-007 stale-serve) — not raw GitHub text, not an empty state, not an error. Restore the key, wait for the next sweep, confirm the client now sees the updated version.
4. Confirm the frontend's network tab shows no call to GitHub or to Anthropic when a client requests the current task — only a request to the b-mate API, and nothing else. FR-003/FR-010 are the entire point of the split; this is the one check that must never regress.
