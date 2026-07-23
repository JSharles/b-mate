# Phase 0 Research: Rich Project Content & Client View

No `NEEDS CLARIFICATION` markers remained in the Technical Context — this feature reuses the existing stack entirely. Research here instead documents two concrete technical facts discovered by reading the current `apps/api` implementation, both of which change the plan versus a naive reading of the spec.

## Decision 1: The frontend has no way to learn the viewer's own role/admin status

**Finding**: `GET /projects/:id` (`ProjectsService.findOneForUser`) returns only the `Project` entity (title, etc.). It does not return anything about the signed-in user's own membership on that project. No other existing endpoint provides this either.

**Decision**: Extend `GET /projects/:id`'s response with the caller's own `role` and `isAdmin` for that project, since `findOneForUser` already queries `members: { some: { userId } }` to confirm membership — the membership row is already being touched, just not read back.

**Alternatives considered**:
- A new dedicated `GET /projects/:id/membership` endpoint — rejected as an unnecessary extra round-trip; the project detail page already calls `useProject(id)` on load, so piggybacking is the one-touch-point option.
- Deriving the viewer's role client-side from the members list — rejected because it depends on Decision 2's endpoint also being callable by non-admins, and even then means fetching a whole list just to find one row; also could not work at all before Decision 2 was resolved (the list endpoint was fully admin-gated).

## Decision 2: The members-list endpoint is already fully admin-gated, not just the removal action

**Finding**: `ProjectsService.findMembersForProject` calls `assertIsAdmin` *before* returning the list at all — confirmed by reading the service directly, not assumed. The equivalent invitations endpoint (`InvitationsService.findAllForProject`) does the same. This means, today, a non-admin project member (client or contributor) calling either endpoint gets a 403/404-shaped rejection, not an empty-but-readable list.

**Decision** (confirmed with the user before proceeding): loosen `findMembersForProject`'s gate from "must be admin" to "must be a member" — any member can read the roster; `removeProjectMember` keeps its existing, unchanged `assertIsAdmin` gate. The invitations endpoints are **not** loosened — the spec (FR-003) keeps the entire invitations cartouche admin-only, matching current behavior exactly, so no change is needed there.

**Alternatives considered**:
- Keep the members list admin-only and simply hide the whole Members cartouche from non-admins — this was the other option presented to the user; rejected in favor of "read for all, manage for admins," which better matches "a client should be able to see basic information about their own project."

## Security consistency check

The loosened read path must preserve the existing anti-enumeration pattern: a caller who isn't a member at all still gets `NotFoundException` (identical shape to "project doesn't exist"), never a distinct "forbidden" response that would confirm the project's existence to a non-member. This mirrors `findOneForUser`'s existing behavior and `assertIsAdmin`'s own `NotFoundException` branch for a missing membership row.

## Summary of concrete changes this unlocks

1. `apps/api`: a new private `assertIsMember` check (membership exists, any role/admin value) replaces `assertIsAdmin` on the read path of `findMembersForProject`; `findOneForUser`'s response gains the caller's `role`/`isAdmin`.
2. `packages/schemas`: the project-detail response schema gains `role`/`isAdmin` fields.
3. `apps/web`: the project page reads those fields to decide what to render; `ProjectMembersList` stops assuming it can always show a Remove button.
