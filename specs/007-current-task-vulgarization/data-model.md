# Phase 1 Data Model: Vulgarize the Current Task with AI

## New table: `VulgarizedTask`

```prisma
model VulgarizedTask {
  id        String @id @default(uuid()) @db.Uuid
  projectId String @map("project_id") @db.Uuid
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // The GraphQL global node id of the ProjectV2Item itself (research.md Decision 3)
  // — not the underlying Issue/PR/DraftIssue's own id.
  githubItemId String @map("github_item_id")
  locale       String

  // Only ever written together, atomically, on a successful vulgarization
  // (research.md Decision 4) — a failed attempt touches neither.
  originalTitle       String  @map("original_title")
  originalDescription String? @map("original_description")

  // Nullable: no successful vulgarization has ever completed for this
  // (item, locale) pair yet. The read path treats a null vulgarizedTitle as
  // "not there" — same clean empty state as no row at all (FR-007).
  vulgarizedTitle       String? @map("vulgarized_title")
  vulgarizedDescription String? @map("vulgarized_description")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([projectId, githubItemId, locale])
  @@map("vulgarized_tasks")
}
```

Add the inverse relation `vulgarizedTasks VulgarizedTask[]` on `Project`. Purely additive migration — no change to any existing table.

## `packages/schemas` — `url` dropped

`CurrentTaskItemSchema` (`specs/006-current-task-fetch`) drops its `url` field, which has had zero consumers since `specs/006`'s own feedback round removed the "View on GitHub" link — the client is never sent to GitHub to read a task. Carrying it through this new persisted flow would mean adding a database column solely to shuttle an already-dead value, so it is removed instead:

```ts
export const CurrentTaskItemSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
});
```

## New internal-only schema: `vulgarization-output.schema.ts`

Lives in `apps/api/src/task-vulgarization/` — never crosses the API boundary to the frontend, so it does not belong in `packages/schemas` (Constitution II: narrow a third-party boundary explicitly, at that boundary).

```ts
export const VulgarizationOutputSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
});
```

Used to validate the Anthropic tool-use response before it is persisted. A response that fails validation is treated as a failed vulgarization attempt (research.md Decision 4 — the row is left untouched).

## Endpoint contract

| Method | Path | Query | Response | Notes |
|---|---|---|---|---|
| `GET` | `/projects/:projectId/current-task` | `locale?: "en" \| "fr"` (default `"fr"` if missing/invalid, per `routing.ts`'s `defaultLocale`) | `CurrentTaskItemSchema[]` | Same membership/visibility rules as `specs/006` (any project member may call it; only the client-facing UI restricts who sees the cartouche). Reads only `VulgarizedTask` rows where `vulgarizedTitle IS NOT NULL` for the given `(projectId, locale)` — never calls GitHub or an LLM (FR-003). |

`current-task.service.ts` no longer holds `BoardConnection`/`GithubProjectsClient` logic at all — it calls `TaskVulgarizationService.getVulgarizedCurrentTask(projectId, locale): Promise<CurrentTaskItem[]>`, exported by the new module.

## GitHub GraphQL query change

`GithubProjectsClient.fetchInProgressItems`'s existing query (`specs/006-current-task-fetch`) adds `id` to each item node, needed for `githubItemId` (research.md Decision 3):

```graphql
items(first: 100) {
  nodes {
    id                     # + new: ProjectV2Item's own node id
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
```

Everything else about this query and its "in progress" filtering (`specs/006-current-task-fetch`'s `data-model.md`) is unchanged.

## Write-path flow (`TaskVulgarizationService`, `@Cron` every 5 minutes — research.md Decision 2)

For each `BoardConnection` row:

1. Decrypt the token, call `fetchInProgressItems` (unchanged detection logic, `specs/006`).
2. For each returned item, look up the existing `VulgarizedTask` row by `(projectId, githubItemId, locale)` for each supported locale (`en`, `fr`).
3. If no row exists, or the fetched `(title, description)` differs from the row's `originalTitle`/`originalDescription`: call `AnthropicVulgarizationClient` for that locale.
   - On success: upsert the row with the new `original*` and `vulgarized*` fields together.
   - On failure (network error, timeout, schema-validation failure): leave the row untouched — do not update `original*` (research.md Decision 4), so the next sweep retries against the same baseline.
4. If the fetched content is identical to the stored `original*`: no LLM call (FR-004) — row untouched.

A failure on one `BoardConnection`, one item, or one locale is caught and logged; it does not abort the sweep for other connections/items/locales (each iteration is independent, matching `specs/006`'s existing per-item independence, spec.md Edge Cases).

## Validation / business rules carried over unchanged

- Session auth, membership checks (`assertIsMember`), and the anti-enumeration response shape are untouched.
- `specs/005-github-project-connection`'s token encryption and connection data model are untouched — this feature only reads `BoardConnection` rows, same as `specs/006` did.
- `specs/006-current-task-fetch`'s "in progress" detection convention (Status field, "in progress" substring match) is unchanged — this feature only adds a step after that detection, never alters it (FR-008).
