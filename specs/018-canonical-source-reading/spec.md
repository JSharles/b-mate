# Feature Specification: The Reference Document

**Feature Branch**: `018-canonical-source-reading`

**Created**: 2026-08-13

**Status**: Draft — awaiting sign-off

**Input**: "Pour le développeur, après avoir ajouté des documents, les infos utiles sont extraites, pour créer un nouveau document structuré qui servira de référence documentaire. Les ambiguïtés, contradictions ou manques seront levés en points à clarifier." — plus, on review: "le service de traitement devra reconnaître un document qui n'a rien à voir avec le projet (en cas d'erreur d'upload) et lever le point au développeur. Le nouveau document de référence est consultable et téléchargeable."

## What This Is

A developer adds documents. The system pulls out what matters and writes **one structured document** from it. That document is the developer's reference — the thing they read to know what the project is.

Anything unclear, contradictory or missing does not go into it. It becomes a point to clarify.

## Why

Today that step shows a list: one row per extracted statement. On the live project, two documents produced a hundred rows, of which two needed an answer. It is thirteen thousand pixels of scrolling and it reads like a database dump, not like documentation.

A list of a hundred statements is not a reference. A document is.

## User Scenarios *(mandatory)*

### User Story 1 - Read one document instead of a hundred rows (P1)

The developer adds two documents. The system writes a reference document from them: titled sections, continuous text, ordered so it can be read top to bottom. They read it and know where the project stands.

**Acceptance Scenarios**:

1. **Given** documents have been processed, **When** the developer opens the documentation page, **Then** they see a written reference document, not a list of statements.
2. **Given** the reference document, **When** they read it, **Then** it has named parts and continuous text under each.
3. **Given** a sentence in it, **When** they act on that sentence, **Then** they see which document it came from.
4. **Given** a sentence they know to be wrong, **When** they act on it, **Then** they can correct it, and the correction holds everywhere.
5. **Given** no document has been added, **When** they open the page, **Then** it says so and offers to add one.

---

### User Story 2 - Everything uncertain is a question, never a sentence (P1)

Two documents disagree on the launch date. The reference document does not pick one and does not average them. The disagreement becomes a point to clarify, and the developer answers it.

**Acceptance Scenarios**:

1. **Given** two documents contradict each other, **When** the reference document is written, **Then** the contradiction is a point to clarify, not a sentence in the document.
2. **Given** something is implied but never stated, **When** the reference document is written, **Then** it is a point to clarify, not filled in.
3. **Given** a point to clarify, **When** the developer answers it, **Then** the answer enters the reference document.
4. **Given** a point the developer leaves open, **When** the reference document is read, **Then** the gap is marked in place rather than hidden.
5. **Given** points to clarify exist, **When** the page is opened, **Then** they are shown with the document, most consequential first.

---

### User Story 3 - A document that does not belong is caught, not absorbed (P1)

The developer uploads the wrong file — a contract for another client. The system notices it has nothing to do with this project, holds it, and asks. The developer removes it. Nothing it said ever reached the reference document.

**Acceptance Scenarios**:

1. **Given** a project that already holds documents, **When** a document unrelated to them is added, **Then** the system raises it as a point to clarify instead of incorporating it.
2. **Given** such a document is waiting, **When** the reference document is read, **Then** it contains nothing from that document.
3. **Given** the developer confirms it does belong, **When** they answer, **Then** it is incorporated normally and is not asked about again.
4. **Given** the developer confirms it does not belong, **When** they answer, **Then** it is removed and nothing it said is kept.
5. **Given** it is the project's first document, **When** it is added, **Then** it is incorporated without this check — there is nothing yet to compare it against, and the system says nothing rather than guessing.
6. **Given** a document on a genuinely new subject for the project, **When** it is added, **Then** being new is not by itself treated as being unrelated.

---

### User Story 4 - Take the document away with you (P2)

The developer wants the reference document outside the app — to send it, to keep it, to read it on paper. They download it.

**Acceptance Scenarios**:

1. **Given** a reference document, **When** the developer downloads it, **Then** they get a file holding its full text and its parts.
2. **Given** something the documents never settled, **When** the document is downloaded, **Then** the gap is marked where it applies — "launch date: not confirmed" — so the file cannot be read as if everything were settled.
3. **Given** questions the system is asking the developer, **When** the document is downloaded, **Then** they are absent. They are addressed to the developer; they are not content.
4. **Given** a document still being written, **When** the developer looks for the download, **Then** it is unavailable rather than producing a half-written file.

---

### User Story 5 - Written in the developer's language (P2)

The developer works in French. Every question the system asks them is in French.

**Acceptance Scenarios**:

1. **Given** a developer using the product in French, **When** the system raises a point to clarify, **Then** the question is in French.
2. **Given** a developer using it in English, **Then** the question is in English.
3. **Given** the language is unknown, **Then** it falls back to English rather than blocking the question.

---

### Edge Cases

- Answering the last point in the set: the set closes and says so, rather than leaving an empty card.

- One short document: the reference document is short. It does not pad.
- Documents that say almost nothing usable: the document says so plainly rather than being written out of nothing.
- A document removed later: the reference document is rewritten without it, and says it needs rewriting until the developer triggers it.
- Nothing but contradictions: the reference document is nearly empty and the points to clarify carry everything. That is the correct outcome, not a failure.

## Requirements *(mandatory)*

### The document

- **FR-001**: The system MUST produce one reference document per project, written from what its documents say.
- **FR-002**: It MUST have named parts and continuous text, readable top to bottom.
- **FR-003**: It MUST contain nothing that its documents do not support. No inference, no filling gaps, no smoothing over.
- **FR-004**: Every sentence MUST be traceable to the document it came from, on demand.
- **FR-005**: A developer MUST be able to correct any sentence, attributably, and the correction MUST hold for everything built afterwards.
- **FR-006**: It MUST be rewritten when the documents change, and MUST say it needs rewriting rather than rewriting itself.
- **FR-007**: When the documents hold nothing usable, it MUST say so rather than be written from nothing.

### Where each thing lives

- **FR-026**: The reference document MUST have its own screen, reachable at its own address. It is read, not passed through.
- **FR-027**: The documentation working page MUST NOT render the reference document. It carries what the source holds in a sentence, the points to clarify, a way to the document, and the sections.

### Answering the points

- **FR-028**: Points to clarify MUST be presented one at a time when there are three or more, so a developer faces one decision rather than a wall.
- **FR-029**: The developer MUST see where they are in the set — which point, out of how many.
- **FR-030**: The developer MUST be able to move past a point without answering it, and come back to it.
- **FR-031**: Below three points, they MUST be shown plainly, without the one-at-a-time treatment. A carousel over two questions is ceremony.

### Points to clarify

- **FR-008**: Anything ambiguous, contradictory or missing MUST become a point to clarify instead of a sentence in the document.
- **FR-009**: Points to clarify MUST be shown with the document, ordered by consequence.
- **FR-010**: Answering a point MUST feed the answer into the reference document.
- **FR-011**: A point left open MUST be marked in the document where it applies, never hidden.

### Documents that do not belong

- **FR-012**: Processing MUST detect a document unrelated to what the project already holds, and MUST raise it as a point to clarify rather than incorporating it.
- **FR-013**: A document waiting on that answer MUST contribute nothing to the reference document.
- **FR-014**: The developer MUST be able to answer that it does belong, after which it is incorporated and not raised again.
- **FR-015**: The developer MUST be able to answer that it does not, after which it is removed.
- **FR-016**: The first document of a project MUST NOT be subject to this check. There is nothing to compare it against, and a guess here is worse than silence.
- **FR-017**: Covering a subject the project has not seen before MUST NOT on its own count as unrelated.

### Downloading

- **FR-018**: The reference document MUST be downloadable, carrying its full text and its parts.
- **FR-019**: A gap the documents never settled MUST appear in the downloaded file, marked where it applies. A file that reads as if everything were settled is the failure this product exists to prevent.
- **FR-020**: The questions the system asks the developer MUST NOT appear in the downloaded file. They are addressed to a person, not part of what the project is.
- **FR-021**: The download MUST be unavailable while the document is being written, rather than producing a partial file.

### Language

- **FR-022**: Points to clarify MUST be written in the language the developer is using the product in.
- **FR-023**: The developer MUST NOT have to set that language.
- **FR-024**: It MUST be resolvable when the system works in the background.
- **FR-025**: An unknown language MUST fall back to English.

## Success Criteria *(mandatory)*

- **SC-001**: A developer reads their reference document top to bottom without scrolling past anything that asks nothing of them.
- **SC-002**: Every sentence in it traces to a document.
- **SC-003**: Nothing uncertain appears as a statement of fact.
- **SC-004**: A developer reads every question the system asks them in their own language.
- **SC-005**: Correcting a sentence takes no more steps than today.
- **SC-006**: A document uploaded by mistake never contributes a sentence to the reference document.
- **SC-007**: A developer can leave with the reference document as a file, and it says the same thing the screen does.

## Assumptions

- What the system already extracts and merges stays as it is. This feature changes what the developer reads, not what is stored underneath: provenance, duplicate merging and attributable correction all keep working as built.
- The reference document is for the developer. What the client reads is still the sections they compose, unchanged by this feature.
- Writing it is one operation per project, run when the documents change — not one per statement.
- Whether a document belongs is judged against what the project already holds. That makes the first document unjudgeable, which is why FR-016 exempts it rather than pretending otherwise.
- One point to clarify carries one decision — answer it, or leave it open — and a written answer needs room. That is what makes presenting them one at a time worth the mechanism here, and what makes it wrong for the extracted statements, which carry no decision at all.
- Downloading is served first by a page laid out for paper plus a print action, so the browser produces the file. A server-generated PDF is the same requirement met more expensively, and is only worth it once something needs to send the file without a person present.

## Out of Scope

- Any change to the sections a client reads.
- Translating the reference document. It is written in one language; only the questions follow the developer's.
- Validating the document sentence by sentence. The developer corrects what is wrong and answers what is open; they do not approve it line by line.
- Judging a document's quality, or refusing a badly written one. The only judgement here is whether it concerns this project.
