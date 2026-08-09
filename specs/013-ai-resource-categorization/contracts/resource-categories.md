# Contract: Resource Category Endpoints

All routes below hang off the existing `@Controller('projects/:projectId/resources')` (`apps/api/src/resources/resources.controller.ts`), guarded by the existing `SessionGuard` + membership checks already enforced in `ResourcesService`. No new controller/module.

## `POST /projects/:projectId/resources/:resourceId/categories/:categoryId/approve`

Approves one proposed category on one resource. Contributor-only (mirrors `publish()`'s existing role check).

- **Path params**: `projectId`, `resourceId`, `categoryId` (a `ResourceCategoryAssignment.id`, despite the URL segment name matching the pattern of the category itself — the assignment is what's being approved, scoped under the resource it belongs to).
- **Response**: `204 No Content` on success (mirrors `remove()`'s existing style), or the updated `ResourceResponse` — **decide during `/speckit-tasks`/implementation which existing convention in this controller to follow**; `publish()` currently returns the updated resource, so this contract defaults to matching that (updated `ResourceResponse`, `200 OK`) unless implementation finds a reason to diverge.
- **Errors**: `404` if the assignment doesn't belong to `resourceId`/`resourceId` doesn't belong to `projectId` (never confirms existence to a non-member — Constitution V); `409` if the assignment is not currently `proposed` (already approved or rejected — one-way transition, data-model.md).

## `POST /projects/:projectId/resources/:resourceId/categories/:categoryId/reject`

Same shape as `approve`, sets `status: rejected` instead. Rejecting never blocks the resource's own `publish()` action or its other category assignments (spec.md FR-004).

## `GET /projects/:projectId/resources` (existing endpoint, extended response)

No new route. Each `ResourceResponse` in the array gains a `categories` array (data-model.md "Extended read shape"). A client-role caller only ever sees `status: 'approved'` assignments in this array; a contributor sees all statuses — same filtering pattern `findAllForProject` already applies to `resource.status` itself for clients.

## `GET /projects/:projectId/resources/:resourceId` (existing endpoint, extended response)

Same extension as above, single-resource shape.

## Not part of this contract (explicitly)

- No endpoint to rename, merge, or delete a `ResourceCategory` directly — approve/reject on assignments is the only category-shaping action this iteration ships (spec.md Assumptions).
- No endpoint to re-propose or re-run categorization on an already-`ready_for_review`/`published` resource — categorization happens once, at the same time as vulgarization, same as today's vulgarization itself is one-shot.
