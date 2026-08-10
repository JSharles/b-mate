# Feature Specification: Reference Documentation Layer & Derived Client Content

**Feature Branch**: `feat/document-reference-layer`

**Created**: 2026-08-10

**Status**: Approved — Q1/Q2/Q3 resolved 2026-08-10 (see Resolved Decisions)

**Input**: User description: "À partir d'une base documentaire, l'application extrait les informations pertinentes afin de constituer la documentation vulgarisée pour le client par catégorie. Je ne veux pas qu'un document = une section, ça n'a pas de sens et ajoute de la charge cognitive au client. Je veux du contenu instructif et léger… Le service backend devrait d'abord faire un tri, un classement, une reformulation solide sans vulgarisation : juste créer une doc de référence solide… une fois validée, elle sert de référence pour la génération du contenu vulgarisé, et donc même après 6 générations on s'appuiera sur ce contenu."

## Why This Supersedes 014

`specs/014-category-sections` shipped and its core premise broke on the second document.

014 made a **section** the unit: one per (document × category). A second document covering the same ground produced a second block underneath the first. The client was left to reconcile two texts saying overlapping things — exactly the cognitive load the feature exists to remove. "One document = one section" is a storage convenience, not a reading experience.

This feature keeps what 014 got right — the frozen four-category list, the single analysis pass, image normalization, review-gated publication — and replaces what it got wrong: **the unit becomes the category**, and a category holds one coherent body of content for the whole project.

That change alone would introduce a worse problem: if each new document rewrites a category's client-facing text from the *previous* client-facing text, every pass is slightly lossy, and by the sixth document the content has been through six lossy rewrites. Detail erodes invisibly. The answer is a **second layer**: a reference documentation layer, built and validated once, from which client content is always regenerated. Six documents in, the client text is still one rewrite away from a faithful source.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A messy corpus becomes structured reference documentation (Priority: P1)

A contributor's real documentation is disordered: scattered notes across several files, an architecture diagram, a couple of Notion pages, some of it overlapping, some of it contradictory. As each document is added, the system folds what it contains into a **reference documentation layer** — clean, organised, classified under the four fixed categories, written in ordinary professional language for the contributor themselves. It is explicitly **not** vulgarized: this is a working document, not client-facing prose.

Adding a document does not append to what is already there. The system reads the existing reference content for each category the document touches and produces a new version that integrates the newcomer — merging what is redundant, keeping what is new, preserving what was already there.

**Why this priority**: everything downstream reads from this layer. It is also where the feature's hardest guarantee lives: once the reference layer exists, the raw sources are never read again, so anything lost here is lost permanently.

**Independent Test**: add three overlapping documents in sequence — a project brief, a set of meeting notes that revises one of its dates, and an architecture diagram. Confirm the reference layer holds one coherent body per category, that the revised date is present (not both dates side by side, and not the stale one), and that no fact present in any source is missing.

**Acceptance Scenarios**:

1. **Given** a project with no documents, **When** the first document is added, **Then** reference content is created for each category it genuinely addresses, and for no other.
2. **Given** a category already holding reference content, **When** a document covering the same ground is added, **Then** the category holds a single integrated version — not the old content with a new block appended.
3. **Given** a document covering three categories, **When** it is ingested, **Then** only those three categories are regenerated; the others are untouched.
4. **Given** any document in the corpus, **When** the reference layer is read, **Then** every fact, figure, date and name from that document is still present somewhere in it.
5. **Given** a document containing a diagram, **When** it is ingested, **Then** what the diagram shows is described in the reference content, not skipped.

---

### User Story 2 - The contributor validates facts once, not prose twice (Priority: P1)

Once a draft of reference content is ready, the contributor reviews it. This is the only review gate in the system: it is where dates, figures, claims and contradictions live. The contributor accepts it, or refuses it — and refusing offers two ways out: discard the draft (the previously validated version stays live), or ask for it to be regenerated with instructions in their own words ("the migration is March, not February", "this is too detailed, the client doesn't need the retry logic", "merge this with what's already under Roadmap").

Once reference content is validated, the client-facing version derives from it and goes live without a second approval queue. The contributor may read it, but is not required to.

**Why this priority**: without it, unreviewed AI output reaches a client. It is also what makes the two-layer design *cheaper* than 014 rather than more expensive — one review of facts instead of a review per document of prose.

**Independent Test**: on a pending draft, request a regeneration with a correction in plain words; confirm the new draft reflects the instruction, that the previously live version was visible to the client throughout, and that accepting it makes the client-facing content follow without further action.

**Acceptance Scenarios**:

1. **Given** a pending reference draft, **When** the contributor accepts it, **Then** it becomes the live reference content and the client-facing content for that category is regenerated from it.
2. **Given** a pending draft, **When** the contributor discards it, **Then** the previously validated reference content and the client-facing content derived from it are both unchanged.
3. **Given** a pending draft, **When** the contributor asks for regeneration with an instruction, **Then** a new draft is produced that visibly reflects that instruction, and it too awaits review.
4. **Given** a category whose draft is pending, **When** a client views that category, **Then** they see the previously validated content — never an empty tab, never unreviewed content.
5. **Given** validated reference content, **When** the client-facing version is produced, **Then** it is derived from the reference content and never from a previous client-facing version.
6. **Given** one document that produced drafts in three categories, **When** the contributor accepts one and leaves the other two pending, **Then** the accepted category goes live on its own and the other two stay pending indefinitely without blocking it.

---

### User Story 3 - The client reads one coherent text per category (Priority: P2)

A client opens their project and sees one tab per category that has content. Each tab holds a single readable body of plain-language text — not a stack of blocks to reconcile. The text is instructive and light: it explains, it does not dump.

**Why this priority**: the client-facing payoff, and it depends on US1 and US2 having produced something validated to derive from.

**Independent Test**: with three documents ingested and validated, open the client view and confirm each category reads as one continuous explanation with no visible seams between documents, and that no source document is identifiable as a separate block.

**Acceptance Scenarios**:

1. **Given** validated reference content in three categories, **When** a client opens the project, **Then** three tabs exist, each holding one continuous text.
2. **Given** a category fed by four different documents, **When** the client reads it, **Then** nothing in the presentation reveals that it came from four sources.
3. **Given** a category with no validated content, **When** the client opens the project, **Then** no tab exists for it.
4. **Given** a client, **When** they read any category, **Then** they have no access to the underlying source documents (out of scope for this iteration — see Out of Scope).

---

### User Story 4 - Removing a document removes its contribution (Priority: P2)

A contributor deletes a document that has already been absorbed. The categories it fed are regenerated from the remaining sources as if it had never been added, and the result goes through the same review gate as an addition.

**Why this priority**: without it, deleting a document is cosmetic — its claims survive inside content nobody can trace or remove, which is worse than not offering deletion at all.

**Independent Test**: add two documents where the second introduces a fact the first does not contain; delete the second; confirm that fact is gone from the regenerated reference content and that the first document's material survives intact.

**Acceptance Scenarios**:

1. **Given** a document absorbed into two categories, **When** it is deleted, **Then** exactly those two categories are regenerated, ignoring it.
2. **Given** a deletion-triggered regeneration, **When** the draft is produced, **Then** it goes through the same accept/discard/regenerate review as any other draft.
3. **Given** the last document feeding a category is deleted, **When** regeneration runs, **Then** that category ends with no content and its tab disappears from the client view.

---

### User Story 5 - The system asks before it guesses (Priority: P3)

Before a reference draft is offered for validation, the system may ask the contributor a small number of questions — to resolve an ambiguity, to arbitrate a contradiction between two documents, or to fill a hole that matters. The contributor answers what they want to answer. Anything left unanswered does not block: it becomes a "point to clarify" marked in the reference content itself.

**Why this priority**: the highest-value slice for quality — silently arbitrating between "launch in March" and "launch in June" is how a client gets told the wrong thing — but the reference layer is useful without it, so it ships last.

**Independent Test**: ingest two documents that state contradictory dates for the same milestone; confirm the system raises it as a question rather than picking one, and that skipping the question yields a draft where the contradiction is explicitly flagged rather than silently resolved.

**Acceptance Scenarios**:

1. **Given** two documents contradicting each other on a fact a client would be told, **When** ingestion runs, **Then** the contradiction is raised as a question rather than arbitrated silently.
2. **Given** a set of questions, **When** they are presented, **Then** there are no more than five, ordered by how much the answer changes what the client will read.
3. **Given** unanswered questions, **When** the contributor validates the draft anyway, **Then** validation succeeds and each unanswered point is explicitly marked in the reference content.
4. **Given** a purely stylistic or completeness-for-its-own-sake ambiguity, **When** ingestion runs, **Then** no question is raised about it.

---

### Edge Cases

- **A document addresses no category at all** (an invoice, a blank scan). It is not absorbed, and the contributor is told so explicitly rather than left with a document that appears ingested but changed nothing.
- **Regeneration does not converge.** A contributor keeps asking for regeneration on the same content. A cap applies (see Assumptions); beyond it, the contributor is told the loop is not converging and is left with accept-or-discard.
- **Two documents are ingested close together.** Both touch the same category. They must not race into two conflicting drafts — regeneration for a category is serialised.
- **The reference content grows unbounded.** As documents accumulate, a category's reference content grows. It is condensed by construction (redundancy is merged, not appended), but there is no hard ceiling in this iteration.
- **A document is deleted while its own ingestion draft is still pending.** The pending draft is abandoned rather than validated into content describing a document that no longer exists.
- **Analysis fails.** The category keeps its previously validated content; the failure is reported against the document that triggered it, not against the category.

## Requirements *(mandatory)*

### Categories

- **FR-001**: The system MUST keep the fixed, product-wide four-category list introduced in 014 (`overview`, `how_it_works`, `planning`, `other`), unchanged and still not user-editable.

### Reference documentation layer

- **FR-002**: The system MUST maintain, per project and per category, at most one body of **reference content**: organised, structured, written in ordinary professional language for the contributor. It MUST NOT be vulgarized.
- **FR-003**: Reference content MUST be **clean in form** — no repetition, no padding, each piece of information stated once — and **exhaustive in substance**: no fact, figure, date, name or decision present in any source document may be absent from it. Where the two pull against each other, exhaustiveness wins.
- **FR-004**: Ingesting a document MUST determine which categories it addresses, and for each, produce a new version of that category's reference content integrating the new material with what is already there. Appending the new material as a separate block is a defect.
- **FR-005**: Categories a document does not address MUST NOT be regenerated.
- **FR-006**: Visual content (diagrams, charts, schemas) MUST be described in the reference content, never skipped.
- **FR-007**: The system MUST NOT invent facts absent from the sources.
- **FR-008**: The system MUST record which documents contributed to each category's reference content.

### Client-facing content

- **FR-009**: The system MUST maintain, per project and per category, at most one body of **client content**: the plain-language version a client reads, derived from that category's validated reference content.
- **FR-010**: Client content MUST always be regenerated from reference content, and MUST NEVER be regenerated from a previous version of itself.
- **FR-011**: Client content MUST be available in each supported language (English, French), with the same substance in both.
- **FR-012**: A client MUST see one tab per category holding validated client content, and no tab for a category holding none.
- **FR-013**: A client MUST read a category as one continuous text, with nothing in the presentation revealing how many documents it came from.

### Review

- **FR-014**: A newly produced body of reference content MUST await explicit contributor validation before it becomes live. This is the **only** review gate; client content derived from validated reference content goes live without a second approval.
- **FR-014a**: Pending drafts MUST be presented as a **queue of independent items, one per category**, not grouped by the document that triggered them. A document touching three categories produces three drafts that are accepted, discarded or regenerated independently of one another, in whatever order and at whatever moment the contributor chooses.
- **FR-015**: Facing a pending draft, a contributor MUST be able to: accept it; discard it; or request regeneration accompanied by free-text instructions.
- **FR-016**: A regeneration request MUST produce a new draft that takes the instructions into account, and that draft MUST itself await validation.
- **FR-017**: While a draft is pending, a client MUST continue to see the content derived from the previously validated version — never an empty category, never unvalidated content.
- **FR-018**: Discarding a draft MUST leave the previously validated reference content and its derived client content untouched.

### Deletion

- **FR-019**: Deleting an absorbed document MUST regenerate the categories it contributed to, as if it had never been added, and the result MUST go through the same review gate.
- **FR-019a**: Validating a category's reference content MUST be the **only** action that makes anything visible to a client. There is no per-document publication step: a document is absorbed or it is not, and what a client reads is category content, never a document.
- **FR-020**: A category left with no contributing document MUST end with no content, and disappear from the client view.

### Questions to the contributor

- **FR-021**: Before offering a draft for validation, the system MAY ask the contributor questions — limited to ambiguities, contradictions between sources, and gaps **that would change what the client is told**.
- **FR-022**: No more than five questions MUST be asked at once, ordered by impact on the client-facing outcome.
- **FR-023**: Questions MUST be skippable. Unanswered questions MUST NOT block validation; each MUST instead be explicitly marked as a point to clarify inside the reference content.

### Leaving nothing behind

- **FR-024**: Everything the previous model required and this one does not MUST be removed, not left dormant — the per-document section storage and its ordering, the move-a-section action end to end (route, request shape, client calls, tests, translation strings), the **per-document publish action** and the resource state that existed to serve it, the multi-block accordion if a category tab no longer stacks blocks, orphaned translation keys, and any dependency no longer used.
- **FR-025**: After this feature ships, no database table, column, route, exported symbol, translation key or test file may remain without a consumer. This is verifiable and MUST be verified, not asserted.

## Key Entities

- **Category**: unchanged from 014. One of four product-owned constants.
- **Reference content**: one per (project, category). Organised, exhaustive, contributor-facing. Carries a **live version** and, when a regeneration is pending, a **draft awaiting validation**. Knows which documents contributed to it.
- **Client content**: one per (project, category), per language. Derived from validated reference content, never from itself. Has no independent review state.
- **Document (resource)**: unchanged in role — the uploaded file or Notion page, its original preserved. It is now purely an *input*: it is absorbed into the reference layer and is never itself a unit of reading.
- **Question**: raised during ingestion against a pending draft, answerable or skippable, ordered by impact.

### Three lifecycles, deliberately separate

The previous model held one status on the document and let it stand for everything. It no longer can. Three things now progress independently and MUST be modelled as such:

| What | Progresses through | Driven by |
|---|---|---|
| A document | received → analysed → absorbed, or failed | ingestion |
| A category's reference content | (no content) → draft pending → live; a live version may return to draft-pending on any regeneration | contributor validation |
| A category's client content | absent → derived and live | validation of the reference content above it |

## Success Criteria *(mandatory)*

- **SC-001**: A category fed by four documents reads as one continuous text — no reader can tell how many documents it came from, and nothing is stated twice.
- **SC-002**: Every fact, figure, date and name present in any source document is present in the reference layer. Verified by picking source facts at random and finding them.
- **SC-003**: After six successive ingestions into the same category, the content is still faithful to the sources — no measurable erosion of detail versus the same corpus ingested in one pass.
- **SC-004**: A contributor validates **once** per ingestion, on facts, not twice on prose. Total review effort is lower than the previous model for the same corpus.
- **SC-005**: A client never sees unvalidated content, and never sees an empty category while a regeneration is pending — 0 occurrences.
- **SC-006**: A contributor can correct a wrong draft in plain words and get a corrected one, without editing text themselves and without deleting and re-uploading the document.
- **SC-007**: Deleting a document removes its claims from what the client reads.
- **SC-008**: A contradiction between two documents on a client-visible fact is surfaced, not silently arbitrated.
- **SC-009**: No dead table, route, symbol, translation key or test file survives the change — verified by an explicit check, not by inspection.

## Assumptions

- **Reference layer language**: single-language. It is the contributor's working document, and the client-facing layer already produces both locales. It follows the project's configured language where set, falling back to the application default. Producing it bilingually would double cost and create two texts to keep in agreement, for a document only its author reads.
- **Regeneration cap**: three regenerations of the same content. Past that, the loop is not converging and more attempts are unlikely to help; the contributor is told so and left with accept-or-discard.
- **The client tab is one text, not an accordion.** With a single coherent body per category, the multi-block accordion introduced in 014 has nothing left to stack. It goes (FR-024). Internal headings within the text remain possible.
- **Regeneration for a category is serialised.** Two documents ingested at once must not produce two conflicting drafts for the same category.
- **Reference content is stored as live data, not as a file**, since it is read on every regeneration and queried per category. A downloadable export would be a rendering of it, and is out of scope.
- **No hard size ceiling** on reference content in this iteration. Redundancy merging keeps it bounded in practice; a real ceiling can be added when a project gets big enough to need one.
- **The contributor cannot edit generated text directly.** They instruct; they do not write. Carried over deliberately from 014.

## Dependencies

- Builds on `specs/011-project-resources` (ingestion of uploads and Notion pages, original file storage) and `specs/014-category-sections` (the fixed category list, the single analysis pass, image normalization).
- Replaces `specs/014-category-sections` for everything concerning how content is stored, reviewed and read.

## Out of Scope

- A downloadable export of the reference documentation, and its format.
- Client access to source documents.
- Manual editing of generated text by the contributor.
- Analysing images embedded in a Notion page.
- Free-form client questions over the documentation (that would be a different system — see the note below).
- Any hard ceiling or archival strategy for reference content growth.

> **On architecture**: this is a write-time content pipeline, not a retrieval system. There is no user query, the categories are known in advance, the corpus is bounded, and generation happens at ingestion rather than at read time. Retrieval-augmented approaches would solve a problem this feature does not have. That changes only if free-form client questions enter scope, or if a project's corpus outgrows what can be processed in one pass.

## Resolved Decisions

Answered by the user on 2026-08-10; binding on implementation.

- **Q1 — wipe everything.** No conversion, no automatic rebuild: resources, sections and every
  trace of the 014 model are dropped and the system starts empty. The environment is
  development-only, so there is nothing to preserve and no migration path worth building. This
  is simpler than 014's own clean slate, which kept resource rows around — here even those go.
- **Q2 — pending drafts are an independent per-category queue.** Not one screen per ingestion.
  A document touching three categories yields three drafts the contributor disposes of one by
  one, in any order, at any time. Accepting one publishes that category on its own; leaving
  another pending indefinitely blocks nothing. This costs more interruptions than a
  per-document screen but keeps each decision scoped to one body of content, which is what the
  contributor is actually judging (FR-014a).
- **Q3 — the per-document publish action is removed.** Validating a category's reference
  content becomes the single act that makes anything client-visible. A document is absorbed or
  it is not; a client reads category content, never a document. The resource state that existed
  only to serve that button goes with it (FR-019a, FR-024).
