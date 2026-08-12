# Contract: Sections API

**Date**: 2026-08-12 · **Spec**: [spec.md](../spec.md) · **Data model**: [data-model.md](../data-model.md)

All routes sit under `/projects/:projectId/documentation`, require a session, and
require contributor access to the project. A caller without access receives the same
response as one asking about a project that does not exist — the constitution's
Principle V, already the convention in feature 016.

---

## Managing sections

### `POST /sections`

Create a section. Body: `name`, `instructions`, and the four editorial dimensions.
Returns the created section with `refreshNeeded: true` — it has never been composed.

`400` when the project holds no canonical content at all (FR/US1.6): a section
composed from nothing is not worth queuing.

### `GET /sections`

The project's non-archived sections in `sortOrder`, each with its current state:
whether it needs a refresh, whether a proposal is composing or awaiting review,
whether it has approved content the client can read.

### `PATCH /sections/:sectionId`

Rename, retone, revise the instructions, or move in the order. Any change to `name`,
`instructions` or the editorial dimensions sets `refreshNeeded` and does **not**
compose (FR-020). Reordering alone does not.

Carries the section's `version`; a stale version is refused with `409` rather than
overwriting a concurrent edit.

### `DELETE /sections/:sectionId`

Archives it. Stops any composition in flight (US4.4), removes it from the client's
view, and republishes the remaining approved sections as a complete set.

---

## Composing

### `POST /sections/:sectionId/composition`

Trigger a composition. Accepted (`202`) with the proposal's id.

`409` when the section already has a composition in flight — one at a time (FR-013).

### `GET /sections/:sectionId/proposal`

The current proposal: its status, its proposed blocks once `pending_review`, its
change summary, which documents fed it, and — separately from the content — the
questions composition could not resolve (FR-010).

When composition found nothing matching the section's instructions, the proposal says
so explicitly rather than returning empty blocks (FR-011).

### `POST /sections/:sectionId/proposal/approve`

Approve the current proposal. Accepted (`202`); publication follows atomically with
every other approved section.

Carries the proposal's `version`; `409` if a newer proposal has replaced it.

---

## Correcting

The two corrections are separate routes because they are separate acts with different
reach (FR-017). The interface must make that difference legible; the API makes it
structural.

### `POST /corrections/factual`

Correct the truth of a statement. Body: the information item, the corrected content,
the expected canonical head. Creates an attributable revision of the canonical source
and therefore reaches every section (FR-014).

This is feature 016's existing guided-correction path, unchanged apart from where it
is called from.

`409` when the canonical head has moved: the contributor is correcting something they
were not looking at.

### `POST /sections/:sectionId/exclusions`

Record that a statement does not belong in this section. Body: the information item
and a reason. Sets `refreshNeeded` on that section only.

Idempotent: excluding the same statement twice is not an error.

### `DELETE /sections/:sectionId/exclusions/:informationItemId`

Undo it. Sets `refreshNeeded` on that section.

---

## Answering a question

### `POST /sections/:sectionId/questions/:questionId/answer`

Answer what composition could not resolve. The answer becomes an attributable
contributor assertion in the canonical source — the same mechanism feature 016 uses,
so an answer given while reviewing one section is available to every other.

A question may be left unanswered indefinitely; the section publishes with the point
explicitly marked open.

---

## What the client reads

### `GET /projects/:projectId/documentation/public-sections`

Unchanged in purpose, changed in shape: the published sections in the contributor's
order, each with its authored name and its derived content. A section with no
published content is absent rather than empty (FR-023).

---

## Retired

| Route | Why |
|---|---|
| `PATCH .../editorial-profile` and its proposal/preview routes | tone moved onto the section (Decision 6) |
| every route keyed by `categoryKey` | the key no longer exists (Decision 1) |
| the per-category draft accept/discard routes | replaced by proposal approve, above |

FR-024 requires that none of these survive without a consumer, including their
translated strings and their tests.
