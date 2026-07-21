# Quickstart: Validating Project Invitations

Manual/curl validation scenarios proving the feature works end-to-end, one
per user story in `spec.md`. See `contracts/invitations-api.md` for exact
request/response shapes and `data-model.md` for state transitions — not
repeated here.

## Prerequisites

- `apps/api` running locally (`pnpm --filter api dev`), Postgres up
  (`docker compose up -d postgres`).
- Two throwaway accounts: one admin (project creator), one that will become
  the invitee.

## US1 — Admin invites someone

1. Sign up / log in as the admin, create a project, note its `id`.
2. `POST /projects/:id/invitations` with a new email.
3. Expect `201` with a `token` in the response body — this is the
   shareable link's identifier (`/invite/:token` on the web app).

## US2 — New person creates an account via the link

1. `GET /invitations/:token` (no auth) → expect `accountExists: false`.
2. `POST /invitations/:token/accept` with `{ password, firstName, lastName }`.
3. Expect `200`, a session cookie set, and the response user's email
   matching the invited one.
4. `GET /projects` with that new session → the invited project appears
   (US4).

## US3 — Returning person logs in via the link

1. Invite an email that already has an account (reuse the account from
   US2, invited to a second project).
2. `GET /invitations/:token` → expect `accountExists: true`.
3. `POST /invitations/:token/accept` with `{ password }` only (no
   name fields) — wrong password first (expect `401`, invitation still
   usable), then correct password (expect `200`).

## US5 — Invalid/expired/accepted links

1. Re-accept an already-`accepted` token → expect a rejection (see
   contracts) with no form-worthy content, distinct from:
2. A cancelled or naturally expired token → expect a rejection.
3. A random/unknown token → expect `404`.

## US6 — Admin cancels a pending invitation

1. Create an invitation, `PATCH .../invitations/:id/cancel`.
2. `GET /invitations/:token` on that same token → status is no longer
   `pending`; acceptance is refused.
3. Confirm the project's pending-invitations list no longer includes it.

## US7 — Admin resends / re-invites

1. Create an invitation, note `expiresAt` and `token`.
2. `POST .../invitations/:id/resend` → `expiresAt` moves forward, `token`
   unchanged.
3. Separately: `POST /projects/:id/invitations` again with the *same
   already-pending* email → same effect as resend, confirmed by exactly one
   invitation still appearing in the pending list for that email (FR-008).

## US8 — Admin removes a member

1. With two members on a project (admin + one accepted invitee), admin
   calls `DELETE /projects/:id/members/:userId` for the invitee.
2. Invitee's `GET /projects` no longer includes that project.
3. Attempt the same call targeting the project's only admin → expect
   `409` (last-admin protection, FR-020).

## New clarified behaviors to specifically check

- **FR-022**: Inviting an email that's already a member → `409`, no
  invitation row created (verify via the pending-invitations list count
  before/after).
- **Non-admin refusal**: Every admin-only action (invite, cancel, resend,
  remove) attempted by a non-admin member → refused, state unchanged.
