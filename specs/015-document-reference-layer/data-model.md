# Data Model: Reference Documentation Layer & Derived Client Content

Phase 1 output. Rationale lives in [research.md](./research.md).

---

## Removed

| Entity | Because |
|---|---|
| `ResourceSection` | The document × category unit is what this feature replaces |
| `ResourceCategoryKey` values | Kept — the enum survives unchanged, only its users change |
| `ResourceSectionStatus` | Review moves to the reference layer, with its own states |
| `ResourceStatus.ready_for_review` / `.published` | Q3 — there is no per-document publication any more |

`Resource` keeps its identity, its original file, and its Notion URL. It stops being something a
reader ever sees and becomes purely an input.

---

## Four entities, three lifecycles

The previous model let one column on `Resource` stand for everything. It no longer can. What
follows is deliberately shaped so that each thing that progresses independently has its own row
and its own states.

```
Resource ──┬──► CategoryExtract ──┐
           │   (doc × category)   │  merge
           │                      ▼
           └──────────────► CategoryReferenceDraft ──(accept)──► CategoryReference
                             (0..1 per category)                  (live, validated)
                                                                        │ derive
                                                                        ▼
                                                                  CategoryContent
                                                                 (what a client reads)
```

### `Resource` — the input

Unchanged except for its status, which loses the states that existed to serve a publication step
that no longer exists.

```prisma
enum ResourceStatus {
  pending    // received, awaiting analysis
  absorbed   // its material now lives in the reference layer
  failed     // analysis could not complete; failureReason says why
}
```

`anthropicBatchId` and `failureReason` keep their current roles.

### `CategoryExtract` — what one document contributes to one category

The unit that makes deletion possible (research.md Decision 1). Never shown to anyone; it exists
so a category can be rebuilt from the documents that remain.

```prisma
model CategoryExtract {
  id         String   @id @default(uuid()) @db.Uuid
  resourceId String   @map("resource_id") @db.Uuid
  resource   Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)

  categoryKey ResourceCategoryKey @map("category_key")

  // What this document says about this category, in reference style. Written
  // once at ingestion and never rewritten — merging happens downstream.
  content String

  createdAt DateTime @default(now()) @map("created_at")

  @@unique([resourceId, categoryKey])
  @@map("category_extracts")
}
```

`onDelete: Cascade` is what makes FR-019 work: deleting a document removes its extracts, and the
affected categories are then rebuilt from what is left.

### `CategoryReference` — the validated reference documentation

One row per (project, category), holding only content a contributor has accepted.

```prisma
model CategoryReference {
  id        String  @id @default(uuid()) @db.Uuid
  projectId String  @map("project_id") @db.Uuid
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  categoryKey ResourceCategoryKey @map("category_key")

  // Single-language: this is the contributor's working document (spec
  // Assumptions). The client-facing layer below produces both locales.
  content String

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([projectId, categoryKey])
  @@map("category_references")
}
```

No status column: existing means live. A row without a validated version simply does not exist.

### `CategoryReferenceDraft` — a regeneration awaiting review

At most one per (project, category). The unique constraint is doing real work: it is what
serialises two documents ingested at once (spec Edge Cases).

```prisma
enum ReferenceDraftStatus {
  pending_review     // waiting for the contributor
  awaiting_answers   // questions raised, US5 — later slice
}

model CategoryReferenceDraft {
  id        String  @id @default(uuid()) @db.Uuid
  projectId String  @map("project_id") @db.Uuid
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  categoryKey ResourceCategoryKey  @map("category_key")
  status      ReferenceDraftStatus @default(pending_review)

  content String

  // Why this draft exists — shown in the review queue so a contributor knows
  // what they are looking at without opening it.
  trigger        DraftTrigger @map("trigger")
  triggerResourceId String?   @map("trigger_resource_id") @db.Uuid

  // The review loop (research.md Decision 4). Reset naturally: accepting or
  // discarding deletes the row.
  attempt          Int     @default(1)
  lastInstruction  String? @map("last_instruction")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([projectId, categoryKey])
  @@map("category_reference_drafts")
}

enum DraftTrigger {
  document_added
  document_removed
  regeneration_requested
}
```

### `CategoryContent` — what a client reads

Derived from `CategoryReference`, never from itself (FR-010). Both locales in one row, matching
the pattern already used elsewhere.

```prisma
model CategoryContent {
  id        String  @id @default(uuid()) @db.Uuid
  projectId String  @map("project_id") @db.Uuid
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  categoryKey ResourceCategoryKey @map("category_key")

  contentEn String
  contentFr String

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([projectId, categoryKey])
  @@map("category_contents")
}
```

No review state — FR-014 makes reference validation the only gate. Existence means visible.

### `ReferenceQuestion` — US5, last slice

Specified now so the draft's `awaiting_answers` state has a destination; built last.

```prisma
model ReferenceQuestion {
  id      String                 @id @default(uuid()) @db.Uuid
  draftId String                 @map("draft_id") @db.Uuid
  draft   CategoryReferenceDraft @relation(fields: [draftId], references: [id], onDelete: Cascade)

  question String
  answer   String?
  // Lower is more important — FR-022 orders by impact on what the client reads.
  rank     Int

  createdAt DateTime @default(now()) @map("created_at")

  @@map("reference_questions")
}
```

---

## Validation rules

- `CategoryExtract.content`, `CategoryReference.content`, `CategoryReferenceDraft.content`,
  `CategoryContent.contentEn/contentFr`: non-empty. An empty body is not content — the category
  should not have been produced.
- `categoryKey` is constrained by the Postgres enum, by the shared schema at the API boundary,
  and by the analysis tool schema. Unchanged from 014.
- `CategoryReferenceDraft.attempt` ≤ 3 (research.md Decision 4). Beyond it, regeneration is
  refused and only accept or discard remain.
- A `CategoryReference` with no surviving `CategoryExtract` for its category must not exist —
  deleting the last contributing document removes it (FR-020), taking its `CategoryContent`
  with it.

## State transitions

```
Resource:   pending ──► absorbed
                   └──► failed

Draft:      (none) ──► pending_review ──accept──► promoted to CategoryReference, row deleted
                              │        └─discard──► row deleted, live version untouched
                              └─regenerate(instruction)──► new draft, attempt+1 (max 3)
                              └─(US5)──► awaiting_answers ──► pending_review

Reference:  (none) ──► live ──► live (replaced on each accepted draft)
                            └──► removed when its last extract goes

Content:    (none) ──► live, re-derived on every reference change
                            └──► removed with its reference
```

---

## Migration — full wipe (Q1)

One migration, on a development-only database:

1. Drop `resource_sections` and `ResourceSectionStatus`.
2. Create `category_extracts`, `category_references`, `category_reference_drafts`,
   `category_contents`, `reference_questions`, and the two new enums.
3. Rewrite `ResourceStatus` to `pending | absorbed | failed`.
4. `DELETE FROM resources;` — Q1 is a clean start, and every surviving row would reference a
   status value that no longer exists and extracts that were never produced.

Objects already in file storage are left orphaned rather than deleted (research.md Decision 9).
