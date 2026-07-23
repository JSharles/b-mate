# Quickstart: GitHub Projects Board Connection

Validates all three user stories end-to-end against a running local stack (`pnpm dev`, Postgres via `docker compose up -d postgres`). Requires a real GitHub account with at least one Projects (v2) board and a classic PAT with the `project` scope (fine-grained PATs cannot access a personal account's Projects boards at all — see spec.md FR-010).

## Prerequisites

1. On GitHub, create a classic Personal Access Token (Settings → Developer settings → Tokens (classic)) with the `project` scope checked. Note its value — you'll paste it into b-mate, not store it anywhere else.
2. Have at least one GitHub Projects (v2) board that token can see, and its owner (your username or an org) and project number (visible in its URL, e.g. `github.com/users/you/projects/3` → number `3`).

## User Story 1 — Connect a project to a board

1. Log in as a developer-kind account that is a contributor on a project with no board connected.
2. Open that project's Settings area. Confirm it shows a "connect a board" invitation, not the old "coming soon" placeholder.
3. Start the connect flow, paste the PAT from Prerequisites, and confirm the list of available boards includes the one you expect.
4. Pick that board and confirm. Confirm Settings now shows the board's name and a working link to it on GitHub.
5. Reload the page. Confirm the connection persists (it wasn't only client-side state).

## User Story 2 — See which board is connected

1. As any contributor on the connected project (not just the one who connected it), open Settings. Confirm the same board name/link is visible.
2. As a client-role member of that same project, open the project page. Confirm no board-connection information or control is visible anywhere (FR-009) — not even that a connection exists.
3. On a *different* project with no connection, open Settings. Confirm the "connect a board" invitation is shown, not an error.

## User Story 3 — Disconnect or switch boards

1. On the connected project, disconnect the board. Confirm Settings reverts to "no board connected".
2. Query the database directly (`psql`) and confirm no row remains in `board_connections` for that project.
3. Connect a *different* board on the same project without disconnecting first (if you have a second board available). Confirm the new board replaces the old one — Settings shows only the new board, and the database has exactly one row for that project, matching the new board's identity.

## Security checks

1. Attempt to connect a GitHub Projects board your PAT does *not* have access to (e.g. mistype the project number or use another org's number). Confirm it's rejected and nothing is stored.
2. Inspect the `board_connections` table directly via `psql` — confirm the `encrypted_token` column is not the plaintext PAT.
3. Inspect API responses (`GET /projects/:id/board-connection`) — confirm the token is never present in the response body, in any form.
4. As a non-member of the project, call the endpoints directly (e.g. via curl with a different account's session cookie) — confirm every one returns the same "not found" shape as a genuinely non-existent project, not a distinct "forbidden".

## Regression check

- Log in as a developer-kind account on a project that predates this feature (no board connection exists in the database at all). Confirm Settings shows the "connect a board" invitation cleanly, with no error, and every other project-page cartouche is unaffected.
