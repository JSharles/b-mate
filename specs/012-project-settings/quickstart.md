# Quickstart: Project Settings

Validates the feature end-to-end once implemented. Assumes `docker compose up -d postgres`, `apps/api` and `apps/web` running (`pnpm dev`), a logged-in developer account with a project, and (for Scenario 2) a real Notion integration token per specs/011's own quickstart prerequisites.

## Scenario 1 — Settings consolidates both connections (US1, P1)

1. As a contributor on a project with neither connection configured, navigate to the project and follow the Settings link.
2. Confirm the Settings page (`/projects/[id]/settings`) shows both a GitHub board connection section and a Notion connection section, each in a clear "not connected" state.
3. Confirm the main project page no longer shows a `BoardConnectionCard` or any board/Notion connection controls inline.
4. Connect the GitHub board from Settings (existing OAuth flow); confirm it lands back on Settings (not the project page) with the board now shown as connected.
5. Connect Notion from Settings (paste a valid integration token, no page URL asked here); confirm it's shown as connected.
6. Reload Settings; confirm both connections' state persisted.

**Expected**: SC-001, SC-002 hold for this run.

## Scenario 2 — Adding a Notion resource redirects to Settings when unconfigured (US2, P2)

1. On a project with no Notion connection, open "Add a resource" → the Notion tab.
2. Confirm no token field (and no page-URL field) is shown — only an explanatory message and a link to Settings.
3. Follow the link, connect Notion from Settings (as in Scenario 1 step 5), then return to "Add a resource" → Notion tab.
4. Confirm the tab now shows a page-URL field and lets a resource be added by URL alone, with no token prompt.

**Expected**: SC-003 holds for this run.

## Scenario 3 — Disconnecting Notion doesn't affect existing resources

1. With a Notion connection configured and at least one already-created Notion-sourced resource, disconnect Notion from Settings.
2. Confirm the existing Notion-sourced resource (and its content) is untouched — still visible, still readable.
3. Confirm attempting to add a *new* Notion resource now shows the "connect first" message again (Scenario 2 step 2).

**Expected**: Edge case from spec.md holds; SC-004 holds (nothing is lost/broken by disconnecting).

## Scenario 4 — Access control

1. As a client-role member (or a logged-in user who isn't a member of the project at all), attempt to reach `/projects/[id]/settings` directly.
2. Confirm the same not-found treatment as any other contributor-only surface in this app — never a distinct "forbidden" that would confirm the project exists.

**Expected**: FR-007 holds.
