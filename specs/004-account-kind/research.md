# Phase 0 Research: Explicit Account Kind (Developer vs Client)

No `NEEDS CLARIFICATION` markers remained in the Technical Context. Research here documents the decisions worked out with the user during specification, plus one technical limitation discovered while planning the migration.

## Decision 1: `accountKind` gates project creation at the API level too, not just the UI

**Discussion**: An earlier pass reasoned toward presentation-only gating (hide the button, but leave `/projects` POST open) to sidestep the mutability question entirely. The user correctly rejected this once the underlying axiom was confirmed: developer and client are non-overlapping audiences with no legitimate case for a client-kind account to create a project. Leaving the API open "just in case" defends against a case that, by the product's own design, never happens — it's an unjustified gap, not a safety margin.

**Decision**: `POST /projects` rejects the request when the caller's `accountKind` is `client`. The UI hiding the button (Home) is a courtesy on top of a real, enforced rule, not a substitute for one.

**Alternatives considered**: Presentation-only gating (rejected, see above). API-level gating was initially avoided specifically to dodge the mutability question, but that concern turned out to have a low ceiling regardless (Decision recorded in `specs/004-account-kind/spec.md` — the axiom that developer/client never overlap means almost nobody would ever need to change kind, so gating a real capability by it is not the risk it first appeared to be).

## Decision 1b: A developer-kind account can never hold client-role membership, even via invitation

**Discussion**: The original spec (§ Relationship to the Project-Level Role Model, FR-006) treated account kind and project role as fully orthogonal — a developer account could still be invited and accept a `client`-role membership on someone else's project. After Decision 1 (API-level gating for project creation), the user asked directly what happens if someone tries to create the "other" account kind while already holding one — surfacing this exact case: a developer account being invited as a client. The user confirmed this should also be blocked, for the same underlying reason as Decision 1: developer and client are non-overlapping audiences, so there is no legitimate case for a developer-kind account to end up with client-role membership anywhere.

**Decision**: Reject at both invitation-related gates: `InvitationsService.create()` rejects (403) when the invited email already belongs to a developer-kind account (fails fast for the inviting admin, avoids a dangling invitation that could never be accepted); `InvitationsService.accept()` independently rejects (403) when the resolved account is developer-kind (defense in depth — covers the case where the email had no account, or a different-kind account, at invite-creation time but is developer-kind by the time accept() runs). This supersedes the "vice versa" clause in the original spec's Relationship section and FR-006, now revised as FR-009.

**Alternatives considered**: Leaving this un-gated as originally specified (rejected — same reasoning as Decision 1, an unjustified gap once developer/client are established as non-overlapping). Gating only at `accept()` and not at `create()` (rejected — would leave an admin able to create an invitation that can never succeed, with no early feedback).

## Decision 2: Historical migration can only see current data, not deleted memberships

**Finding**: `ProjectMember` rows are hard-deleted (`removeMember` calls `prisma.projectMember.delete`) — there is no soft-delete or audit trail. The spec's backfill rule ("developer if the account has ever held a contributor membership") can only be evaluated against **currently existing** `ProjectMember` rows at migration time; a contributor membership that was created and later removed before this migration runs is invisible to it.

**Decision**: Accept this as an inherent, honest limitation, not a defect introduced by this feature — proceed with backfilling from current `ProjectMember` rows only. In practice this is very unlikely to misclassify anyone: removing a contributor from every one of their projects while leaving their account intact is a rare edge case. If it does happen, the affected account would need a manual correction (kind isn't self-service-changeable yet, per spec FR-008) — worth flagging as a known, low-probability gap rather than pretending it can't occur.

**Alternatives considered**: Adding an audit/history table to reconstruct true historical role — rejected as disproportionate infrastructure for a one-time backfill of a single account attribute.

## Decision 3: Migration backfill order

**Finding**: Postgres/Prisma migrations can add a `NOT NULL` column with no default to a table that already has rows only if every existing row is given a value in the same migration, before the constraint is applied.

**Decision**: Write the migration in three steps inside one migration file: (1) add `account_kind` as nullable, (2) `UPDATE` every existing row using a `CASE` derived from `project_members` (contributor membership present → `developer`; else any membership present → `client`; else → `developer`), (3) alter the column to `NOT NULL`. This keeps the backfill deploy-time and repeatable (matches `prisma migrate deploy`, no manual one-off script per AGENTS.md's migration workflow).

## Summary of concrete changes this unlocks

1. `apps/api/prisma/schema.prisma`: new `AccountKind` enum, new required `User.accountKind` column.
2. One migration: additive column + SQL backfill + `NOT NULL`, in that order.
3. `apps/api/src/auth`: signup DTO/service persist an explicit `accountKind` from the request.
4. `apps/api/src/invitations`: `accept()`'s new-account branch sets `accountKind: 'client'`.
5. `packages/schemas`: `UserSchema`/`SignupRequestSchema` gain `accountKind`.
6. `apps/web/features/auth`: signup form gains a required developer/client choice.
7. `apps/web/features/projects/components/project-list.tsx`: hides "Create a project" (both the header button and the empty-state CTA) for `client`-kind accounts.
