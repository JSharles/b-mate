# Feature Specification: Author-Defined Client Sections

**Feature Branch**: `017-documentation-review-journey`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Aucune catégorie n'est définie à l'avance. L'ajout de document / création base canonique et génération du contenu client sont davantage séparés. La création du contenu client se passerait de cette manière : je nomme la catégorie que je veux créer, je donne un ton, des instructions sur ce que le service backend IA doit chercher dans la base documentaire. Elle lève les questions, ambiguïtés, me propose du contenu, je valide ou je corrige, je publie."

## Why This Supersedes the Current Journey

Feature 016 built a working pipeline. Documents accumulate into one canonical source with provenance; that source is projected into four fixed categories; a contributor approves each category; approved content is rewritten for the client under a project-wide tone. Every part of that runs. Two things about it are wrong, and they share a cause.

**The four categories were never chosen for any particular project.** They came from feature 014 and were carried forward unexamined. A contributor whose engagement opens with an audit has nowhere to put it. A maintenance contract and a greenfield build want different headings. The list is fixed in the system, so every project wears the same four regardless of what it is.

**Classification is done at the wrong moment, by the wrong actor.** Today the extraction step must assign categories to every observation it pulls from a document — sixty-one of them on a recent page — on top of extracting them. That is bookkeeping, and it is the load that failed four different ways in a single session. Nothing about reading a document requires deciding which of four headings each sentence belongs under. That decision belongs to the person composing something for a client to read, at the moment they compose it.

This feature separates the two jobs that were tangled together:

- **Accumulating truth.** Documents contribute facts to one canonical source, with their origin, their contradictions surfaced, their duplicates merged. No headings, no categories, no classification. Just what the documents say.
- **Composing something to read.** The contributor creates a section: they name it, choose its tone, and say what the system should look for in the canonical source. The system raises what it cannot resolve, proposes content, and the contributor validates, corrects, and publishes.

The client's documentation stops being a fixed taxonomy the product imposes and becomes a set of sections its author chose.

## Clarifications

### Session 2026-08-12

- Q: When correcting a proposed section, is the contributor correcting a fact or the section's wording? → A: Both, and they are different acts. A factual correction concerns the truth of a statement and must hold everywhere, permanently. A relevance correction concerns whether an item belongs in *this* section, and must persist as part of that section's definition.
- Q: Does a new project start blank, or does the system propose sections? → A: Blank. Do not complicate this.
- Q: When new documents change the canonical source, does a published section recompose itself? → A: No. It marks itself as needing a refresh, and the contributor triggers it.
- Q: Does creating a section start from nothing? → A: No. Offer a few suggested starting points, each prefilling a name and a worked description, plus a free-title option. They are interface copy, not a recorded taxonomy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compose a section and publish it (Priority: P1)

A contributor has added documents and the canonical source holds what they say. They create a section: they give it a name their client will read, choose how it should be written, and describe what the system should look for — *everything about what the client asked for and the constraints we found*. The system reads the canonical source through that description, tells them what it could not resolve, and proposes the section's content. They read it, approve, and publish it.

**Why this priority**: This is the whole feature. Without it there is no way to produce anything for the client at all. With it alone, a contributor can turn a pile of documents into a published section their client can read.

**Independent Test**: On a project with processed documents and no sections, create one section, approve the proposed content, publish, and confirm the client reads it.

**Acceptance Scenarios**:

1. **Given** a project with a populated canonical source and no sections, **When** the contributor opens the composition area, **Then** it explains that no section exists yet and offers to create one.
2. **Given** the contributor is creating a section, **When** the creation opens, **Then** they are offered a few suggested starting points — each with a proposed name and a worked example of what to look for — and the option to write their own title instead.
3. **Given** the contributor picks a suggestion, **When** the creation form opens, **Then** its name and description are prefilled and every field remains editable before and after creation.
4. **Given** the contributor is creating a section, **When** they supply a name, a tone, and a description of what to look for, **Then** the system begins composing and the section appears as being prepared.
5. **Given** the system has finished composing, **When** the contributor opens the section, **Then** they see the proposed content and, separately, any question the system could not resolve from the documents alone.
6. **Given** proposed content the contributor agrees with, **When** they approve and publish, **Then** the client can read that section.
7. **Given** a section's description matches nothing in the canonical source, **When** composition finishes, **Then** the section says so plainly instead of proposing invented or unrelated content.
8. **Given** a project with no documents at all, **When** the contributor tries to create a section, **Then** the system says what is missing rather than composing from nothing.

---

### User Story 2 - Correct a proposal, on facts and on relevance (Priority: P1)

Reading a proposal, the contributor finds two different problems. One statement is untrue — the launch is October, not September. And one statement, while true, has no business in this section — a technical detail in a section meant for a non-technical reader. They correct both from where they are reading. The factual correction becomes part of the canonical source and holds for every section, now and later. The relevance correction becomes part of this section's definition, so the next composition of this section makes the same choice without being told again.

**Why this priority**: Equal to US1. A proposal a contributor cannot correct is a proposal they cannot trust, and the contributor named this as the substance of reviewing. The two corrections have different scopes, and confusing them would either lose factual fixes on the next regeneration or leak one section's editorial choices into every other.

**Independent Test**: On a composed section, correct one statement's truth and reject one statement's presence, then recompose the section and confirm the factual correction survives and the rejected material does not come back.

**Acceptance Scenarios**:

1. **Given** a proposed statement the contributor knows to be false, **When** they correct it, **Then** the correction is recorded against the canonical source, is attributable to them, and is visible as a revision.
2. **Given** a factual correction has been made, **When** any other section that relies on the same statement is composed, **Then** it uses the corrected version.
3. **Given** a proposed statement that is true but does not belong in this section, **When** the contributor removes it as irrelevant, **Then** the reason becomes part of this section's definition.
4. **Given** a relevance correction has been made to one section, **When** another section is composed, **Then** that other section is unaffected.
5. **Given** a section whose definition has been refined by corrections, **When** it is composed again, **Then** it reflects those refinements without the contributor restating them.
6. **Given** the contributor is reviewing, **When** they act on a statement, **Then** it is clear which of the two corrections they are making and what its reach is.

---

### User Story 3 - Keep sections current as documents arrive (Priority: P2)

A contributor adds a document weeks later. The canonical source grows. Sections already published do not change on their own — the client keeps reading what was approved. Instead, the sections whose material may have moved are marked as needing a refresh. The contributor triggers the ones they care about, reviews the new proposal, and publishes.

**Why this priority**: Without it a project's documentation silently goes stale after the second document. It is not needed to prove the model works, so it follows the first two.

**Independent Test**: Publish a section, add a second document, confirm the section is flagged rather than changed, trigger a refresh, and confirm the client reads the old version until the new one is approved.

**Acceptance Scenarios**:

1. **Given** a published section and a newly processed document, **When** processing completes, **Then** the section is marked as possibly needing a refresh and the client continues to read the published version.
2. **Given** a section marked as needing a refresh, **When** the contributor triggers it, **Then** the system composes a new proposal using the section's existing definition, including its accumulated relevance corrections.
3. **Given** a refresh proposal awaiting review, **When** the client opens the project, **Then** they read the previously published version.
4. **Given** a document is removed from the project, **When** removal completes, **Then** sections that drew on it are marked as needing a refresh.
5. **Given** the contributor never triggers a refresh, **When** time passes, **Then** the published section stays exactly as approved and the mark remains visible.

---

### User Story 4 - Manage the set of sections (Priority: P3)

The contributor renames a section whose title did not land, changes the order the client reads them in, revises what a section is meant to cover, and removes one that no longer serves.

**Why this priority**: Necessary for the feature to be livable over a project's life, but nothing is blocked without it on day one.

**Independent Test**: Create three sections, reorder them, rename one, delete one, and confirm the client's view matches.

**Acceptance Scenarios**:

1. **Given** several published sections, **When** the contributor reorders them, **Then** the client reads them in that order.
2. **Given** a published section, **When** the contributor deletes it, **Then** it stops being readable by the client and the remaining sections stay published.
3. **Given** a section, **When** the contributor changes its description of what to look for, **Then** the section is marked as needing a refresh rather than recomposing silently.
4. **Given** a section is being composed, **When** the contributor deletes it, **Then** the composition stops and nothing is left running.

---

### Edge Cases

- Two sections whose descriptions overlap both legitimately want the same fact: it appears in both, since a section is a view of the source rather than an exclusive bucket.
- A factual correction contradicts what a document plainly says: the contradiction is surfaced as a point to clarify rather than silently overwriting the document's contribution.
- Composition raises a question the contributor never answers: the section can still be published, with the unresolved point explicitly marked, as feature 016 already establishes for clarifications.
- A section is published, then every document that fed it is removed: the section is marked as needing a refresh, and its next proposal says it has nothing left to draw on.
- A contributor triggers a refresh while an earlier refresh of the same section is still composing: only one composition per section runs at a time.
- Composition fails: the section says so, keeps its published version readable by the client, and can be retried.
- A section's name duplicates another's: allowed, but the contributor is told, since the client will see two identical tabs.

## Requirements *(mandatory)*

### Functional Requirements

#### Ingestion stops classifying

- **FR-001**: Processing a document MUST record what it says, with its origin, without assigning it to any section or category.
- **FR-002**: The canonical source MUST remain the single accumulating record of what a project's documents say, keeping provenance, merging duplicates, and surfacing contradictions as it does today.
- **FR-003**: The system MUST NOT hold any predefined list of documentation categories.

#### Sections are created by their author

- **FR-004**: Contributors MUST be able to create a section by giving it a name, a tone, and a description of what the system should look for in the canonical source.
- **FR-004a**: Creating a section MUST offer a short list of suggested starting points, each carrying a proposed name and a worked description of what to look for, alongside an option to start from a blank title.
- **FR-004b**: A section created from a suggestion MUST be editable in every respect and MUST be indistinguishable afterwards from one created blank; the suggestions MUST NOT constitute a taxonomy the system records, enforces, or reasons about.
- **FR-005**: A project MUST start with no sections, and the composition area MUST say so plainly and offer to create the first.
- **FR-006**: Contributors MUST be able to rename a section, change its tone, revise its description, reorder it among the others, and delete it.
- **FR-007**: A section's name MUST be what the client reads as its heading.
- **FR-008**: Contributors MUST NOT be able to write a section's content by hand; they describe, correct, and approve.

#### Composition

- **FR-009**: Composing a section MUST draw only on the project's canonical source, never on a document directly and never on a previous composition of that section.
- **FR-010**: Composition MUST surface the questions and ambiguities it could not resolve, separately from the content it proposes.
- **FR-011**: Composition MUST state plainly when the canonical source holds nothing matching the section's description, rather than proposing unrelated or invented content.
- **FR-012**: A section's proposed content MUST be approved by the contributor before the client can read it.
- **FR-013**: Only one composition per section MUST run at a time.

#### Corrections

- **FR-014**: Contributors MUST be able to correct the truth of a statement from where they review a proposal; the correction MUST be recorded against the canonical source, MUST be attributable, and MUST apply to every section that draws on that statement.
- **FR-015**: Contributors MUST be able to reject a statement as not belonging in the section they are reviewing; the rejection MUST become part of that section's definition and MUST NOT affect any other section.
- **FR-016**: A section composed again MUST honour the relevance corrections accumulated against it, without the contributor restating them.
- **FR-017**: The interface MUST make clear which of the two corrections is being made and how far it reaches.

#### Staying current

- **FR-018**: A change to the canonical source MUST NOT alter a published section; it MUST mark the sections it may affect as needing a refresh.
- **FR-019**: Contributors MUST be able to trigger a refresh of a marked section, and MUST be able to leave it marked indefinitely.
- **FR-020**: Revising a section's description or tone MUST mark it as needing a refresh rather than recomposing it silently.
- **FR-021**: While a refresh awaits approval, the client MUST continue to read the last approved version of that section.

#### Publication

- **FR-022**: The client MUST read a complete set of approved sections at all times, never a mixture of approved and unapproved content.
- **FR-023**: A section with no published content MUST be absent from the client's view rather than shown empty.

#### Leaving nothing behind

- **FR-024**: The fixed category list and everything that exists only to serve it — stored classification, per-category projection state, per-category prompts, translated category names, screens and actions specific to the old four-step journey — MUST be removed as part of this change, and the change MUST include a verification that none survives without a consumer.

### Key Entities

- **Canonical source**: The project's accumulating record of what its documents say. Holds statements with their origins, their contradictions, and their explicitly open points. Knows nothing about sections.
- **Section**: A heading the contributor created for their client, holding a name, a tone, a description of what to look for, and the relevance corrections accumulated against it. Owned and ordered by the contributor.
- **Proposal**: What composition produced for a section, awaiting the contributor's approval. Carries the questions composition could not resolve.
- **Factual correction**: A contributor's revision of a statement's truth. Attributable, permanent, and effective across every section.
- **Relevance correction**: A contributor's judgement that a statement does not belong in one particular section. Part of that section's definition, and confined to it.
- **Published set**: The complete collection of approved section content the client can currently read. Replaced whole, never in part.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor can turn a project with processed documents and no sections into a published section their client can read, without being told what headings to use.
- **SC-002**: Two projects of different kinds can carry entirely different sets of sections, with no shared taxonomy between them.
- **SC-003**: A factual correction made while reviewing one section is reflected in every other section that relies on the same statement, without the contributor repeating it.
- **SC-004**: A statement rejected as irrelevant to one section does not reappear in that section on any later composition, and does not disappear from any other.
- **SC-005**: Adding a document to a project with published sections changes nothing the client reads until the contributor approves a refresh.
- **SC-006**: A contributor can state, without assistance, the difference between correcting a fact and rejecting a statement as irrelevant.
- **SC-007**: Processing a document no longer requires the system to decide which heading its content belongs under, at any point.
- **SC-008**: The client never reads a set mixing approved and unapproved content, at any moment during a refresh.

## Assumptions

- The ingestion pipeline delivered by feature 016 — canonical source, provenance, duplicate merging, contradiction surfacing, clarifications, atomic publication — is kept. What is removed from it is category assignment, not its substance.
- Tone becomes a property of a section, since the contributor names it as part of creating one. A project-level tone is no longer meaningful when each section can want its own register.
- Section order is chosen by the contributor. There is no natural order once the list is not fixed.
- Existing projects carry their four categories forward as four ordinary sections, with their current names, so nothing published to a client disappears at migration. They become editable and deletable like any other.
- A section is a view of the canonical source, not an exclusive bucket. The same statement may legitimately serve two sections.
- The client's tabbed presentation is kept; its tabs become the contributor's published sections in their chosen order.
- Composition cost grows with the number of sections a contributor creates. No limit is imposed, and none is assumed necessary at this stage.

## Out of Scope

- Specialised presentation per section, such as a schedule shown as a dated timeline. The contributor raised it and it remains wanted; it depends on the system recording usable dates, which is its own change. Sections are prose for now.
- The quality of extraction from images. A recent architecture diagram produced twelve disconnected sentences where a person would write a paragraph. Real, and separate.
- Free-form manual editing of section text by the contributor.
- A downloadable export of the documentation.
- Any change to how the client's "current task" is produced or presented.
- Proposing sections *based on what a project's documents actually contain*. Still declined: a new project starts blank, and the suggestions offered at creation (FR-004a) are a fixed list of starting points written into the interface, not an inspection of the corpus.
