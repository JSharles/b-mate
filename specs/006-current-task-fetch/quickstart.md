# Quickstart: Show the Real Current Task from a Connected Board

Validates the user story end-to-end against a running local stack (`pnpm dev`, Postgres via `docker compose up -d postgres`). Requires everything `specs/005-github-project-connection`'s own quickstart requires (a classic PAT with the `project` scope, a real GitHub Projects v2 board), plus at least one item on that board.

## Prerequisites

1. Complete `specs/005-github-project-connection`'s quickstart first: connect a project to a real board.
2. On that board, using GitHub's default "Status" field (don't rename it), set at least one item's Status to "In Progress" (the default value GitHub creates new boards with).

## User Story 1 — Client sees the real current task

1. Log in as a client-role member of the project whose board is connected and has an "In Progress" item.
2. Open the project page. Confirm the "Current task" cartouche shows that item's real title (and description, if it has one) — not the old static placeholder.
3. On GitHub, move that item's Status to something else (e.g. "Done"), and move a *different* item to "In Progress." Reload the project page as the client. Confirm the cartouche now reflects the new item — proving this is a live, on-demand fetch, not a one-time snapshot.
4. Set two items to "In Progress" simultaneously on GitHub. Reload. Confirm both are shown, not just one.
5. Move every item off "In Progress" (or leave the board with none in progress). Reload. Confirm a clean "nothing in progress" state, not an error and not the old placeholder.

## Regression checks

1. As a contributor on the same project, open the project page. Confirm their own cartouches (Board, Documentation, Settings) are exactly as before — unaffected by this feature.
2. As a client on a *different* project with no board connected at all, open the project page. Confirm "Current task" shows the same clean "nothing in progress" state (not the old placeholder, not an error).
3. Temporarily break the board connection (e.g. revoke the PAT on GitHub, per `specs/005`'s own edge case), then reload the project page as a client. Confirm the same clean "nothing in progress" state — no distinct error message.
