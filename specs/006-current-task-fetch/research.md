# Phase 0 Research: Show the Real Current Task from a Connected Board

No `NEEDS CLARIFICATION` markers remained in the Technical Context after specification (the one open product question — how to detect "in progress" without a standardized status field — was resolved with the user during `/speckit-specify`, see spec.md FR-001/Assumptions). Research here covers the technical decisions needed to implement that choice.

## Decision 1: Querying an item's Status field by exact name via `fieldValueByName`

**Finding**: GitHub's GraphQL API exposes `ProjectV2Item.fieldValueByName(name: String!)`, which looks up a single field's current value on that item by its exact field name. For a single-select field (which "Status" is, by GitHub's default board setup), the returned union resolves to `ProjectV2ItemFieldSingleSelectValue`, exposing a `name` string — the currently selected option's display name (e.g. "In Progress").

**Decision**: Query every item's `fieldValueByName(name: "Status")` alongside its content. This is a single, exact-string field-name lookup — "Status" (capital S), matching GitHub's own default convention precisely (per the product decision in spec.md). No attempt is made to search for differently-cased or differently-spelled field names; a board that renamed it falls into the "nothing in progress" empty state (FR-005), by design.

**Alternatives considered**: Fetching all of the project's fields first, then case-insensitively searching for one named "status" (rejected — an extra round-trip and more code for a case the product decision explicitly chose not to support; `fieldValueByName`'s exact lookup is the more direct and only mechanism needed for the agreed convention).

## Decision 2: Matching the value case-insensitively, in application code

**Finding**: `fieldValueByName`'s resolved `name` is a bare string (e.g. "In Progress", "in progress", "🚧 In Progress" — whatever the developer's board actually has as an option label). GraphQL itself offers no case-insensitive or substring filtering on this value.

**Decision**: Fetch the value as-is, then in application code check `value.toLowerCase().includes('in progress')` — matching spec.md's Assumption ("case-insensitive substring matching... forgiving of minor cosmetic variation without attempting to guess beyond GitHub's own convention").

**Alternatives considered**: Exact case-sensitive match only (rejected — needlessly brittle against a purely cosmetic difference like "in progress" vs "In Progress," which carries no product-decision weight, unlike the field name itself which the user specifically anchored to GitHub's literal default).

## Decision 3: Extracting title/description/url across content types

**Finding**: A `ProjectV2Item`'s `content` is a union of `Issue`, `PullRequest`, or `DraftIssue`. All three have `title`; `Issue`/`PullRequest` have `body` (the description) and a real `url`; `DraftIssue` has `body` but no `url` of its own (it isn't a standalone GitHub object with a permalink).

**Decision**: Query all three via inline fragments (`... on Issue { title body url } ... on PullRequest { title body url } ... on DraftIssue { title body }`), and treat `url` as optional (`string | null`) in the mapped result — a draft issue simply has no link, which the UI can omit rather than fabricate.

**Alternatives considered**: Excluding draft issues from matching entirely (rejected — a developer's in-progress work is very plausibly still a draft item they haven't converted to a real issue yet; excluding them would make the feature miss real, current work for no good reason).

## Decision 4: Failure handling collapses to an empty list, never a thrown error

**Finding**: FR-005 requires every "nothing to show" case — no board connected, no Status field, no matching value, an invalid/revoked token, a GitHub outage — to present the *same* clean empty state to the client, not a distinct error.

**Decision**: `CurrentTaskService.getCurrentTask()` catches everything below the membership check (missing `BoardConnection` row, `GithubProjectsClient` throwing for any reason) and returns `[]` rather than propagating an exception. This differs deliberately from `BoardConnectionsService`, where a bad token *should* surface as a clear error to the contributor managing the connection (they need to know it failed); here, the audience is a client who has no way to fix a broken connection, so folding every failure into "nothing in progress right now" is the honest, actionable outcome for them — the contributor still finds out their connection is broken via the Board card itself (`specs/005`), not through this feature.

**Alternatives considered**: Surfacing a distinct "connection broken" state to the client (rejected by spec.md's own edge cases — the client can't act on that information, and it would imply a fault that's really the developer's board/connection to fix, not something for the client screen to editorialize about).

## Decision 5: Visibility check uses membership, not contributor-only

**Finding**: `BoardConnectionsService`'s existing `assertIsContributor` deliberately restricts *managing* a connection (and its sensitive token) to contributors. This feature's consumer is the opposite audience — client-role members — and FR-007 frames visibility as a UI/audience concern (developers keep their own unrelated cartouches), not a security wall on data the project's own developers already see directly on the real GitHub board.

**Decision**: `CurrentTaskService` uses its own `assertIsMember` (any role) rather than a contributor-only check — matching the anti-enumeration precedent (a non-member gets the same "not found" as everyone else) without artificially blocking a contributor from calling the same read-only, non-sensitive endpoint their own client would.

**Alternatives considered**: Reusing `assertIsContributor`-style gating and only exposing this to clients (rejected — no security benefit, since a contributor already holds the real GitHub credential this reads with; would only add an arbitrary, unmotivated restriction).

## Summary of concrete changes this unlocks

1. `apps/api/src/board-connections/github-projects.client.ts`: new `fetchInProgressItems(token, ownerLogin, ownerType, number): Promise<CurrentTaskItem[]>`.
2. `apps/api/src/board-connections/board-connections.module.ts`: `+ exports: [GithubProjectsClient]`.
3. `apps/api/src/current-task/` (new module): controller (`GET /projects/:projectId/current-task`), service (membership check, reads `BoardConnection`, decrypts token, calls the client, swallows failures into `[]`).
4. `packages/schemas/src/current-task.ts`: `CurrentTaskItemSchema`.
5. `apps/web/features/current-task/` (new feature): API call, hook, and the card that replaces the "Current task" placeholder for clients.
