# Feature Specification: Reading the Canonical Source

**Feature Branch**: `018-canonical-source-reading`

**Created**: 2026-08-13

**Status**: Draft — awaiting sign-off

**Input**: Contributor feedback after using the sections journey on a real project: "l'UI/UX de l'affichage des informations retenues par Diaphane les unes au-dessus des autres n'est pas viable d'un point de vue expérience et cognitif. C'est décourageant et ça demande à l'utilisateur de scroller longuement… moi je demande juste la création d'une documentation fiable et structurée à partir des documents originaux. Les points à clarifier sont là pour combler les trous et lever les ambiguïtés."

## The Measurement That Settles It

Taken from the live project on 2026-08-13, after two documents:

| | |
|---|---:|
| Information items shown on step 1 | **100** |
| Of those, needing any action | **2** |
| Documents that produced them | 2 |
| Height of the rendered list | **≈13 000 px** |

Ninety-eight percent of the scroll asks nothing of the contributor. The volume grows by roughly fifty items per document, so a project with ten documents shows five hundred.

The cause is not the number of statements. It is that each one is rendered as a card carrying a kind label, its text, a provenance button, a correction button and a separator — six elements to present one sentence. The same hundred sentences set as continuous grouped text occupy under three screens.

**The deeper fault**: step 1 displays the shape of the database. One `InformationItem` becomes one row. That atom is load-bearing internally — provenance attaches to it, corrections target it, composition selects it — but it was never meant to be the visual unit. A contributor asked for reliable, structured documentation and was shown a table dump.

## What This Feature Changes

The canonical source stops being a wall on the working page and becomes something a contributor consults deliberately.

- **Step 1 becomes a state, not a list.** What was accumulated, from how many documents, what changed last, and what still needs an answer.
- **The full canonical source moves to its own screen**, read as continuous grouped text rather than one card per sentence, with search.
- **The system asks its questions in the contributor's language.** Today it asks a French-speaking developer, in a French interface, *"Is the product's official name 'Client Portal' or 'Diaphane'?"*

Nothing about what the canonical source *is* changes: the same statements, the same provenance, the same merging, the same corrections. This feature is about reading it.

## Clarifications

### Session 2026-08-13

- Q: Full canonical source on a dedicated screen, or in a side panel? → A: A dedicated screen, structured and organised by theme — themes not necessarily the client-facing sections.
- Q: Where does the system learn which language to write its questions in? → A: The interface locale, as everywhere else. No new setting for the contributor to fill.
- Q: Group by the label each statement already carries, or have a model group by subject? → A: Whichever is most reliable — the requirement is a reliable, structured document, not a particular mechanism. Clarifications exist to fill the gaps and remove ambiguity.
- Q: Is a card-per-statement validation surface wanted? → A: Raised in an earlier session and declined again here: the contributor approves a composed section, never a hundred statements one by one. Grouping and stripping the per-statement chrome is what makes the volume readable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Work without wading (Priority: P1)

A contributor opens their documentation page. Instead of a hundred statements, they see what the source holds in a sentence, the two points that need an answer, and a way in if they want to read everything. They answer the two points and move on to their sections.

**Why this priority**: this is the whole complaint. Without it the working page is unusable past the second document.

**Independent Test**: on a project with a hundred statements and two open points, confirm the working page shows the two points and no statement list, and that the page fits within three screens.

**Acceptance Scenarios**:

1. **Given** a project whose canonical source holds statements, **When** the contributor opens the documentation page, **Then** step 1 states how many statements were kept, from how many documents, and when the source last changed — without listing them.
2. **Given** open points to clarify, **When** the page renders, **Then** they appear on the working page, most consequential first.
3. **Given** more open points than fit comfortably, **When** the page renders, **Then** the most consequential are shown and the rest are reachable without leaving the page.
4. **Given** no document has been added yet, **When** the page renders, **Then** step 1 says so and offers to add one, rather than showing an empty state that looks like a failure.
5. **Given** the source summary fails to load, **When** the page renders, **Then** it says so, rather than reporting an empty source.

---

### User Story 2 - Read the whole source when it matters (Priority: P1)

The contributor wants to check what the system actually understood. They open the canonical source on its own screen and read it as a structured document: statements set continuously, grouped, each traceable to its origin on demand.

**Why this priority**: this is the product's central promise made checkable. Removing the list from the working page without giving it a proper home would remove the proof entirely.

**Independent Test**: open the canonical source screen on a project with a hundred statements, confirm it reads as grouped continuous text, find a specific statement by searching, and open its provenance.

**Acceptance Scenarios**:

1. **Given** a canonical source with statements, **When** the contributor opens its screen, **Then** the statements are set as continuous text within groups, not as one card each.
2. **Given** the statements are grouped, **When** the contributor reads, **Then** each group is named and carries its count.
3. **Given** a statement the contributor wants to trace, **When** they act on it, **Then** its origin — which document, which excerpt — is shown without leaving the screen.
4. **Given** a statement the contributor knows to be wrong, **When** they act on it, **Then** they can correct it exactly as they can today.
5. **Given** a large source, **When** the contributor searches for a word, **Then** only the statements containing it remain.
6. **Given** a statement marked as needing clarification, **When** the source is read, **Then** it is visibly distinguished from a confirmed one.
7. **Given** the grouping cannot be determined, **When** the screen renders, **Then** it falls back to a single ungrouped reading rather than failing.

---

### User Story 3 - Be asked in your own language (Priority: P2)

The system finds a contradiction between two documents and asks about it. The contributor reads the question in the language they are using the product in.

**Why this priority**: a question nobody reads comfortably is a question that does not get answered. It is not blocking, which is why it follows the two above.

**Acceptance Scenarios**:

1. **Given** a contributor working in French, **When** the system raises a point to clarify, **Then** its question and its explanation are written in French.
2. **Given** a contributor working in English, **When** the system raises a point to clarify, **Then** they are written in English.
3. **Given** points raised before this feature, **When** they are displayed, **Then** they are shown as they were recorded rather than left blank or machine-translated on the fly.
4. **Given** the contributor's language is not known, **When** the system raises a point, **Then** it falls back to English rather than failing to raise it.

---

### Edge Cases

- A source with a handful of statements: grouping adds nothing, and the screen should not impose group headings on five lines.
- A group holding almost everything: expected, and not a defect — the grouping serves reading, not balance.
- A statement belonging to two groups: it appears once, in the more specific one; nothing depends on the choice.
- Search matching nothing: says so, and offers to clear the search rather than looking like an empty source.
- A contributor switching interface language mid-project: questions already raised keep their original wording; new ones follow the new language.

## Requirements *(mandatory)*

### The working page

- **FR-001**: Step 1 MUST NOT list the canonical source's statements.
- **FR-002**: Step 1 MUST state how many statements the source holds, how many documents produced them, and when it last changed.
- **FR-003**: Points to clarify MUST remain on the working page, ordered by consequence, with the less consequential reachable without leaving it.
- **FR-004**: Step 1 MUST offer a way to the full canonical source.
- **FR-005**: A failure to load the summary MUST be reported as a failure, never rendered as an empty or absent source.

### The canonical source screen

- **FR-006**: The canonical source MUST be reachable at its own address, so it can be linked and returned to.
- **FR-007**: Statements MUST be set as continuous text within their group, not as one card per statement.
- **FR-008**: Provenance and correction MUST NOT occupy layout at rest; they MUST be reachable per statement on demand.
- **FR-009**: Statements MUST be grouped, each group named and counted.
- **FR-010**: The grouping MUST be derived for reading only. Nothing else — composition, publication, correction, exclusion — may depend on it, and a statement's group MUST NOT be stored as part of what the source says.
- **FR-011**: When grouping cannot be determined, the screen MUST fall back to an ungrouped reading.
- **FR-012**: The screen MUST offer a text search across statements.
- **FR-013**: A statement needing clarification MUST be visibly distinguished from a confirmed one.
- **FR-014**: Correcting a statement MUST keep working exactly as it does today, including its attribution and its revision.
- **FR-015**: No statement's wording may be rewritten for display. What is shown is what was extracted.

### Language

- **FR-016**: A point to clarify MUST be written in the language the contributor is using the product in.
- **FR-017**: The contributor MUST NOT have to set that language: it follows the interface, like everything else.
- **FR-018**: The language MUST be resolvable when the system works in the background, with no browser present.
- **FR-019**: A point raised before this feature MUST keep its recorded wording.
- **FR-020**: An unknown language MUST fall back to English rather than block a point from being raised.

### Key Entities

- **Canonical source summary**: what the source holds, in counts and dates. Derived, never stored.
- **Reading group**: a named set of statements, produced for display and recomputed when the source changes. Carries no authority.
- **Contributor language**: the locale a contributor last used the product in, remembered so background work can address them in it.

## Success Criteria *(mandatory)*

- **SC-001**: The documentation working page fits within three screens on a project holding a hundred statements.
- **SC-002**: A contributor can find a specific statement in a hundred without scrolling the whole source.
- **SC-003**: A contributor reads every question the system asks them in their own language.
- **SC-004**: Nothing a contributor or a client reads changes as a result of this feature, apart from the two above.
- **SC-005**: A contributor can still trace any statement to its document and correct it, in no more steps than today.

## Assumptions

- The canonical source's data model is unchanged. `InformationItem` stays the unit of provenance, correction and composition; only its presentation changes.
- The grouping mechanism is deliberately left open — the requirement is a reliable, structured reading, and FR-010/FR-011 are what make a wrong grouping harmless. The cheapest mechanism that satisfies them is preferred; the kind already recorded on every statement (fact, decision, constraint, open point) is a candidate that costs nothing and cannot be wrong, and it produced four groups on the measured project.
- Points to clarify are already ranked by impact; this feature uses that ranking rather than inventing one.
- Statements stay in English, as the canonical source has been since 2026-08-12. Only the questions addressed to the contributor follow the interface language.

## Out of Scope

- Rewriting statements into prose. That is composition, and it is what sections already do — doing it twice would put a second writing layer between the documents and the truth.
- Validating statements one by one. The contributor approves a composed section; the canonical source accumulates and is corrected, never approved item by item.
- Translating the canonical statements themselves.
- Any change to how sections are composed, approved or published.
- Retranslating points raised before this feature.
