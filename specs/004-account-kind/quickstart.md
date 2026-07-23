# Quickstart: Explicit Account Kind (Developer vs Client)

Validates all four user stories end-to-end against a running local stack (`pnpm dev`, Postgres via `docker compose up -d postgres`).

## User Story 1 — Explicit choice at direct signup

1. Go to `/signup`. Fill in the form and confirm you must choose "developer" or "client" before submitting — submitting without a choice should fail with a clear message.
2. Sign up choosing "developer". Confirm login succeeds and (once User Story 3 is implemented) "Create a project" is visible on Home.
3. Repeat, choosing "client", with a different email. Confirm "Create a project" is absent on Home.

## User Story 2 — Automatic client kind via invitation

1. As a developer-kind account, invite a new email to one of your projects and copy the invite link.
2. Open the invite link in a fresh session and complete account creation. Confirm no developer/client choice is presented anywhere in this flow.
3. Confirm the resulting account cannot see "Create a project" on Home (i.e., its kind was set to `client` automatically).
4. As a developer-kind account, attempt to invite the email of an *existing* developer-kind account to one of your projects. Confirm the invitation is rejected (403) and no invitation row is created.
5. If a developer-kind account's email somehow holds a pending invitation (e.g. created before this feature, or crafted directly against the API), confirm accepting it is rejected (403) — no membership is granted and the invitation is not marked accepted.

## User Story 3 — Home reflects account kind

1. Log in as a developer-kind account. Confirm the "New project" header button and (if you have no projects) the empty-state "Create a project" CTA are both visible.
2. Log in as a client-kind account. Confirm neither is present anywhere on Home.
3. As the client-kind account, call `POST /projects` directly (e.g. via curl, with a valid session cookie). Confirm it is rejected, not just hidden in the UI.

## User Story 4 — Clean migration of existing accounts

1. Before running the migration, note a few existing accounts and their current project memberships (e.g., via `psql`: `SELECT u.email, pm.role FROM users u LEFT JOIN project_members pm ON pm.user_id = u.id;`).
2. Run the migration (`pnpm --filter api prisma:migrate` in dev, `prisma migrate deploy` in the real deploy path).
3. Re-query: `SELECT email, account_kind FROM users;` — confirm every row has a non-null `account_kind`, and that it matches the expected rule (any `contributor` membership → `developer`; only `client` memberships → `client`; no memberships → `developer`).

## Regression check

- Log in as an existing contributor account (predates this feature). Confirm nothing about their Home or project pages changed except the account now having a `developer` kind under the hood.
