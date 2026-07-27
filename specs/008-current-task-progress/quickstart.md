# Quickstart: Current Task Progress

Validates the feature end-to-end against a running local stack (`pnpm dev`, Postgres via `docker compose up -d postgres`). Requires everything specs/007's quickstart requires, plus a GitHub Projects v2 board with `Start date`, `Target date`, and/or `Estimate` fields available (GitHub's default project templates already include these).

## Prerequisites

1. Complete specs/005/006/007's quickstarts first: connect a project's board, set an item's Status to "In Progress", confirm vulgarized text already appears.
2. Run `pnpm --filter api prisma:migrate` to apply the new `task_progress` table and `BoardConnection.estimateUnit` column.

## User Story 1 — Client sees when work actually started

1. On a board item with a "Start date" field left empty, mark it "In Progress". Wait for a sweep (or temporarily lower the cron interval locally).
2. As a client, open the project page. Confirm the Current Task card shows a start date matching roughly when you marked it in progress (the b-mate-detected fallback, spec.md FR-002).
3. On GitHub, fill in that item's "Start date" field with a different (earlier) date. Wait for the next sweep, reload as the client. Confirm the card now shows the board's date instead (spec.md User Story 1, Acceptance Scenario 3 — board data wins once available).
4. Edit the item's title on GitHub (a genuine content change). Wait for the next sweep, reload. Confirm the start date shown is unchanged (FR-006 — start date survives content edits).

## User Story 2 — Client sees an estimate and a progress indicator

1. On a board item with a "Target date" field filled in, mark it "In Progress". Wait for a sweep.
2. As a client, confirm the card shows a plain-language estimated completion date matching that "Target date", and a progress bar reflecting elapsed time since the start date against that target.
3. Remove the "Target date" but fill in a numeric "Estimate" (e.g. `4`). Wait for the next sweep. Confirm the estimated completion date is now roughly start date + 4 days (or the connection's configured unit).
4. Remove both "Target date" and "Estimate" entirely. Wait for the next sweep. Confirm the card still shows *an* estimate (the AI-supplied fallback) — never blank, never a broken/zero progress bar.
5. Edit the item so its estimated completion date (from any source) is now in the past relative to today. Confirm the card shows a distinct "running longer than estimated" state, not a bar silently capped at 100%.
6. Remove the AI-supplied estimate's possibility entirely (not achievable via the UI — instead, verify by code inspection or a temporary invalid `ANTHROPIC_API_KEY`) and confirm: with no board data and a failed AI call, the card shows the start date with no progress bar and no estimated-completion date (FR-008), rather than a broken indicator.

## User Story 4 — Client sees a confidence level

1. Reproduce each of the four combinations and confirm the confidence shown matches spec.md FR-003a's matrix:
   - Board `Target date`/`Estimate` present + a simple task (e.g. "Fix typo in footer copyright year") → high confidence.
   - Board `Target date`/`Estimate` present + a complex task (e.g. the N+1 query example used earlier this session) → medium confidence.
   - No board date/estimate + a simple task → medium confidence.
   - No board date/estimate + a complex task → low confidence.
2. Confirm the confidence level is never shown when there's no estimate to attach it to (estimate and confidence are both present or both absent).

## Regression checks

1. As a contributor, open the project page. Confirm nothing on their view is affected (this feature only touches the client-facing Current Task card).
2. Confirm the frontend's network tab still shows no call to GitHub or Anthropic when a client requests the current task (specs/007's core guarantee — must not regress).
3. Confirm `pnpm test:cov` still passes the 80% coverage gate on both apps after the new code (task-vulgarization additions, board-connections `estimateUnit`, the progress bar component).
4. Reconnect a board without specifying `estimateUnit` explicitly. Confirm it defaults to "days" (spec.md FR-005b default).
