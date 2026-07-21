# API Contracts: Project Invitations

All endpoints are on `apps/api`. Admin-guarded endpoints require the
`SessionGuard` (session cookie) and the acting user to be an admin
(`ProjectMember.isAdmin: true`) of the target project — a 404 is returned
when the user isn't a member at all (never confirming the project's
existence to a non-member), and 403 when they're a member but not an admin.

## Already built (unchanged by this feature)

| Method | Path | Guard | Notes |
|---|---|---|---|
| `POST` | `/projects/:projectId/invitations` | admin | Extended by this feature — see below |
| `GET` | `/projects/:projectId/invitations` | admin | Pending-only (spec Q2) — already correct as built |
| `GET` | `/invitations/:token` | public | Returns `{ email, projectTitle, accountExists, status }` |
| `POST` | `/invitations/:token/accept` | public | Body: `{ password, firstName?, lastName? }` |

## Extended by this feature

### `POST /projects/:projectId/invitations`

Body: `{ email: string }`

- **201**: New invitation created (or existing pending one refreshed — see
  below), returns the `Invitation`.
- **409**: The email already belongs to the project as a member (FR-022).
  Response body carries a message identifying this case distinctly from a
  generic validation error, so the frontend can show "already a member"
  rather than a generic failure.
- Behavior change: if a pending invitation already exists for this
  `(projectId, email)`, this call MUST behave identically to
  `POST .../resend` on that invitation (FR-008) — same response shape,
  `expiresAt` extended, same `token`.

### `POST /invitations/:token/accept`

Body: `{ password, firstName?, lastName? }` (unchanged)

- **409**: Invitation is not currently `pending` (expired, cancelled, or
  already accepted) — refused, no session created (FR-012/FR-013/FR-014,
  SC-004). Applies uniformly regardless of which non-pending state caused
  it; the invitee-facing message stays generic per spec Assumptions.

### `POST /projects/:projectId/invitations/:invitationId/resend`

No body.

- **200**: Invitation's `expiresAt` extended by the same duration as a fresh
  invitation (see data-model.md — 7 days, per spec Assumptions); `token`
  unchanged. Returns the updated `Invitation`.
- **404**: Invitation doesn't belong to this project, or the project isn't
  found/the user isn't a member (same non-disclosure pattern as elsewhere).
- **409**: Invitation is not currently `pending` (already accepted or
  cancelled) — cannot resend a terminal invitation.

### `PATCH /projects/:projectId/invitations/:invitationId/cancel`

No body.

- **200**: Invitation's `status` set to `cancelled`. Returns the updated
  `Invitation`.
- **404**: Same non-disclosure pattern.
- **409**: Invitation is not currently `pending`.

## New: member removal (lives on the `projects` resource)

### `DELETE /projects/:projectId/members/:userId`

- **204**: Membership removed.
- **404**: Project not found for this user, or the target `userId` is not a
  member of the project.
- **409**: Removing this member would leave the project with zero admins
  (FR-020) — the target is the project's only admin.

## Non-goals for this contract set

- No endpoint sends an actual email — link delivery stays manual (copy from
  the invitation list), per spec Assumptions.
- No endpoint exposes invitation history (cancelled/expired/accepted) — the
  list endpoint stays pending-only (spec Q2).
