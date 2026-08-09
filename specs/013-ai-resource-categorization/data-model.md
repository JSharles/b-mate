# Phase 1 Data Model: AI Resource Categorization

Two new Prisma models. No changes to `Resource` or `ResourceVulgarization` themselves — both are extended only via new inverse relations.

## ResourceCategory

The canonical, per-project label for a "type of information" (spec.md Key Entities). Reused across resources within the same project (research.md Decision 2).

| Field | Type | Note |
|---|---|---|
| id | uuid | PK |
| projectId | uuid | FK → Project, `onDelete: Cascade` |
| key | string | Stable, English, kebab-case identity used for AI reuse-matching (e.g. `architecture-stack`) — never shown to a user directly |
| labelEn | string | Display label, English |
| labelFr | string | Display label, French |
| createdAt | datetime | |

**Constraints**: `@@unique([projectId, key])` — a project cannot have two categories with the same key; this is exactly the uniqueness that makes "reuse" well-defined for the prompt-injection step in research.md Decision 2.

**Relations**: `project: Project` (many categories per project); `assignments: ResourceCategoryAssignment[]`.

## ResourceCategoryAssignment

The many-to-many join between `Resource` and `ResourceCategory`, carrying its own independent approval state (research.md Decision 3). One row per (resource, category) pair ever proposed.

| Field | Type | Note |
|---|---|---|
| id | uuid | PK |
| resourceId | uuid | FK → Resource, `onDelete: Cascade` |
| categoryId | uuid | FK → ResourceCategory, `onDelete: Cascade` |
| status | enum `ResourceCategoryAssignmentStatus` (`proposed` \| `approved` \| `rejected`) | default `proposed` — mirrors `ResourceStatus`'s existing enum style |
| createdAt | datetime | |
| updatedAt | datetime | `@updatedAt` |

**Constraints**: `@@unique([resourceId, categoryId])` — a resource can be proposed for the same category at most once (re-processing a resource must upsert, not duplicate, matching `ResourceVulgarization`'s existing `resourceId_locale` upsert pattern in `ResourceBatchSweepService`).

**Relations**: `resource: Resource`; `category: ResourceCategory`.

**State transitions**: `proposed → approved` or `proposed → rejected`, both contributor-triggered (spec.md FR-004), one-way — re-approving/re-rejecting an already-decided assignment is out of scope for this iteration (spec.md Assumptions: "manual category renaming/merging... beyond approve/reject" is not assumed). A resource that gets re-processed (not currently a supported flow — resources aren't re-analyzed after `ready_for_review`) is out of scope here too.

## Extended read shape (no schema change, response shape only)

`ResourcesService.findAllForProject` / `findOne` already assemble a `ResourceResponse` per resource (see `apps/api/src/resources/resources.service.ts`). This gains one field:

```ts
interface ResourceResponse {
  // ...existing fields unchanged...
  categories: Array<{
    id: string;        // ResourceCategoryAssignment id — used as the target for approve/reject calls
    categoryId: string;
    key: string;
    label: string;      // resolved to the caller's own locale (labelEn/labelFr), same pattern as vulgarizedTitle/vulgarizedContent already are
    status: 'proposed' | 'approved' | 'rejected';
  }>;
}
```

**Client-role visibility**: a client's response for a resource only ever includes assignments with `status: 'approved'` (never `proposed`/`rejected`) — mirrors how `findAllForProject` already restricts the whole resource to `status: 'published'` for clients (spec.md FR-002, Constitution V). A contributor's response includes every assignment regardless of status (spec.md FR-006).

## Relations diagram

```
Project ||--o{ ResourceCategory
Project ||--o{ Resource
Resource ||--o{ ResourceCategoryAssignment
ResourceCategory ||--o{ ResourceCategoryAssignment
```
