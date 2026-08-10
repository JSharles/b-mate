# Research: Reference Documentation Layer & Derived Client Content

Phase 0 output for [spec.md](./spec.md). Each decision resolves something the implementation
would otherwise have to guess at.

---

## Decision 1 — Store a per-document, per-category **extract**, not just the merged result

**Decision**: ingestion produces two things per affected category: an **extract** (what *this*
document contributes to *that* category, written in reference style) and the **merged reference
content** (existing content + this extract, integrated). Both are persisted.

**Rationale**: FR-019 requires deleting a document to regenerate its categories "as if it had
never been added". Without extracts there are only two ways to honour that, and both are bad:

- Re-read every remaining original from storage and redo the whole analysis — several requests,
  re-parsing PDFs and re-running vision on images, on every deletion.
- Ask the model to "remove document X's contribution" from merged prose — asking it to unmix
  paint. It cannot know which sentence came from where.

With extracts, deletion is a merge of the remaining extracts for that category: one request, no
storage reads, no vision. It also makes FR-008's provenance real rather than a bookkeeping
column, and gives a cheap "rebuild this category from scratch" for free.

**Cost**: one extra stored body per (document, category) pair, and a slightly larger analysis
output. Both are small next to what they buy.

**Alternatives considered**: provenance as a plain join table with no stored extract — rejected,
it records *that* a document contributed without preserving *what*, which is precisely what
deletion needs. Deriving reference content from extracts on every read rather than storing it —
rejected: merging is a model call, so reads would be non-deterministic and slow, and the
validated version has to be stable by definition.

---

## Decision 2 — One analysis request per ingestion, not a chain

**Decision**: a single request per ingested document. Its input is the document plus the current
reference content of all four categories; its output is, for each category the document
genuinely addresses, the extract and the new merged reference content.

**Rationale**: the tempting shape is a chain — classify first, then one merge request per
affected category. But the Batch API is fire-and-poll and the sweep runs every five minutes, so
each link in a chain costs a full sweep cycle before the next can even be submitted. A two-step
chain turns a single wait into two. One request keeps the latency profile identical to today's.

Input size stays bounded: the reference layer is four condensed bodies for one project, not a
corpus. It is condensed by construction — FR-004 merges redundancy rather than appending.

**Alternatives considered**: classify-then-merge as two batches (rejected: doubles wall-clock
latency for no quality gain). One request per category submitted in the same batch (rejected:
each would need the whole document as input, multiplying the payload by the number of affected
categories — the exact mistake 013 made by sending the same image three times).

---

## Decision 3 — Live content and pending draft are separate rows, not two columns

**Decision**: `CategoryReference` holds the **live**, validated content, one row per (project,
category). A pending regeneration lives in a separate `CategoryReferenceDraft` row, at most one
per (project, category), enforced by a unique constraint.

**Rationale**: FR-017 needs the client to keep reading the validated version while a draft
awaits review — separate rows make that a non-question rather than a filter everyone must
remember. The unique constraint doubles as the serialisation the Edge Cases require: two
documents ingested at once cannot produce two competing drafts for one category, because the
second insert fails and its material waits.

The draft is also where the review-loop state belongs — the attempt counter and the last
instruction given (Decision 4) — none of which has any business on validated content.

**Alternatives considered**: `liveContent`/`draftContent` columns on one row (rejected: every
read has to remember which column it wants, and the review-loop fields pollute the live record).
Full version history with a status enum (rejected as premature: nothing in the spec asks to read
an older version, and it can be added later without moving anything).

---

## Decision 4 — Regeneration is a new draft, capped, carrying its instruction

**Decision**: requesting a regeneration replaces the pending draft with a new one, built from
the same inputs plus the contributor's free-text instruction, and increments an attempt counter
on it. At three attempts the option disappears and only accept-or-discard remain.

**Rationale**: FR-016 wants the instruction taken into account, which means it has to reach the
model — so it is stored on the draft and passed as an additional constraint on the next pass.
Keeping the counter on the draft rather than the category is what makes "three attempts at
*this* correction" mean something; accepting or discarding ends the loop and resets it naturally
by deleting the row.

The cap exists because a model that has failed the same correction three times is not going to
succeed on the fourth, and an uncapped loop is an uncapped bill.

**Alternatives considered**: no cap (rejected — spec Edge Cases require a stop). Re-running the
whole ingestion instead of just the affected category (rejected: slower, and it would re-derive
the other categories the contributor may already have accepted).

---

## Decision 5 — Client content derives from reference content, in one request per category

**Decision**: accepting a draft promotes it to live reference content and enqueues one request
producing that category's client content in both locales, which publishes without further
review (FR-014).

**Rationale**: both locales in one request is 014's Decision 1, and it holds for the same
reason: it is what structurally guarantees the two languages say the same thing rather than
leaving it to be reconciled. Deriving one category at a time keeps each output small and means
accepting one category never blocks or re-derives another — which FR-014a requires anyway.

FR-010's "never from a previous client version" is satisfied by construction: the request's only
content input is the reference layer.

---

## Decision 6 — Exhaustiveness is the constraint that wins, and it is not CI-testable

**Decision**: the reference prompt states the tension explicitly and names the winner — clean in
form, exhaustive in substance, and where they conflict, exhaustiveness. Verification is a
deliberate manual scenario in quickstart, not an automated test.

**Rationale**: FR-003 is the requirement most likely to fail silently. "Produce a clean,
structured document" reads to a model as licence to compress, and this is the one layer where
compression is unrecoverable — after ingestion the originals are never read again.

Being honest about verification matters more than pretending: checking "every fact survived"
automatically would mean extracting facts from the source and searching for each in the output,
which is a second model call per document with its own false negatives. Not worth building now.
The quickstart scenario picks facts from a real source at random and looks for them — cheap, and
it actually catches the failure.

**Alternatives considered**: an automated fact-coverage check (rejected as disproportionate for
now, and it would itself need validating). Splitting into "extract facts" then "write prose"
passes (rejected: a chain, see Decision 2 — and it trades one failure mode for another).

---

## Decision 7 — SC-003 is verified once, by hand, not in CI

**Decision**: "no erosion after six ingestions" is validated once, manually, by ingesting a real
corpus two ways — six documents one at a time, and the same six in a single pass — and comparing
the reference layer.

**Rationale**: there is no cheap automated form of this. It needs a real corpus, real model
calls, and a judgement call on the comparison. Pretending otherwise would produce a test that
either never runs or asserts nothing. Naming it as a one-off manual check is the honest option,
and the two-layer architecture is what makes the result likely to hold in the first place —
client content is always one rewrite from a faithful source (Decision 5).

---

## Decision 8 — "Leave nothing behind" is enforced by a tool that fails, not a checklist

**Decision**: add **knip** as a dev dependency with a script wired into the same command CI
already runs, plus a small script comparing translation keys against their usages.

**Rationale**: FR-025 says no table, route, symbol, translation key or test file may survive
without a consumer, and the user asked for this to be verifiable rather than asserted. A review
checklist does not survive contact with a large diff. knip is built for exactly this on a
TypeScript monorepo — unused files, unused exports, unused dependencies — and it fails with a
non-zero exit code, which is the property that matters.

The two gaps knip does not cover:

- **Translation keys**: not a code symbol, so nothing detects an orphan. A ~20-line script
  comparing the keys in `apps/web/messages/*.json` against `t("…")` call sites closes it.
- **Database**: already covered without new tooling — `schema.prisma` is the single source of
  truth, so a dropped model cannot leave a table behind, and `prisma migrate diff` already
  proves migrations and schema agree (used during the 014 merge).

**Cost**: one dev dependency and an initial pass of configuration, since a first knip run on an
existing codebase always reports pre-existing findings that need triaging or ignoring.

**Alternatives considered**: a manual grep checklist in tasks.md (rejected — the user asked for
this specifically because checklists get skipped). ESLint's `no-unused-vars` (rejected: it works
within a file, and every symbol here is exported, so it sees nothing).

---

## Decision 9 — The migration wipes; orphaned storage objects are accepted

**Decision**: one destructive migration dropping the 014 tables and emptying `resources`. Files
already uploaded to object storage are left orphaned rather than deleted.

**Rationale**: Q1 is a wipe on a development-only environment, so there is nothing to preserve
and no conversion path worth building. Deleting the storage objects would mean iterating the
bucket from a migration, which is the wrong place for network calls and the wrong tool for a
cleanup that costs nothing to skip. Naming it here means it is a decision rather than an
oversight; a bucket lifecycle rule can handle it whenever it matters.

---

## Decision 10 — Removal inventory

Not a decision so much as the list FR-024 turns into work. Recorded here so nothing is
rediscovered late:

| Goes | Because |
|---|---|
| `ResourceSection` model, its two enums, `position` | Replaced by the reference/client layers |
| `document-sections-output.schema.ts` | New pipeline, new output shape |
| `/sections/:id/approve` · `/reject` · `/move` | Review moves to the category layer |
| `dto/move-resource-section.dto.ts` | Its route is gone (FR-024, explicitly) |
| `/resources/:id/publish` and `ResourceStatus.published` / `ready_for_review` | Q3 — validating reference content is the only act that publishes |
| `section-review-list.tsx` + spec | Replaced by the draft review queue |
| `category-section-accordion.tsx` | A category tab is one text (spec Assumptions) |
| `shared/components/ui/accordion.tsx` | Added for 014, no remaining consumer |
| `Projects.ResourceDetailPage.section*` / `publishBlocked` keys, both locales | Their UI is gone |
| `approveResourceSection` / `rejectResourceSection` / `moveResourceSection` + hooks + tests | Same |

What **stays**, and must not be collaterally removed: the frozen four-category list, the single
analysis pass shape, `image-normalizer.ts` (and `sharp`), `resource-storage.client.ts`, the
Notion client, and the upload/ingest entry points.
