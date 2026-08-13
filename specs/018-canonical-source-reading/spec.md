# Feature Specification: The Reference Document

**Feature Branch**: `018-canonical-source-reading`

**Created**: 2026-08-13 · **Rewritten**: 2026-08-13, on a simpler method

**Status**: Draft — awaiting sign-off

**Input**: "Le développeur fournit des documents plus ou moins précis et structurés, je souhaite les structurer, les nettoyer, combler les trous et incertitudes pour créer un document de référence. Soyons efficaces et faisons simple."

## The need

Uneven documents go in. One clean reference document comes out. What is missing or contradictory becomes a question.

## The method

**One call, replayed.**

1. The developer's **documents and notes** go to the model in one request. It returns the reference document **and** the points it could not settle.
2. The developer answers a point. The answer becomes a **note**.
3. They ask again. Same documents, one more note, a better document.

Every write starts from the original documents, never from the previous document. Nothing drifts.

## The one idea worth naming

**An answer and a correction are the same thing: a note.**

"The launch is in October, not September" and "yes, the AI layer is out of the MVP" are both a sentence the developer adds, and both are replayed on every write. One mechanism, not two.

Notes are stored because the document is rewritten from scratch each time, and a note is the only part that is not in the documents. Without them, adding a document next week would bring back every question already answered.

## What replaces what

Extraction, consolidation, per-sentence facts, revisions, provenance links, clarifications and contributor assertions are removed. They bought per-sentence provenance and incremental merging, at the price of four chained model calls and twelve tables, for a scale this product does not have.

Sections written for the client now draw on the **reference document** rather than on the removed fact base. One chain: documents → reference document → sections.

## User Scenarios *(mandatory)*

### User Story 1 - Get a reference document from what I have (P1)

The developer has uploaded two documents of uneven quality. They ask for the reference document. They get one structured text, and a short list of what could not be settled.

**Acceptance Scenarios**:

1. **Given** documents have been added, **When** the developer asks for the reference document, **Then** one structured text is produced from them.
2. **Given** the reference document, **When** they read it, **Then** it has named parts and continuous prose under each.
3. **Given** a part, **When** they look at it, **Then** they see which documents it draws on.
4. **Given** the documents hold nothing usable, **When** the document is written, **Then** it says so rather than being written from nothing.
5. **Given** no document has been added, **When** they open the page, **Then** it says so and offers to add one.

---

### User Story 2 - Answer what could not be settled (P1)

Two documents disagree on the launch date. The document does not pick one. The disagreement comes back as a question. The developer answers it, asks again, and the answer is in the document.

**Acceptance Scenarios**:

1. **Given** two documents contradict each other, **When** the document is written, **Then** the contradiction is a question, not a sentence presented as settled.
2. **Given** something implied but never stated, **When** the document is written, **Then** it is a question, not filled in.
3. **Given** the developer answers a question, **When** they ask for a rewrite, **Then** the answer is used and the question is not asked again.
4. **Given** an unanswered question, **When** the document is written, **Then** the gap is marked in place rather than hidden.
5. **Given** answers given weeks ago, **When** a new document is added and the document rewritten, **Then** those answers still apply without being restated.

---

### User Story 3 - Correct what is wrong (P1)

The developer reads a sentence they know to be false. They say so. The next write reflects it.

**Acceptance Scenarios**:

1. **Given** a statement the developer knows to be wrong, **When** they record the correction, **Then** it is kept as a note, attributable to them.
2. **Given** a correction, **When** the document is rewritten, **Then** it is honoured without being restated.
3. **Given** a correction contradicting what a document plainly says, **When** the document is written, **Then** the correction wins and the discrepancy is raised as a point rather than silently dropped.
4. **Given** a note the developer no longer wants, **When** they remove it, **Then** the next write ignores it.

---

### User Story 4 - A document that does not belong is caught (P2)

The developer uploads the wrong file. The write says so instead of absorbing it.

**Acceptance Scenarios**:

1. **Given** a document unrelated to the others, **When** the document is written, **Then** it is raised as a point rather than woven in.
2. **Given** the project's only document, **When** it is written from, **Then** nothing is judged unrelated — there is nothing to compare it against.
3. **Given** a document on a subject new to the project, **When** it is written from, **Then** being new is not treated as being unrelated.

---

### User Story 5 - Take it with you (P2)

The developer downloads the reference document to send or keep.

**Acceptance Scenarios**:

1. **Given** a reference document, **When** they download it, **Then** they get a file holding its full text and its parts.
2. **Given** unanswered points, **When** it is downloaded, **Then** the gaps are marked in place; the questions themselves are not in the file.
3. **Given** a write in progress, **When** they look for the download, **Then** it is unavailable rather than partial.

---

### Edge Cases

- One short document: a short reference document. It does not pad.
- Every point answered and the document still thin: that is the documents' fault, and it says what it has rather than inventing.
- A note contradicting another note: raised as a point, not silently resolved by order.
- A document removed: the next write is made without it, and the document says it is owed a rewrite.

## Requirements *(mandatory)*

### Writing

- **FR-001**: One reference document per project, written in a single request from the project's documents and notes.
- **FR-002**: It MUST have named parts and continuous prose, readable top to bottom.
- **FR-003**: It MUST contain nothing the documents and notes support. No inference, no filling a gap, no smoothing a contradiction.
- **FR-004**: Each part MUST say which documents it draws on.
- **FR-005**: Every write MUST start from the documents and notes, never from a previous reference document.
- **FR-006**: It MUST say it is owed a rewrite when documents or notes change, and MUST NOT rewrite itself.
- **FR-007**: When the documents hold nothing usable, it MUST say so.
- **FR-008**: Only one write per project MUST run at a time.

### Points and notes

- **FR-009**: Anything ambiguous, contradictory or missing MUST be returned as a point, never written as settled prose.
- **FR-010**: Points MUST be returned by the same request that writes the document, not by a separate stage.
- **FR-011**: Answering a point MUST record a note.
- **FR-012**: Correcting a statement MUST record a note. An answer and a correction are the same kind of thing.
- **FR-013**: A note MUST be attributable and removable.
- **FR-014**: Every note MUST be replayed on every write, without the developer restating it.
- **FR-015**: A note MUST take precedence over what a document says, and the discrepancy MUST be raised as a point rather than dropped.
- **FR-016**: A point left unanswered MUST be marked in the document where it applies.

### Documents that do not belong

- **FR-017**: A document unrelated to the others MUST be raised as a point rather than woven in.
- **FR-018**: A project's only document MUST NOT be judged unrelated.
- **FR-019**: Covering a new subject MUST NOT on its own count as unrelated.

### Language

- **FR-020**: The reference document and its points MUST be written in the language the developer uses the product in.
- **FR-021**: The developer MUST NOT have to set that language.
- **FR-022**: It MUST be resolvable when the system works in the background, and MUST fall back to English when unknown.

### Downloading

- **FR-023**: The reference document MUST be downloadable, with its gaps marked and its questions absent.
- **FR-024**: The download MUST be unavailable while a write is running.

### Leaving nothing behind

- **FR-025**: Extraction, consolidation, per-sentence facts, revisions, provenance links, clarifications and contributor assertions MUST be removed — their models, stages, routes, screens, strings and tests — and the change MUST verify none survives without a consumer.

### Key Entities

- **Document**: a file or Notion page the developer added. Unchanged.
- **Note**: one sentence the developer added — an answer or a correction. Attributable, removable, replayed on every write.
- **Reference document**: the last text written. Carries its parts and the points still open.

## Success Criteria *(mandatory)*

- **SC-001**: A developer turns uneven documents into one readable reference document in a single action.
- **SC-002**: A question answered once is never asked again.
- **SC-003**: Nothing uncertain appears as a statement of fact.
- **SC-004**: Adding a document keeps every earlier answer and correction in force.
- **SC-005**: Writing the document takes one model call, not four.

## Assumptions

- The documents fit in one request. Measured on the live project: two documents ≈ 20 000 words, comfortable in a single call with room for roughly ten times that.
- Every write reads all documents. At this product's scale — a freelancer's project, a handful of documents — that costs less than the machinery it replaces. Past a few hundred documents it would stop being true, and nothing here pretends otherwise.
- Provenance becomes coarse: a part says which documents it draws on, not which page. That is the one real loss, and it stays honest.

## Out of Scope

- Per-sentence provenance.
- Editing the reference document by hand. The developer adds notes and asks again.
- Any change to how a client reads their sections, beyond what those sections are written from.
