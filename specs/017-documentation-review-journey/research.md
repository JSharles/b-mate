# Research: Author-Defined Client Sections

**Date**: 2026-08-12 · **Spec**: [spec.md](./spec.md)

Every decision below was reached by reading the running system, not by preference.
Where a cheaper option exists it is named and the reason for rejecting it is given.

---

## Decision 1 — A section is a row, not an enum value

**Decision**: Introduce `ClientSection`, owned by a project, carrying its name, its
tone, its instructions, its order and its lifecycle. Delete the
`DocumentationCategoryKey` enum and every column typed by it.

**Rationale**: The spec removes the fixed list (FR-003). An enum cannot express a
list a contributor edits. Measured surface: the enum is referenced 24 times in the
Prisma schema across 12 models, and 49 source files know a `categoryKey`. Most of
those references become a foreign key to a row, which is mechanical; the ones that
are not mechanical are listed in Decisions 2 and 4.

**Alternatives rejected**:

- *Keep the enum and add values as needed.* Rejected: it re-creates exactly the
  problem the contributor named, one migration at a time, and still imposes one
  taxonomy on every project.
- *Free-text category on existing rows, no table.* Rejected: a section carries a
  tone, instructions and accumulated corrections. Those need somewhere to live, and
  a string cannot be renamed without rewriting every row that quotes it.

**Deletion, not archival, is wrong here**: a deleted section must stop being readable
by the client (FR/US4.2) while the revisions and provenance that fed it stay
explicable. `archivedAt` on the section, excluded from every read path, keeps history
intact and keeps foreign keys valid.

---

## Decision 2 — Ingestion stops classifying entirely

**Decision**: Remove category assignment from extraction and consolidation. Drop
`DocumentObservationCategory`, `SourceRevisionItemCategory` and `SourceRevisionImpact`.
Bump the extraction and consolidation output contracts accordingly.

**Rationale**: FR-001 and SC-007. Beyond the spec, this removes measured harm. The
extraction prompt currently asks the model to assign categories to every observation
it produces — sixty-one on one Notion page — on top of extracting them. That class of
bookkeeping failed four separate ways in a single session on 2026-08-11/12 (a
mistyped identifier, miscounted totals, a reference to a non-existent item, conflicts
flagged without explanation). Each fix revealed the next. Removing an entire
per-observation obligation is the same lesson applied one step earlier.

**What replaces it**: nothing. Selection happens at composition, per section,
against the section's own instructions. A statement may serve two sections; it is no
longer assigned to one (spec, Assumptions).

**Alternatives rejected**:

- *Keep classification and ignore it.* Rejected by FR-024 and by the cost it keeps
  imposing on every extraction.
- *Classify against the contributor's sections at ingestion time.* Rejected: sections
  change, documents do not. Re-classifying every observation whenever a section's
  instructions change is the expensive direction; reading the source through the
  instructions at composition time is the cheap one.

---

## Decision 3 — Composition reads the whole canonical source

**Decision**: Composing a section sends the section's name, tone and instructions,
plus every current canonical statement (content, kind, state), minus the statements
this section has excluded. The model selects and writes; it does not receive a
pre-filtered set chosen by us.

**Rationale**: There is no category left to filter on, and the section's instructions
are the only expression of relevance. Selection is exactly the judgement the model is
there to make.

**Size**: measured on the live project, 59 statements ≈ 7 100 characters ≈ 2 000
tokens. A project ten times larger stays well inside a 200k-token context. No
chunking, no retrieval, no summarisation — the corpus is bounded and small, which is
the same reasoning feature 016 used to reject RAG.

**Ceiling**: past roughly 5 000 statements the input stops being trivial. Nothing in
this feature addresses that; it is recorded here so the next person does not discover
it as a surprise.

---

## Decision 4 — Every canonical change marks every section, and nothing recomposes itself

**Decision**: When a new canonical revision is committed, mark every non-archived
section of that project as needing a refresh. Do not compute which sections are
actually affected.

**Rationale**: The spec requires marking rather than recomposing (FR-018) and leaves
the precision of "may affect" open. Computing real impact without categories means
asking a model whether each section's instructions touch the new material — one extra
call per section per document, with its own failure surface, to save the contributor
a decision they are making anyway. The contributor triggers refreshes selectively;
an over-inclusive mark costs them a glance, an under-inclusive one costs them stale
documentation they never learn about.

This also retires `SourceRevisionImpact`, whose only job was carrying which categories
a revision touched.

**Alternatives rejected**:

- *Ask the model which sections are affected.* Rejected on cost and on failure
  surface, for a gain the contributor does not need.
- *Recompose automatically.* Rejected by FR-018 and by the contributor explicitly
  ("à rafraîchir c'est pas mal").

---

## Decision 5 — Two corrections, two mechanisms, one of them enforced by us

**Decision**:

- A **factual correction** reuses feature 016's guided correction path unchanged: it
  creates an attributable revision of the canonical source and therefore reaches every
  section (FR-014).
- A **relevance correction** creates a `SectionExclusion` row binding one information
  item to one section, with a reason and an author. Composition filters excluded
  statements out of its input **before** the model sees them (FR-015, FR-016).
- A contributor may additionally revise the section's instructions, which is
  expressive but interpreted by the model rather than enforced.

**Rationale**: These are different acts with different reach, and the contributor
named both. The important half of this decision is that exclusion is enforced in code,
not requested in a prompt. This session's evidence is unambiguous: every invariant
delegated to the model — accounting totals, one record per observation, correct
reference kinds — was eventually broken. An exclusion the contributor made explicitly
must not depend on the model remembering it.

**Alternatives rejected**:

- *Append exclusions to the instructions as prose.* Rejected: unverifiable, and
  degrades as they accumulate. Kept as the separate, optional mechanism it is.
- *Let a relevance correction edit the composed text.* Rejected: contributors describe
  and correct, they do not write (FR-008), and any hand edit is lost at the next
  composition.

---

## Decision 6 — Tone moves onto the section; the project-level editorial profile is removed

**Decision**: Carry the four editorial dimensions on the section. Remove
`EditorialProfileRevision`, `EditorialProfileProposal`, `EditorialPreview`,
`ProjectEditorialSettings` and the `editorial_preview` generation stage.

**Rationale**: The contributor states the tone while creating a section, and a
project-wide register stops being meaningful once one section addresses a client's
budget question and another explains an architecture. The preview stage existed to
show the effect of a project-wide tone change before committing to it; with a
per-section proposal the contributor reviews anyway, it previews something they are
about to see for real.

**Blast radius**: one generation stage, four models, its settings screen and its
translated strings. All covered by FR-024.

**Risk accepted**: a contributor wanting one consistent register across ten sections
must state it ten times. Acceptable at the current scale; a project-level default that
a section may override is the obvious later addition and is deliberately not built now.

---

## Decision 7 — Section names are authored, therefore untranslated

**Decision**: A section's name is one string, written by the contributor, shown to the
client as-is. It is not a translation key.

**Rationale**: The contributor writes the name; the system cannot translate what it
did not author. The four fixed categories were translated because the product owned
them. This is a real, visible change: a project's headings will be in whatever language
its contributor wrote, and a client reading in the other locale sees them unchanged.

**Consequence for migration**: existing projects hold four categories whose names exist
in both locales. There is no project-level locale to choose from. Migration writes the
French name — the product's primary market — and the contributor renames if they
prefer otherwise. Recorded here because it is the one migration decision a contributor
will notice.

---

## Decision 8 — Sweep the models that already have no consumer

**Decision**: Delete `CategoryExtract`, `CategoryContent`, `CategoryReference` and
`CategoryReferenceDraft`, and their tables, as part of this feature.

**Rationale**: Measured: zero Prisma accessor references to any of them across
`apps/api/src`. They are residue of features 013 and 014, superseded by 016's
`DocumentationCategoryReference*` and never removed. FR-024 requires this feature to
leave nothing without a consumer; it would be perverse to enforce that on what this
change creates while stepping over what is already dead beside it.

**Verification**: `pnpm knip` for unreferenced symbols, `pnpm i18n:orphans` for
stranded translations, plus a schema-level check that no model remains without a
reader in `apps/api/src`.

---

## Decision 9 — Migration keeps every client reading

**Decision**: For each project holding published content, create one section per
category that has content, in the current fixed order, named as in Decision 7, with
the current project editorial profile copied onto each. Re-point existing approved
reference content and client content at the new sections. Publish nothing new.

**Rationale**: A client reading their documentation must not lose it because the
product changed its internal model. The published set stays byte-identical; only what
it hangs off changes.

**Alternatives rejected**:

- *Start every project blank.* Rejected: it silently unpublishes live client
  documentation.
- *Reprocess documents under the new model.* Rejected: expensive, and it would put
  content the contributor already approved back in the review queue.

---

## Decision 10 — Suggested starting points are interface copy, never data

**Decision**: Offer a short list of suggestions when a contributor creates a section.
Each carries a proposed name and a worked description of what to look for. Choosing one
prefills the form; the resulting section is an ordinary section, indistinguishable from
one typed blank. The list lives in the interface's translated strings. Nothing records
which suggestion a section came from, and nothing reasons about it afterwards.

**Rationale**: This is the antidote to the risk recorded at the bottom of this file. A
contributor's instructions are the only expression of what a section should hold, and a
vague instruction produces a vague section — a failure mode the system cannot detect
and cannot fix. A worked example shown at the moment of writing teaches what a usable
instruction looks like far better than help text does. The suggestion's real payload is
its description, not its title.

It also softens the blank page the contributor chose to keep, without reintroducing what
they rejected: these are starting points offered at creation, not sections the system
decides a project should have.

**The line that must not be crossed**: a suggestion must never become a row a section
references. The moment a section knows which preset it came from, the product has a
fixed taxonomy again — recorded, queryable, and eventually reasoned about — which is
exactly what this feature removes. FR-004b states this as a requirement rather than
leaving it to good sense.

**Suggested list**: the three headings that carried real meaning in the fixed four
(*what the project is*, *how it works*, *what happens when*), plus the audit and
requirements-gathering the contributor named as missing, plus a free title.

*Other* is deliberately not among them. It earned its place as the fourth of a closed
set — somewhere for whatever the other three could not hold. Offered as a suggestion it
says nothing, and a contributor who needs a section for leftovers is better served
naming what those leftovers actually are.

**Alternatives rejected**:

- *No suggestions, blank form.* Rejected on reflection with the contributor: it leaves
  the hardest field — the description — with no example of what good looks like.
- *Suggestions derived from the project's documents.* Still rejected, and now recorded
  twice: the contributor declined it, and it would make section creation depend on a
  generation call.

---

## Open risk, recorded not resolved

**Composition quality is unproven at this shape.** Feature 016's per-category drafting
worked against a fixed, well-understood set of four headings baked into the prompt.
Composition now works against instructions a contributor writes in free text, whose
quality the system cannot control. A vague instruction will produce a vague section.
Nothing in this plan mitigates that beyond FR-011 (say plainly when nothing matches);
the honest position is that the first real sections will teach us what the instruction
field needs to look like, and that is a reason to ship User Story 1 early rather than
to design further in advance.
