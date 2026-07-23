# Phase 1 Data Model: Show the Real Current Task from a Connected Board

## No schema change

This feature persists nothing new (spec.md Key Entities). It reads the existing `BoardConnection` row (`specs/005-github-project-connection`) — its `encryptedToken`, `boardOwnerLogin`, `boardOwnerType`, `boardNumber` — and calls GitHub live on every request. No migration.

## API contract

No `/contracts` directory — matching this repo's established convention (`specs/003`, `specs/004`, `specs/005`), documented inline and backed by a Zod schema in `packages/schemas`.

### `packages/schemas/src/current-task.ts` (new)

```ts
export const CurrentTaskItemSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  url: z.string().url().nullable(),
});
```

### Endpoint (`apps/api/src/current-task`)

| Method | Path | Response | Notes |
|---|---|---|---|
| `GET` | `/projects/:projectId/current-task` | `CurrentTaskItemSchema[]` | Requires the caller to be a project member (any role, research.md Decision 5) — a non-member gets the same `NotFoundException` as a non-existent project. An empty array covers every "nothing to show" case (no board, no Status field, no match, broken connection, GitHub outage) — never a distinct error shape (FR-005, research.md Decision 4). |

## GitHub GraphQL shape consumed (via `GithubProjectsClient.fetchInProgressItems`)

```graphql
query {
  <user|organization>(login: $login) {
    projectV2(number: $number) {
      items(first: 100) {
        nodes {
          content {
            __typename
            ... on Issue { title body url }
            ... on PullRequest { title body url }
            ... on DraftIssue { title body }
          }
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
        }
      }
    }
  }
}
```

- Root field (`user` vs `organization`) is chosen from the connection's stored `boardOwnerType`, same pattern as `verifyBoardAccess`.
- An item is included when `fieldValueByName` resolves and its `name` (lowercased) contains `"in progress"` (research.md Decision 2).
- `content` with no matching inline fragment (e.g. a redacted item) is skipped rather than erroring.
- First 100 items only — pagination is not built for this iteration (Assumptions: matches the feature's on-demand, best-effort read; a board with more than 100 items in flight is not the common case this targets).

## Validation / business rules carried over unchanged

- Session auth (`SessionGuard`, `@CurrentUser()`) and the existing anti-enumeration response shape are untouched.
- `specs/005-github-project-connection`'s token encryption, contributor-only connection management, and connection data model are untouched — this feature only reads them.
