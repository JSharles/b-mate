# Data Model: Author-Defined Client Sections

**Date**: 2026-08-12 · **Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

---

## What survives untouched

Feature 016's ingestion half is kept whole. `SourceDocument`, `DocumentObservation`,
`ProjectSource`, `SourceRevision`, `SourceRevisionItem`, `InformationItem`,
`ProvenanceLink`, `ContributorAssertion`, `Clarification*`, `GenerationOperation` and
`GenerationAttempt` keep their shape and their behaviour. Provenance, duplicate
merging, contradiction surfacing and attributable correction all continue to work as
built.

---

## New

### ClientSection

A heading the contributor created for their client.

| Field | Notes |
|---|---|
| `id` | |
| `projectId` | owner; cascade on project delete |
| `name` | what the client reads as the heading; authored, untranslated (Decision 7) |
| `instructions` | what the system should look for in the canonical source; free text |
| `length`, `pedagogy`, `technicalFamiliarity`, `tone` | the four editorial dimensions, moved off the retired project profile (Decision 6) |
| `sortOrder` | the order the client reads sections in; contributor-controlled |
| `refreshNeeded` | set when the canonical source moves or the section's own definition changes |
| `archivedAt` | soft delete; excluded from every read path (Decision 1) |
| `createdByUserId` | |
| `version` | optimistic concurrency, as elsewhere in this schema |

Rules:

- A project may hold any number, including none. A new project holds none (FR-005).
- Two sections may share a name; the contributor is warned, not blocked (Edge Cases).
- Archiving removes it from the client's view and from composition, and keeps every
  row that references it valid.

### SectionExclusion

One contributor judgement that a statement does not belong in one section.

| Field | Notes |
|---|---|
| `id` | |
| `sectionId` | cascade on section delete |
| `informationItemId` | the statement judged irrelevant here |
| `reason` | why; shown back to the contributor, never sent to the model |
| `createdByUserId` | |
| `createdAt` | |

Unique on (`sectionId`, `informationItemId`).

Rules:

- Enforced by filtering the composition input, never by asking the model to remember
  it (Decision 5).
- Scoped to its section. The same statement stays available to every other section
  (FR-015).
- Survives recomposition and refresh (FR-016).

### SectionProposal

What composition produced for a section, awaiting approval. Replaces
`DocumentationCategoryReferenceDraft`.

| Field | Notes |
|---|---|
| `id` | |
| `sectionId` | |
| `sourceRevisionId` | the canonical head it was composed from |
| `generationOperationId` | unique; the work that produced it |
| `status` | `composing`, `pending_review`, `approved`, `superseded`, `failed` |
| `structuredContent` | the proposed blocks; null unless `pending_review` or `approved` |
| `changeSummary` | what moved since the last approved proposal |
| `provenanceSummary` | which documents fed it |
| `failureCode` | set only when `failed` |
| `version` | |

Rules:

- One non-terminal proposal per section at a time (FR-013).
- A proposal that fails leaves the section's approved content readable (Edge Cases).
- A superseded or failed proposal releases the section, so a refresh can be triggered.

### SectionQuestion

A question composition could not resolve from the documents alone, surfaced beside
the proposal rather than inside it (FR-010).

| Field | Notes |
|---|---|
| `id` | |
| `proposalId` | |
| `question` | |
| `impactExplanation` | why it matters to what the client will read |
| `relatedInformationItemIds` | what it concerns |
| `answeredByAssertionId` | null until the contributor answers |

Rules:

- A question left unanswered never blocks publication; it becomes an explicitly marked
  open point in the section, as feature 016 already establishes (Edge Cases).

---

## Changed

### ClientCategoryContent → ClientSectionContent

`categoryKey` becomes `sectionId`. Everything else — the derived blocks, the locale,
the validation result — is unchanged.

### ClientContentReleaseEntry

`categoryKey` becomes `sectionId`. The release model itself is untouched: a release
still carries an expected count, a base, and publishes atomically by conditional swap.

### DocumentationCategoryReference → SectionReference

The approved factual content for a section. `categoryKey` becomes `sectionId`.

### CategoryProjectionState → retired

Its three jobs are absorbed:

- *which draft currently holds this category* → the section's single non-terminal
  proposal
- *which revision this category last reviewed* → the approved proposal's
  `sourceRevisionId`
- *which revision it should be at* → replaced by `refreshNeeded`, since the target is
  always the current head (Decision 4)

---

## Removed

| What | Why |
|---|---|
| `DocumentationCategoryKey` enum | the list is no longer fixed (Decision 1) |
| `DocumentObservationCategory` | ingestion stops classifying (Decision 2) |
| `SourceRevisionItemCategory` | same |
| `SourceRevisionImpact` | its only job was per-category impact; replaced by `refreshNeeded` (Decision 4) |
| `CategoryProjectionState` | absorbed, above |
| `DocumentationCategoryReferenceDraft` | becomes `SectionProposal` |
| `EditorialProfileRevision`, `EditorialProfileProposal`, `EditorialPreview`, `ProjectEditorialSettings` | tone moves onto the section (Decision 6) |
| `CategoryExtract`, `CategoryContent`, `CategoryReference`, `CategoryReferenceDraft` | already had zero consumers before this feature (Decision 8) |

---

## State transitions

### Section

```
created ──► refreshNeeded ──trigger──► composing ──► pending_review ──approve──► published
               ▲                           │                │
               │                           ▼                ▼
               └──── canonical head moves ─┴─ failed ───────┘
                     or definition revised
```

- A section is `refreshNeeded` from creation: it has never been composed.
- Approving publishes atomically with every other approved section (FR-022).
- Archiving is available from any state and stops composition in flight (US4.4).

### Proposal

`composing → pending_review → approved`, or `composing → failed`, or
`pending_review → superseded` when a newer proposal replaces it.

---

## Invariants

1. A statement excluded from a section never appears in that section's composition
   input, whatever the model does.
2. A factual correction reaches every section that draws on the corrected statement,
   without restatement.
3. The client reads a complete set of approved sections, never a partial one, at any
   moment during a refresh or an approval.
4. No canonical statement carries a section, a category, or any other destination.
5. An archived section is invisible to the client, to composition, and to publication,
   and breaks no foreign key.
