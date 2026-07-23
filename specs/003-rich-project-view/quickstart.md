# Quickstart: Rich Project Content & Client View

Validates User Story 1 (role-based gating) and User Story 2 (placeholder cartouches) end-to-end against a running local stack (`pnpm dev`, Postgres via `docker compose up -d postgres`).

## Prerequisites

- Three test accounts, all members of the same project, with distinct membership rows:
  - Account A: `role = contributor`, `isAdmin = true` (e.g., the project's creator)
  - Account B: `role = contributor`, `isAdmin = false`
  - Account C: `role = client`, `isAdmin = false`
  - Account D (optional, for User Story 1's third scenario): `role = client`, `isAdmin = true`

## User Story 1 — Role-based gating

1. Log in as **Account A** (contributor, admin) and open the project page.
   - Expect: members list with Remove controls, Invitations card with the invite action, Settings and Documentation-as-dev-tooling placeholders all visible.
2. Log in as **Account B** (contributor, non-admin) and open the same project page.
   - Expect: members list visible (read-only — no Remove controls), Settings/Documentation-as-dev-tooling placeholders visible, Invitations card **absent**.
3. Log in as **Account C** (client, non-admin) and open the same project page.
   - Expect: members list visible (read-only), no Invite action, no Remove controls, no Settings/Documentation-as-dev-tooling placeholders.
4. Log in as **Account D** (client, admin), if seeded.
   - Expect: members list with Remove controls, Invitations card with invite action, but still no Settings/Documentation-as-dev-tooling placeholders (those stay `role = contributor`-gated).

## User Story 2 — Placeholder cartouches

1. As **Account C** (client), open the project page.
   - Expect six clearly-labeled "coming soon" cartouches: project overview, discovery/audit findings, technical decisions, roadmap, documentation, current task in progress.
   - Confirm none of them contain sample/fabricated content, and none expose a text field, upload button, or other data-entry control.

## API-level check (anti-enumeration regression guard)

- Call `GET /projects/:id/members` as a user who is **not** a member of that project at all.
  - Expect: the same `404`-shaped response as requesting a nonexistent project id — never a distinct "forbidden" that would confirm the project exists.
- Call `DELETE /projects/:id/members/:userId` as **Account B or C** (non-admin).
  - Expect: rejected — the removal action itself remains admin-only, unaffected by the read-path loosening.
