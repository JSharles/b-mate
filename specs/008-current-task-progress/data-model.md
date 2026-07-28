# Phase 1 Data Model: Current Task Progress

## New table: `TaskProgress`

```prisma
enum TaskComplexity {
  simple
  complex
}

enum EstimateSource {
  board
  ai
}

// One row per (project, GitHub board item) — locale-independent (research.md
// Decision 1), unlike VulgarizedTask. Tracks when a task started and what its
// estimated completion date is, resolved once per sweep from the priority
// order in spec.md FR-004: board Target date > board Estimate + connection
// unit > AI-supplied duration.
model TaskProgress {
  id        String  @id @default(uuid()) @db.Uuid
  projectId String  @map("project_id") @db.Uuid
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  githubItemId String @map("github_item_id")

  // Set once, the first time this item is observed as in-progress, and
  // never updated again (spec.md FR-002/FR-006) — the fallback start date
  // when the board provides none.
  detectedStartedAt DateTime @map("detected_started_at")

  // Resolved fresh every sweep: the board's own "Start date" field when
  // present and valid, else detectedStartedAt. (Unlike detectedStartedAt,
  // this can "switch" from fallback to board-provided once the developer
  // fills the field in — spec.md User Story 1, Acceptance Scenario 3.)
  resolvedStartedAt DateTime @map("resolved_started_at")

  // Resolved once per sweep (research.md Decision 4) via the three-tier
  // priority order. Nullable: no source has ever successfully produced one
  // yet (e.g. the AI call has never succeeded and the board has neither
  // field) — same "not there yet" semantics as VulgarizedTask.vulgarizedTitle.
  estimatedCompletionAt DateTime?       @map("estimated_completion_at")
  estimateSource        EstimateSource? @map("estimate_source")

  // Always populated whenever the AI call has ever succeeded, independent of
  // whether its estimate is the one actually shown (FR-003a requires the
  // complexity judgment regardless of estimate source). Duration, not a
  // date (research.md Decision 3) — recomputed against a possibly-shifted
  // resolvedStartedAt each sweep without re-calling the LLM.
  aiComplexity            TaskComplexity? @map("ai_complexity")
  aiEstimatedDurationDays Int?            @map("ai_estimated_duration_days")

  // The content this row's AI estimate/complexity were computed against —
  // mirrors VulgarizedTask's original* change-detection, but per-item, not
  // per-locale (research.md Decision 6). A failed AI call leaves
  // aiComplexity/the ai-tier estimate untouched and does NOT update these,
  // so the next sweep retries against the same baseline (specs/007 research
  // Decision 4 precedent).
  lastEstimatedTitle       String  @map("last_estimated_title")
  lastEstimatedDescription String? @map("last_estimated_description")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([projectId, githubItemId])
  @@map("task_progress")
}
```

Add the inverse relation `taskProgress TaskProgress[]` on `Project`. Purely additive migration.

## `BoardConnection` change: `estimateUnit`

```prisma
enum EstimateUnit {
  days
  hours
}

model BoardConnection {
  // ...existing fields unchanged...
  estimateUnit EstimateUnit @default(days) @map("estimate_unit")
}
```

Set at connection-creation time (`POST /projects/:projectId/board-connection`), alongside the existing token/owner/board-number fields — defaults to `days` if the developer doesn't specify one. No edit endpoint exists for board connections today (research.md Decision 5); adding one is out of scope for this feature.

## `packages/schemas` changes

### `CurrentTaskItemSchema` — new fields

```ts
export const CurrentTaskItemSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  updatedAt: z.string(),
  startedAt: z.string(), // always present — resolvedStartedAt, ISO string
  estimatedCompletionAt: z.string().nullable(),
  estimateConfidence: z.enum(['high', 'medium', 'low']).nullable(), // null iff estimatedCompletionAt is null
});
```

`estimateConfidence` is resolved server-side from `(estimateSource, aiComplexity)` via the fixed matrix (spec.md FR-003a) before the response is built — the frontend never re-derives it, it only renders it. The frontend computes the live progress percentage and the "running over" state itself from `startedAt` + `estimatedCompletionAt` + the current time (research.md Decision 4 — never a stored field).

### `CreateBoardConnectionRequestSchema` — new optional field

```ts
export const CreateBoardConnectionRequestSchema = z.object({
  token: z.string().min(1),
  ownerLogin: z.string(),
  ownerType: z.enum(['User', 'Organization']),
  number: z.number().int().positive(),
  estimateUnit: z.enum(['days', 'hours']).optional(), // defaults to "days" server-side if omitted
});
```

## New internal-only schema: `task-estimate-output.schema.ts`

Lives in `apps/api/src/task-vulgarization/` (same home as `vulgarization-output.schema.ts`) — never crosses the API boundary, so not in `packages/schemas` (Constitution II).

```ts
export const TaskEstimateOutputSchema = z.object({
  estimatedDurationDays: z.number().positive(),
  complexity: z.enum(['simple', 'complex']),
});
```

Used to validate `AnthropicVulgarizationClient.estimateTask()`'s tool-use response (research.md Decision 3) before it's used to compute `estimatedCompletionAt`.

## Confidence matrix (spec.md FR-003a) as a pure function

```ts
function resolveConfidence(
  source: 'board' | 'ai' | null,
  complexity: 'simple' | 'complex' | null,
): 'high' | 'medium' | 'low' | null {
  if (!source || !complexity) return null;
  if (source === 'board') return complexity === 'simple' ? 'high' : 'medium';
  return complexity === 'simple' ? 'medium' : 'low';
}
```

Lives alongside the resolution logic in `task-vulgarization.service.ts` — a single, directly unit-testable function, not duplicated at each call site.

## GitHub GraphQL query change

`GithubProjectsClient.fetchInProgressItems`'s query adds three aliased field lookups (GraphQL requires aliases to call `fieldValueByName` more than once per node):

```graphql
items(first: 100) {
  nodes {
    id
    content {
      __typename
      ... on Issue { title body }
      ... on PullRequest { title body }
      ... on DraftIssue { title body }
    }
    status: fieldValueByName(name: "Status") {
      ... on ProjectV2ItemFieldSingleSelectValue { name }
    }
    startDate: fieldValueByName(name: "Start date") {
      ... on ProjectV2ItemFieldDateValue { date }
    }
    targetDate: fieldValueByName(name: "Target date") {
      ... on ProjectV2ItemFieldDateValue { date }
    }
    estimate: fieldValueByName(name: "Estimate") {
      ... on ProjectV2ItemFieldNumberValue { number }
    }
  }
}
```

`InProgressItem` (currently `{ id, title, description }`) gains three optional fields:

```ts
export interface InProgressItem {
  id: string;
  title: string;
  description: string | null;
  boardStartDate: string | null;   // ISO date, from the "Start date" field
  boardTargetDate: string | null;  // ISO date, from the "Target date" field
  boardEstimateValue: number | null; // raw number, from the "Estimate" field
}
```

A field of the wrong underlying type (e.g. a text field named "Estimate") simply produces no match on its fragment — `fieldValueByName` returns a value whose `__typename` doesn't match `ProjectV2ItemFieldNumberValue`, so the fragment spread yields `null`, naturally satisfying spec.md's edge case ("treat as absent, don't fail the sweep") with no extra code.

## Endpoint contract changes

| Method | Path | Query | Response | Notes |
|---|---|---|---|---|
| `GET` | `/projects/:projectId/current-task` | `locale?: "en" \| "fr"` | `CurrentTaskItemSchema[]` (extended, see above) | Unchanged auth/membership rules (specs/006/007). Now also reads the matching `TaskProgress` row per item to populate the new fields — still zero calls to GitHub or the LLM on this path. |
| `POST` | `/projects/:projectId/board-connection` | — | `BoardConnectionSchema` | Request body gains optional `estimateUnit` (see `CreateBoardConnectionRequestSchema` above). |

## Write-path flow additions (`TaskVulgarizationService.processConnection`)

For each fetched item, alongside the existing per-locale vulgarization loop:

1. Look up the existing `TaskProgress` row by `(projectId, githubItemId)`.
2. If no row exists: create one with `detectedStartedAt = now()`.
3. Compute `resolvedStartedAt = item.boardStartDate ?? (existing?.detectedStartedAt ?? now())`.
4. If `item.title`/`item.description` differ from the row's `lastEstimatedTitle`/`lastEstimatedDescription` (or no row existed yet): call `estimateTask()`.
   - On success: update `lastEstimatedTitle`/`lastEstimatedDescription`, `aiComplexity`, and remember the computed `resolvedStartedAt + estimatedDurationDays` as the AI-tier estimate.
   - On failure: log and keep the row's existing `aiComplexity`/AI-tier estimate untouched (research.md Decision 6).
5. Resolve `estimatedCompletionAt`/`estimateSource` in priority order: `item.boardTargetDate` → (`item.boardEstimateValue` + the connection's `estimateUnit`, added to `resolvedStartedAt`) → the AI-tier estimate from step 4 (freshly computed or previously stored) → `null`.
6. Upsert the `TaskProgress` row with all of the above.

Step 6 happens once per item, not once per locale — independent of the existing per-locale `processItem` loop for `VulgarizedTask`.

`deleteMany` cleanup (research.md Decision 7) runs for both `vulgarizedTask` and `taskProgress` in the same place `processConnection` already clears stale `VulgarizedTask` rows.

## Validation / business rules carried over unchanged

- Session auth, membership checks (`assertIsMember`), and the anti-enumeration response shape are untouched.
- specs/005's token encryption and connection data model are untouched beyond the additive `estimateUnit` column.
- specs/006's "in progress" detection convention (Status field, "in progress" substring match) is unchanged.
- specs/007's `VulgarizedTask` change-detection, failure semantics, and per-locale loop are unchanged — this feature adds a parallel, independent path alongside it, not a modification to it.
