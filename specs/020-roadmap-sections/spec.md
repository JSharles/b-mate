# Feature Specification: The Roadmap Section

**Feature Branch**: `feat/roadmap-timeline`

**Created**: 2026-08-13

**Status**: Draft — awaiting sign-off

**Input**: "Pour cette rubrique, j'aimerais un contenu plus visuel. Le choix de rubrique de type roadmap devra différer des autres en terme de réglage. Si le développeur choisit cette rubrique, alors les réglages ne sont plus éditables. Le service regarde si des infos de roadmap existent dans la doc, il propose les nodes, propose de la correction et de l'édition. Côté client on reçoit un tableau ou un objet qui permettra de construire la timeline."

## The need

A roadmap written as prose is a bad roadmap. Order, dates and where the project stands are spatial facts, and a paragraph hides all three. The client asking "where are we?" should get the answer from the shape of the thing, before reading a word.

## The idea worth naming

**A roadmap section has nothing to configure.**

Every other section is defined by two authored fields — a brief saying what it should cover, and four editorial dimensions saying in what register. A roadmap has neither. Its brief is fixed ("what the documents say about sequence"), and a milestone date has no tone: length, pedagogy, technical familiarity and tone govern prose, and there is no prose to govern.

So choosing *roadmap* does not add controls, it removes them. The dialog collapses to a name. That is the whole difference the developer feels, and it needs no sentence to explain it.

## What it is not

Not a Gantt chart, not dependencies, not a planning tool, and not a second place to manage tasks. `docs/PRODUCT.md` keeps those out of scope and this does not bring them back. A roadmap section is a **reading of what the project's documents already say** about sequence — the same act as any other section, rendered as a timeline instead of paragraphs.

## Where it differs from a prose section

| | prose section | roadmap section |
|---|---|---|
| what the developer defines | name, brief, four editorial dimensions | name |
| what composition returns | paragraphs and open points | ordered milestones |
| how the developer corrects it | writes a note, asks for a rewrite | edits the milestone in place |
| what the client receives | blocks of text | milestones, plus where the project stands |

Everything else is unchanged: one section per tab, a proposal to review, an approval, an atomic publication, and `refreshNeeded` when the reference document is rewritten.

## The milestone

A milestone carries **when**, **what**, and optionally **why it matters**.

**"When" is text, not a date.** Documents say "Q3 2026", "après la phase pilote", "mi-octobre", "dès la validation du cahier des charges". A date type would either lose those or invent a precision the documents never gave. Order is carried by the list, not by parsing what "when" says.

**Where the project stands is carried once, by the section, not by each milestone.** The section names the milestone it is currently on; everything before it is done, everything after is ahead. One field instead of a state per milestone, which makes "two milestones marked current" impossible rather than merely discouraged.

**It is the developer who says where the project stands.** The documents describe a plan, not today. This is the one thing they will change weekly without a document changing, so it must be changeable without regenerating anything.

## The standard phases

Nearly every project this product serves runs through the same arc, and the developer's own work sits in the middle of it. So an empty roadmap is not an empty page: it is that arc, offered.

| phase | what it covers | offered by default |
|---|---|---|
| Cadrage | recueil du besoin, audit de l'existant, périmètre | yes |
| Conception | parcours, maquettes, architecture technique | yes |
| Développement | the developer's own milestones go here | yes |
| Recette | tests et validation par le client | yes |
| Mise en ligne | déploiement en production | yes |
| Suivi | corrections, évolutions, maintenance | yes |
| Contractualisation | devis signé, acompte | no |
| Reprise de données | migration depuis l'existant | no |
| Bêta | pilote avec de vrais utilisateurs | no |
| Formation | prise en main par les équipes du client | no |

**A phase is a milestone like any other.** It arrives named and empty of dates, and the developer edits it, renames it, moves it or removes it exactly as they would one the documents produced. There is no second kind of object and no nesting: "Développement — lot 1" is a milestone the developer writes, not a child of a phase.

**A phase the documents never mentioned is proposed, never asserted.** The model keeps stating only what the reference document holds (FR-003). The standard phases are offered to the *developer*, who accepts them or not; from that moment they are authored, exactly like a note. The client never reads a phase nobody chose.

**The developer sees which is which.** A milestone read from the documents and a phase they added by hand are distinguishable while they work — because trusting the roadmap means knowing what came from where — and indistinguishable to the client, because by then both are the developer's word.

**The names are seeded, then owned.** They come from the developer's language at the moment they are added, and become plain text after that. Renaming "Recette" to "Validation" is a rename, not a switch to another template.

## User Scenarios *(mandatory)*

### User Story 1 - Get a timeline out of what the documents say (P1)

The developer adds a section, names it "Roadmap", and gets an ordered set of milestones read from the reference document.

**Acceptance Scenarios**:

1. **Given** a reference document mentioning dated or sequenced steps, **When** a roadmap section is composed, **Then** those steps come back as ordered milestones.
2. **Given** the creation dialog, **When** the developer picks a roadmap, **Then** the brief and the four editorial dimensions are not asked for.
3. **Given** a document saying "Q3 2026" and another saying "après la phase pilote", **When** milestones are proposed, **Then** both are kept as written rather than turned into calendar dates.
4. **Given** a reference document that says nothing about sequence, **When** the section is composed, **Then** it reports that nothing matched, exactly as a prose section does, rather than inventing a plan.
5. **Given** no reference document has been written yet, **When** the developer opens the section, **Then** the same state as any other section is shown.

---

### User Story 2 - Correct a milestone (P1)

A date is wrong, a step is missing, two are in the wrong order. The developer fixes them where they are.

**Acceptance Scenarios**:

1. **Given** a proposed milestone, **When** the developer edits its "when", its title or its description, **Then** the change is kept without a regeneration.
2. **Given** a proposed set, **When** the developer adds a milestone, removes one, or reorders them, **Then** the set reflects it.
3. **Given** an edited set, **When** the developer approves it, **Then** the client receives what the developer edited, not what the model proposed.
4. **Given** a milestone with an empty title, **When** the developer tries to save, **Then** it is refused — a milestone with no "what" is a marker over nothing.

---

### User Story 3 - Start from the phases every project has (P1)

The reference document is thin on sequence. The developer does not face an empty timeline: the standard arc is already on the track, waiting to be taken.

**Acceptance Scenarios**:

1. **Given** a roadmap with no milestones, **When** the developer opens it, **Then** the standard phases are shown on the timeline as available, and one is added by choosing it.
2. **Given** a phase added by hand, **When** the developer edits its "when", its title or its description, **Then** it behaves exactly as a milestone read from the documents.
3. **Given** the phases, **When** the developer wants a step of their own between two of them, **Then** they can insert one at that point.
4. **Given** a roadmap holding both, **When** the developer reviews it, **Then** they can tell a milestone read from the documents from a phase they added.
5. **Given** the same roadmap, **When** the client reads it, **Then** the two are shown alike.
6. **Given** a phase named "Recette", **When** the developer renames it, **Then** it keeps the new name and is not restored.

---

### User Story 4 - Say where the project stands (P1)

**Acceptance Scenarios**:

1. **Given** a published roadmap, **When** the developer marks a milestone as the current one, **Then** the client sees it as current without a new composition or a new approval.
2. **Given** a current milestone, **When** the developer marks a different one, **Then** the first stops being current.
3. **Given** a roadmap where nothing is marked, **When** the client reads it, **Then** it reads as a plan with no position claimed, rather than defaulting to the first milestone.
4. **Given** the current milestone is deleted, **When** the set is saved, **Then** no milestone is current.

---

### User Story 5 - The client reads the timeline (P1)

**Acceptance Scenarios**:

1. **Given** a published roadmap section, **When** the client opens the documentation, **Then** it is one tab among the others, showing a timeline rather than paragraphs.
2. **Given** a client reading in another language than the developer, **When** they open the roadmap, **Then** the milestone text is in their language and the order and the count are unchanged.
3. **Given** a roadmap on a phone, **When** the client reads it, **Then** it is legible without sideways scrolling.
4. **Given** a roadmap section never approved, **When** the client opens the documentation, **Then** it is absent, as an unpublished prose section is.

---

### User Story 6 - Keep it true as the project moves (P2)

**Acceptance Scenarios**:

1. **Given** a new document is added and the reference document rewritten, **When** the developer opens the roadmap, **Then** it is flagged as owed a refresh, like any other section.
2. **Given** a refresh, **When** new milestones are proposed, **Then** the developer reviews and approves them before the client sees them.

## Functional Requirements

- **FR-001** A section is either prose or roadmap, decided at creation and never afterwards.
- **FR-002** A roadmap section carries a name and nothing else the developer authors.
- **FR-003** Composition of a roadmap section reads the reference document only, and never states a step it does not contain.
- **FR-004** A milestone carries a free-text "when", a title, and an optional description.
- **FR-005** Milestone order is explicit and carried by the section, never derived from the text of "when".
- **FR-006** A section names at most one current milestone, and may name none.
- **FR-007** The current milestone can be changed on a published roadmap without composing or approving anything.
- **FR-008** The developer can edit, add, remove and reorder milestones on a proposal before approving it.
- **FR-009** Composition reporting nothing matched behaves as it does for a prose section, and the standard phases remain available to start from.
- **FR-010** A roadmap with no milestones offers the standard phases; adding one produces an ordinary milestone the developer owns.
- **FR-011** A milestone records whether it came from the reference document or was added by the developer. The developer's view distinguishes them; the client's does not.
- **FR-012** What the client receives is structured milestones, not prose to be parsed.
- **FR-013** Deriving the client's version may translate and adapt milestone text; it must return the same milestones, in the same order, and must not merge, drop or add one.
- **FR-014** A roadmap section takes part in publication atomically with every other section.

## Decisions taken, worth confirming

1. **Editing a proposal is not preserved across a regeneration** — for now. Asking for a fresh composition replaces the proposal, milestone edits included — as it already does for prose. The developer regenerates when a document changed, and reviews the result. *Alternative, if you want edits to survive: they would have to become notes on the reference document, which is the mechanism 018 built for exactly this — but a note fixing a date is heavier than editing the date.*
2. **The current milestone is not a proposal, it is section state.** It survives regeneration, because where the project stands has nothing to do with what the documents say.
3. **Deriving for the client still runs**, so a client reading in another language gets the milestones in theirs. It is constrained to preserve structure exactly (FR-013).
4. **The timeline component is written in this repo**, from the primitives already present. Nothing is installed.

## Out of scope

Dependencies between milestones, durations, a Gantt view, syncing milestones with the task board, and dates as a queryable type.
