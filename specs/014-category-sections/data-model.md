# Data Model: Fixed Categories & Per-Category Document Sections

Phase 1 output. Rationale for each shape lives in [research.md](./research.md).

---

## Removed

| Entity | Why |
|---|---|
| `ResourceVulgarization` | Q1 — the whole-document rewrite is replaced by the sections |
| `ResourceCategory` | FR-001 — categories are product-owned constants, not per-project rows |
| `ResourceCategoryAssignment` | Replaced by `ResourceSection`, which carries content, not just a label |
| enum `ResourceCategoryAssignmentStatus` | Replaced by `ResourceSectionStatus` (identical values, renamed for its new owner) |

`Resource` loses its `vulgarizations` and `categoryAssignments` relations and gains `sections`.
Everything else on `Resource` — lifecycle, original-file fields, `anthropicBatchId`,
`failureReason` — is unchanged.

---

## The category list (constant, not a table)

Four entries, frozen and ordered. `other` is last, and is the catch-all of FR-003.

| Key | `labelEn` | `labelFr` |
|---|---|---|
| `overview` | The project | Le projet |
| `how_it_works` | How it works | Comment ça marche |
| `planning` | Roadmap | Planning & jalons |
| `other` | Other information | Autres informations |

The array's order **is** the display order of the client's tabs (FR-022). Keys are
identifier-safe so the same four strings serve as TypeScript values, wire values and Prisma
enum members with no mapping (research.md Decision 2).

Lives in three synchronized places:

- `packages/schemas/src/resource-category.ts` — the array plus `ResourceCategoryKeySchema`
  (a Zod enum), consumed by `apps/web`
- `apps/api/src/resources/resource-categories.ts` — hand-copied, consumed by `apps/api`
- `apps/api/prisma/schema.prisma` — `enum ResourceCategoryKey`, enforced by Postgres

---

## New entity: `ResourceSection`

One row per (document, category) pair the document actually addresses. This is the unit a client
reads and a contributor reviews.

```prisma
enum ResourceCategoryKey {
  overview
  how_it_works
  planning
  other
}

enum ResourceSectionStatus {
  proposed
  approved
  rejected
}

model ResourceSection {
  id         String   @id @default(uuid()) @db.Uuid
  resourceId String   @map("resource_id") @db.Uuid
  resource   Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)

  categoryKey ResourceCategoryKey   @map("category_key")
  status      ResourceSectionStatus @default(proposed)

  // Order the analysis produced this section in. Ties are broken by it when
  // several sections of the same resource land in one category tab (FR-022).
  position Int

  // Both languages in one row, produced together (research.md Decision 1).
  // The read layer resolves one pair per caller locale, exactly as 013's
  // labelEn/labelFr already did.
  titleEn   String
  contentEn String
  titleFr   String
  contentFr String

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // FR-010 — at most one section per (document, category). Also what makes a
  // re-run an upsert rather than a duplicate, and what a move must respect.
  @@unique([resourceId, categoryKey])
  @@map("resource_sections")
}
```

### Validation rules

- `titleEn` / `titleFr` non-empty; `contentEn` / `contentFr` non-empty. A section with no
  content is not a section — the analysis should have omitted the category (FR-006).
- `categoryKey` must be one of the four constants; enforced by the Postgres enum, by the Zod
  schema at the API boundary, and by the tool schema handed to the analysis provider.
- A resource with **zero** sections after successful analysis is a processing failure, not an
  empty success (spec Edge Cases) — `status: failed` with a reason.

### State transitions

```
                 ┌──── approve ────► approved   (terminal)
   proposed ─────┤
                 └──── reject  ────► rejected   (terminal)
        │
        └──── move(categoryKey) ────► proposed   (category changes, content does not)
```

- `approve` / `reject` are one-way. Re-deciding an already-decided section is `409`.
- `move` is permitted **only** from `proposed` (research.md Decision 4), never changes
  `titleEn`/`contentEn`/`titleFr`/`contentFr` (FR-015), and is `409` when the target category
  already holds a section of the same resource (the `@@unique` above).
- All three are independent of the resource's own `status`; none of them publishes anything.

---

## Read shape (`ResourceResponse`)

Returned by both `GET /projects/:projectId/resources` and
`GET /projects/:projectId/resources/:resourceId`, in `packages/schemas/src/resource.ts`.

**Removed**: `vulgarizedTitle`, `vulgarizedContent`, `categories`.
**Added**: `sections`.

```ts
ResourceSection = {
  id: string;                  // the section's own id — the target of approve/reject/move
  categoryKey: ResourceCategoryKey;
  status: 'proposed' | 'approved' | 'rejected';
  title: string;               // locale-resolved server-side from titleEn/titleFr
  content: string;             // locale-resolved server-side
}

Resource = {
  id, projectId, source, status, title,
  originalFileUrl, originalFileName, originalFileMimeType, notionPageUrl,
  failureReason, publishedAt, createdAt,
  sections: ResourceSection[],
}
```

Two changes to how this is populated (research.md Decision 5):

- `sections` — including full `content` — is returned by the **list** endpoint, not just the
  detail one. This is what makes FR-019 possible; `includeDetails` disappears from
  `toResponse`.
- `originalFileUrl` is presigned on every read, list included, so an accordion block can offer
  the original file (FR-020). Presigning is a local signature, not a call to R2.

**Role filtering**, unchanged in spirit from what `findAllForProject` already does for
`Resource.status`:

| Caller | Resources | Sections |
|---|---|---|
| contributor | all | all statuses |
| client | `published` only | `approved` only |

A client therefore cannot observe that a rejected section ever existed (FR-016).

---

## Migration (destructive, Q3)

One Prisma migration:

1. Create `ResourceCategoryKey`, `ResourceSectionStatus`, `resource_sections`.
2. Drop `resource_category_assignments`, `resource_categories`, `resource_vulgarizations`, and
   the `ResourceCategoryAssignmentStatus` enum.
3. `UPDATE resources SET status = 'failed', failure_reason = '<plain-language reason>',
   anthropic_batch_id = NULL WHERE status <> 'failed';`

Step 3 is what keeps carried-over resources honest: they no longer have readable content, so
leaving them at `published` or `ready_for_review` would show the contributor a resource that
looks fine and shows the client nothing. Their uploaded files are untouched — re-adding a
document is the recovery path, per Q3.
