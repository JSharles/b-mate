# Phase 1 Data Model: Project Invitations

Entities already exist in `apps/api/prisma/schema.prisma` (`Invitation`,
`ProjectMember`, `User`, `Project`). This document describes the entities as
the spec constrains them — new/changed behavior only, not a full re-listing
of every column.

## Invitation

Represents an offer for one email address to join one project.

| Field | Type | Notes |
|---|---|---|
| `status` | string | **Four** valid values as of this feature: `pending`, `accepted`, `cancelled`, `expired`. `cancelled` is new — see research.md §1. `expired` is a computed/derived state (see State Transitions below), not necessarily a status ever written to the row — implementation may compute it from `expiresAt` at read time rather than writing it, at the implementer's discretion; either is spec-compliant as long as FR-004/FR-005 hold externally. |
| `role`, `isAdmin` | enum, boolean | Always `client` / `false` per the spec's Assumptions (clarified 2026-07-22 — a client is never an admin by default; no role picker this iteration). |
| `token` | string | Unchanged — cryptographically random, never rotated by resend (research.md §2). |
| `expiresAt` | datetime | Reset (extended) on resend; otherwise unchanged from creation. |

### State Transitions

```
                 ┌──────────┐
     create ───▶ │ pending  │
                 └────┬─────┘
                      │
        ┌─────────────┼──────────────┬───────────────┐
        │              │              │               │
        ▼              ▼              ▼               ▼
   accept()      cancel()        time passes     resend() / re-invite
        │              │         expiresAt          (stays "pending",
        ▼              ▼              │              expiresAt reset)
   accepted       cancelled           ▼
   (terminal)     (terminal)      expired
                                  (terminal)
```

- `accepted`, `cancelled`, and `expired` are terminal — FR-009/FR-012 require
  none of them to ever be usable again.
- `resend()` and "invite an email with an existing pending invitation"
  (FR-008) are the same transition: `pending → pending`, with `expiresAt`
  extended. This is the only non-terminal-to-non-terminal transition.

### Validation Rules

- **FR-022**: Creating (or attempting to create) an invitation for an email
  that already has a `ProjectMember` row on the same project MUST be
  rejected before a row is written or an existing one is touched.
- **FR-002**: Every mutation (create, cancel, resend) requires the acting
  user to have a `ProjectMember` row on that project with `isAdmin: true`.

## ProjectMember

Unchanged shape. New behavior: can now be deleted directly by an admin
(member removal), not only created via invitation acceptance.

| Field | Type | Notes |
|---|---|---|
| `isAdmin` | boolean | Removal of a member with `isAdmin: true` MUST be refused if it would leave the project with zero remaining admins (FR-020) — see research.md §5 for the exact rule (reuses the existing "at least one admin" product constraint). |

### Validation Rules

- **FR-019/FR-020**: Deleting a `ProjectMember` row MUST first check: (a)
  the acting user is an admin of the same project (FR-002), (b) the target
  row is not the project's last admin.
- **FR-013**: Accepting an invitation for a project where a `ProjectMember`
  row already exists for that user MUST NOT create a second row — this
  behavior is unchanged from the already-built acceptance flow.

## Account (User)

Unchanged. Existence-check semantics at invitation-acceptance time
(`accountExists` in `GET /invitations/:token`'s response) are unchanged from
the already-built flow.
