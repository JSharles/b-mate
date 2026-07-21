# Phase 0 Research: Project Invitations

No items in Technical Context were marked `NEEDS CLARIFICATION` — the stack,
testing approach, and deployment target are all already fixed by the
existing codebase. This document instead records the key implementation
decisions needed to turn the spec's clarified requirements into a concrete
design, each following the same Decision / Rationale / Alternatives format.

## 1. Representing the new "cancelled" invitation state

**Decision**: Add `"cancelled"` as a new valid value of the existing
`Invitation.status` string field. No Prisma schema change or migration.

**Rationale**: `status` is already an untyped `String` column (not a Prisma
enum) — `"pending"`/`"accepted"` are already just conventions enforced in
application code, not the database. Adding a third value is the same kind of
change, at zero migration cost.

**Alternatives considered**: Formalizing `status` into a real Prisma enum
(`InvitationStatus { pending accepted cancelled expired }`) — rejected for
this iteration. It's a reasonable hardening step, but it's an unrelated
schema migration the spec doesn't require; worth a follow-up task, not part
of this feature.

## 2. Resend semantics (same link, reset expiry)

**Decision**: `resend` and "invite an email with an existing pending
invitation" both call one service method that resets `expiresAt` on the
existing `Invitation` row. `token` is never rotated.

**Rationale**: Directly implements the clarified answers (spec Q1/Q2) — the
same link must keep working, only its expiration clock resets. This also
means "invite" and "resend" converge to the same code path whenever a
pending invitation already exists for that (project, email) pair, which is
exactly what keeps FR-008 true without extra branching logic.

**Alternatives considered**: Rotating the token on resend — rejected, the
clarified answer explicitly requires the old link to keep working.

## 3. Removing a member is a hard delete

**Decision**: Removing a member deletes the `ProjectMember` row outright.

**Rationale**: No audit trail is required (clarified answer, Q3) and no
history view is required for invitations either (Q2) — a `ProjectMember`
row's existence is the membership; there's nothing else for a "removed"
state to represent that any requirement asks for.

**Alternatives considered**: A soft-delete/`revokedAt` field — rejected,
adds a state with no clarified requirement driving it.

## 4. Blocking invitations to existing members

**Decision**: Before creating or resending an invitation,
`InvitationsService` checks for an existing `ProjectMember` row for that
project and the invited email (resolved to a `User.id` when one exists) and
rejects with a 409 Conflict if found (FR-022).

**Rationale**: Direct implementation of the clarified requirement; reuses
the same membership-lookup pattern already used for admin authorization
elsewhere in this module (`assertIsAdmin`).

**Alternatives considered**: None material — this is a straightforward
implementation of an already-clarified rule.

## 5. Last-admin protection on member removal

**Decision**: Before removing a `ProjectMember` whose `isAdmin` is `true`,
count the project's other admins; refuse the removal if it would leave zero.

**Rationale**: Reuses the exact rule already documented in
`docs/PRODUCT.md` ("Integrity" § "A project must always have at least one
admin") — no new design needed, just applying an existing constraint to a
new mutation path.

**Alternatives considered**: None — this is an existing, already-settled
product rule, not a new decision.
