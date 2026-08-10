# Feature Specification: Fixed Categories & Per-Category Document Sections

**Feature Branch**: `feat/document-processing-categories`

**Created**: 2026-08-09

**Status**: **Superseded by [specs/015-document-reference-layer](../015-document-reference-layer/spec.md) (2026-08-11).** Shipped 2026-08-09, then broke on the second document — see "What Superseded This" below. Its fixed four-category list, its single-analysis-pass ingestion and its image normalization survive in 015; its per-document sections, its move-a-section action and its per-document publish flow do not.

## What Superseded This

The taxonomy was right and is kept. The **unit** was wrong.

014 made the unit a section per (document, category). In real use, a second document completing a subject the first already covered was appended as its own block rather than merged into what existed — so a category tab showed the client several passages about the same thing and left them to reconcile it. "One document = one section" adds cognitive load for the reader and does not correspond to anything they care about.

015 makes the **category** the unit, at project scale, and splits the pipeline into a developer-validated reference layer and a client layer derived from it. Sections, the `/move` action, and per-document publication were removed entirely rather than left dormant.

---

**Original status**: Approved — Q1/Q2/Q3 resolved 2026-08-09 (see Resolved Decisions)

**Input**: User description: "Refonte du traitement documentaire et de la répartition par catégorie (remplace specs/013-ai-resource-categorization). Le document n'est plus l'unité de contenu : les catégories sont fixes au niveau produit, et pour chaque catégorie l'IA pioche dans le document ce qui la concerne et en produit une section vulgarisée dédiée. Côté client, chaque onglet de catégorie affiche directement le contenu en accordéon. Le développeur valide section par section ce que l'IA a réparti."

## Why This Supersedes 013

`specs/013-ai-resource-categorization` shipped, and three of its premises turned out to be wrong in use:

1. **Letting the AI invent the taxonomy produced an unstable, meaningless one.** Categories were minted per project from whatever the first documents happened to contain, and each new document was shown the existing list and told to reuse it — a feedback loop that converged on a handful of generic labels rather than a taxonomy anyone would design.
2. **Assigning whole documents to categories made every tab identical.** 013 deliberately allowed a resource to carry several approved categories and to appear under each of its tabs (013 FR-005/FR-009). In practice every document collected the same generic categories, so switching tabs showed the same list of documents — the tabs carried no information.
3. **A document is not a category.** A contributor's real documents are messy: one file can contain a bit of scope, a bit of planning and a technical decision, all interleaved. Classifying the file as a whole discards that structure. The useful unit is not "which category is this document in" but "what does this document have to say about each category".

This feature replaces 013's model rather than tuning it: **a fixed, product-owned category list**, and **AI that extracts per-category content from a document** instead of labelling the document.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AI splits a document into per-category sections (Priority: P1)

A contributor adds a document (upload or Notion page) to a project, as they already can today. Instead of producing one plain-language rewrite of the whole document plus a set of invented labels, the system reads the document against the project-independent, fixed list of categories and produces **one section per category the document genuinely says something about**. Each section is a plain-language rewrite covering only what that document contributes to that category, with its own short title. A category the document doesn't address produces no section at all. Everything of substance in the document ends up in exactly one section — anything that fits no specific category lands in the catch-all category, never silently dropped.

**Why this priority**: Every other part of the feature reads from these sections. Without them there is nothing to review, nothing to publish, and nothing to display. This is also the slice that fixes the root cause of "every tab shows the same thing".

**Independent Test**: Add a deliberately messy document mixing, say, a statement of what the project is for, a diagram of how the pieces fit together, and a couple of delivery dates. Confirm processing produces three distinct sections under three distinct categories, each containing only its own slice of the source, and confirm no substantive part of the source is missing from the union of the sections.

**Acceptance Scenarios**:

1. **Given** a contributor adds a document covering three of the fixed categories, **When** processing finishes, **Then** the resource is ready for review carrying exactly three sections, one per addressed category, each with its own title and plain-language content.
2. **Given** a document that speaks to only one category, **When** processing finishes, **Then** exactly one section exists — the system does not invent content to populate the other categories.
3. **Given** a document whose content matches no specific category, **When** processing finishes, **Then** its content is present in full under the catch-all category rather than lost.
4. **Given** a document containing a diagram or a chart, **When** processing finishes, **Then** the diagram is described in plain language inside whichever section it belongs to, not skipped (carried over from 011 FR-003).
5. **Given** the same document is read by an English-speaking and a French-speaking member, **When** each opens it, **Then** both see the same set of sections under the same categories, differing only in language.

---

### User Story 2 - Contributor reviews and corrects the AI's distribution (Priority: P1)

Once processing finishes, the contributor reviews **what the AI put where**, section by section: for each section they see its category, its title and its full content, and they either approve it, reject it, or move it to a different category from the fixed list. Approving one section says nothing about the others. Only approved sections of a published resource are ever visible to a client. Rejecting a section does not block the rest of the resource.

**Why this priority**: The 013 model asked the contributor to validate a *label*, which is meaningless once the list is fixed — the real risk is now mis-filed or badly extracted content. This is also the guardrail that keeps a client from ever reading AI output nobody checked, which the product's "never fabricate" principle requires. It is P1 alongside User Story 1 because shipping US1 without it would expose unreviewed AI content to clients.

**Independent Test**: On a resource with three proposed sections, approve one, reject one, and move the third to another category. Confirm the three outcomes are independent, that the moved section now sits under its new category, and that a client subsequently sees only the approved and the moved-then-approved sections.

**Acceptance Scenarios**:

1. **Given** a resource is ready for review with several proposed sections, **When** the contributor opens it, **Then** each section is shown with its category, title and full content, plus approve / reject / move-to-category controls.
2. **Given** a contributor approves one section, **When** they do so, **Then** the other sections' states are unchanged and the resource's own publication state is unchanged.
3. **Given** a section was clearly filed under the wrong category, **When** the contributor moves it to another category from the fixed list, **Then** it appears under that category from then on, and moving it never changes its content.
4. **Given** a section is rejected, **When** the resource is later published, **Then** that section is never visible to a client, while the resource's other approved sections are.
5. **Given** a client-role member, **When** they view any resource, **Then** they never see a proposed or rejected section, and never see the review controls.

---

### User Story 3 - Client reads content directly under each category tab (Priority: P2)

A client opens their project and sees one tab per category that actually has published, approved content — no empty tabs. Under a tab, the content is **there to read immediately**: an accordion with one block per section, each block's title always visible, the first block expanded by default and the rest collapsed. No click-through to a separate page is needed to read anything. Each block still offers access to the document it came from — a preview or download for an uploaded file, a link to the page for a Notion source — for a client who wants the original.

**Why this priority**: This is the client-facing payoff, but it can only be built once sections exist and are reviewable. It is also the part the current client explicitly complained about ("I have to click the file, the content should show under the category").

**Independent Test**: With two published resources whose approved sections span three categories, open the client view and confirm each tab shows different content, that the first section of each tab is readable without any interaction, and that no tab exists for a category with no approved published content.

**Acceptance Scenarios**:

1. **Given** a project with approved published sections in three categories, **When** a client opens the project, **Then** exactly three category tabs exist alongside Current Task, each showing that category's sections and nothing else.
2. **Given** a client opens a category tab, **When** the tab renders, **Then** the first section's full content is already visible without any click, and the remaining sections show their titles collapsed.
3. **Given** two different categories both drew sections from the same source document, **When** the client switches between those two tabs, **Then** the content shown differs — each tab shows only that category's extract, not the whole document twice.
4. **Given** a section came from an uploaded file, **When** the client expands it, **Then** an access to the original file (preview or download) is available within the block.
5. **Given** a project where no published resource has an approved section yet, **When** a client opens the project, **Then** they see the Current Task tab alone, with no empty or placeholder category tabs.

---

### User Story 4 - An architecture-diagram PNG is read and described (Priority: P2)

A contributor uploads a `.png` of an architecture diagram — exported from a whiteboard or a modelling tool, typically large and wide. The system reads the diagram, interprets it, and transcribes what it shows in plain language into the categories it belongs to (typically "How it works"). Today this path fails: the resource is saved, and analysis fails a few minutes later.

**Why this priority**: A real, reported defect on an already-advertised capability (PNG is in the accepted-format list shown to the contributor), and diagrams are exactly the content a non-technical client benefits most from having explained. It is independent of the rest of this feature and can ship on its own.

**Diagnosis** (from the image-input limits of the analysis provider, confirmed against its published documentation): the accepted upload limit is 25 MB and the file is forwarded to analysis untouched, but analysis rejects any image whose **long edge exceeds 8000 px** or whose **encoded payload exceeds 10 MB**, and caps a whole analysis request at **32 MB**. A large diagram export breaches at least one of these. The rejection surfaces per-request at execution time, not at submission — which is exactly why the resource is saved successfully and only fails minutes later, once the polling sweep reads the result. Note also that today the same image is sent **three times** in one analysis request (once per language, plus once for categories), tripling the payload against that 32 MB request cap; the single-pass model of FR-011 removes two of those three copies on its own.

**Independent Test**: Upload a wide architecture-diagram PNG (e.g. 12000 × 3000 px, 15 MB) and confirm it reaches ready-for-review with a section describing the diagram's components and their relationships — not a `failed` resource.

**Acceptance Scenarios**:

1. **Given** a contributor uploads a PNG within the documented upload limit but beyond what analysis accepts natively, **When** processing runs, **Then** the system normalizes the image so analysis accepts it, and the resource reaches ready-for-review with its sections.
2. **Given** an uploaded diagram, **When** its section is produced, **Then** the section describes what the diagram shows — its components and how they relate — rather than merely noting that a diagram is present (FR-008).
3. **Given** a file that genuinely cannot be processed even after normalization (corrupt, unreadable), **When** the contributor uploads it, **Then** they are told why in plain language — and the resource never remains in processing indefinitely.

---

### Edge Cases

- **A document yields zero sections.** The document is genuinely empty, illegible, or entirely non-substantive. It must not silently become an invisible resource: it reaches a state the contributor can see and act on, with a reason, rather than sitting ready-for-review with nothing in it.
- **Two sections of the same document land in the same category.** The system produces at most one section per (document, category) pair — a second extract for a category it already filled is merged into that section, not stored as a duplicate.
- **A contributor moves a section into a category where that same document already has a section.** The move must not create a duplicate pair; the two sections are merged, or the move is refused with a clear reason (see Assumptions).
- **A very long document.** The per-category rewrite is proportional, not a summary (011's guardrail), so a long document can produce long sections. Processing must not silently truncate content mid-section; a truncated result is a failure the contributor is told about, not a partial success.
- **A resource is deleted.** Its sections disappear with it; a category tab whose last section came from that resource disappears from the client view.
- **A category has approved sections from several documents.** The tab lists all of them; ordering is defined (see Assumptions) rather than arbitrary.
- **Existing resources from 013.** Projects already carry resources with whole-document rewrites and AI-invented categories. Their fate is Q3 below.

## Requirements *(mandatory)*

### Functional Requirements

#### Fixed category list

- **FR-001**: The system MUST use a single, fixed, product-wide list of categories, identical for every project. Categories MUST NOT be created, renamed or removed by the AI, by a contributor, or per project.
- **FR-002**: Each category MUST have a stable internal key and a display label in each supported language (English, French). Labels MUST be written for a non-technical reader.
- **FR-003**: The list MUST contain exactly one catch-all category, whose role is to receive substantive content that fits none of the others.
- **FR-004**: The list is the following four categories (**signed off by the user on 2026-08-09**):

  | Key | English label | French label | Holds |
  |----------------|---------------------|-----------------------|-------|
  | `overview` | The project | Le projet | What the project is for, who it serves, functional scope, what is being built |
  | `how-it-works` | How it works | Comment ça marche | Architecture, technical workings, data flows, diagrams — rewritten for a non-technical reader |
  | `planning` | Roadmap | Planning & jalons | Dates, phases, milestones, sequencing, dependencies |
  | `other` | Other information | Autres informations | Catch-all (FR-003) |

  Deliberately minimal. Candidates considered and dropped for this iteration — `decisions` (choices and trade-offs), `usage` (how to use what was delivered), `risks` (known risks and open points) — fold into `overview`, `how-it-works` or `other` until real usage shows they are needed. Adding a category later is a cheap change (a key plus two labels); removing one that already carries sections is not, which is why the list starts small rather than complete.

#### Per-category extraction

- **FR-005**: For each added document, the system MUST produce zero or more **sections**, each attached to exactly one category from FR-004 and to exactly one source document, containing a plain-language rewrite of what that document says about that category.
- **FR-006**: The system MUST NOT produce a section for a category the document does not genuinely address. Filling a category with invented or padded content is a defect, not a fallback.
- **FR-007**: The union of a document's sections MUST cover everything of substance in that document. Content belonging to no specific category MUST go to the catch-all category (FR-003), never be dropped. A section is a rewrite, not a summary — length proportional to the source (carried over from 011 FR-003).
- **FR-008**: Visual content (diagrams, charts, schemas, screenshots) MUST be described in plain language within the section it belongs to, never skipped.
- **FR-009**: The system MUST NOT invent facts, figures, dates or names absent from the source (carried over from 011).
- **FR-010**: A document MUST produce at most one section per category.
- **FR-011**: The set of categories a document is split into, and the boundary of each section's content, MUST be identical across supported languages — a reader MUST NOT see more or fewer sections because of their language.
- **FR-012**: A processing failure MUST leave the resource in an explicit failed state carrying a reason the contributor can read, never in perpetual processing.

#### Contributor review

- **FR-013**: A contributor MUST be able to see, for each section of a resource ready for review, its category, its title and its full content.
- **FR-014**: A contributor MUST be able to approve, reject, or move each section to a different category from FR-004, independently of every other section of that resource and independently of the resource's own publication state.
- **FR-015**: Moving a section MUST change only its category — never its title or content.
- **FR-016**: The system MUST NOT show a proposed or rejected section to a client, under any circumstance.
- **FR-017**: Publishing a resource remains an explicit contributor action, distinct from approving its sections (carried over from 011 FR-016).

#### Client reading

- **FR-018**: A client MUST see one tab per category having at least one approved section belonging to a published resource — and no tab for a category with none.
- **FR-019**: Under a category tab, a client MUST be able to read a section's content without navigating away from the tab. The first section is expanded on arrival; the others are collapsed and expandable in place.
- **FR-020**: Each section MUST expose access to the document it came from — preview or download for an uploaded file, a link to the source page for a Notion page.
- **FR-021**: Section titles and content MUST be shown in the reader's own language.
- **FR-022**: Sections within a tab MUST have a defined, stable order (see Assumptions).

#### PNG upload defect

- **FR-023**: Uploading an image within the documented upload limit MUST complete the same lifecycle as any other accepted format, through to ready-for-review with sections — including images whose dimensions or weight exceed what the analysis provider accepts natively.
- **FR-024**: The system MUST normalize an image to fit the analysis provider's accepted bounds before analysis, preserving aspect ratio and preserving legibility of the diagram's text and labels. Normalization MUST NOT degrade what a reader of the resulting section can learn about the diagram.
- **FR-025**: A file that cannot be processed even after normalization MUST produce an explicit, plain-language reason to the contributor — at upload time when knowable then, otherwise on the resource itself.

### Key Entities

- **Category**: One of the four fixed entries of FR-004. Product-owned, not stored per project, not user-editable. Identified by a stable key; carries one display label per supported language.
- **Section**: The new unit of content. Belongs to exactly one source document and exactly one category. Carries a short title and a plain-language body in each supported language, and a review state (proposed / approved / rejected). At most one per (document, category) pair.
- **Resource (document)**: Unchanged in role — the uploaded file or Notion page a contributor adds, with its lifecycle (processing → ready for review → published) and its original file. It is no longer the unit the client reads; it is the *source* sections are drawn from and the thing the client can still open in full.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Switching between any two category tabs shows different content — no two tabs present the same text. (Direct measure of the defect this feature exists to fix.)
- **SC-002**: A client can read the first piece of content in any category with zero clicks after selecting the tab, and reach any other section in that category in one click.
- **SC-003**: On a document that mixes several kinds of information, every substantive statement in the source is traceable to exactly one section — no duplication across sections, no omission.
- **SC-004**: A contributor can review and dispose of every section of a freshly processed document — approve, reject or re-file each one — in under two minutes for a document of ten pages.
- **SC-005**: 100% of content a client can read has been explicitly approved by a contributor.
- **SC-006**: An architecture-diagram PNG within the documented upload limit reaches ready-for-review with a section describing the diagram's content — 0% rejected for dimensions or weight, 0% stuck in processing.
- **SC-008**: A document is analysed in one pass rather than three, cutting per-document analysis cost and latency by roughly two thirds versus the 013 pipeline.
- **SC-007**: No category tab is ever shown empty.

## Assumptions

- **Section ordering within a tab** (FR-022): most recently published resource first, and within a resource, the order the sections were produced. Rationale: matches the existing resource list ordering (newest first) and keeps a client's latest news at the top.
- **Moving a section into an occupied category** (Edge Case): refused with a clear message rather than silently merged. Merging two independently-written rewrites would produce incoherent prose; the contributor can reject one and move the other. Revisit if it proves annoying in practice.
- **Zero-section documents** (Edge Case): treated as a processing failure with an explicit reason, not as a successful empty resource — a document that yields nothing readable is almost always a bad input (blank scan, unreadable image) the contributor needs to know about.
- **Language consistency** (FR-011): both languages' sections are produced together in one analysis pass rather than one pass per language reconciled afterwards. Producing them independently would let the two languages disagree on which categories apply, which FR-011 forbids; this mirrors how 013 already produced both labels of a category in one shot.
- **Fixed list is code-owned, not data**: since FR-001 forbids per-project categories, the list lives with the shared type definitions consumed by both applications, and adding a category later is a code change, not an admin action.
- **Notion page images stay out of scope**: a Notion page's image blocks are still not analysed (documented limitation from 011). A Notion page whose meaning lives in its screenshots will produce thin sections. Unchanged by this feature, and called out to the contributor is *not* in scope either.
- **No manual editing of AI text**: a contributor approves, rejects or re-files a section; they do not edit its wording. Out of scope, explicitly.
- **Reprocessing**: there is no "re-run the analysis on this document" action in this iteration. Deleting and re-adding the document covers it.
- **Existing 013 behaviour is removed, not kept alongside**: AI-invented categories, whole-document category assignment and its approve/reject flow all disappear. There is no migration path that preserves an invented category, since FR-001 forbids them existing at all.
- **Carried-over resources are marked, not silently emptied** (Q3): a resource that survives the clean slate with no sections is shown to its contributor in a state that says so — it is not left looking ready-for-review with nothing in it, which would read as a bug. Same treatment as the zero-section case above.
- **Image normalization target** (FR-024): resize so the long edge fits the analysis provider's own high-resolution ceiling. The provider downscales beyond that ceiling regardless, so doing it ourselves costs no fidelity and makes the outcome deterministic and diagnosable instead of a rejection minutes later.

## Dependencies

- Builds on the existing resource lifecycle from `specs/011-project-resources` (upload / Notion ingestion, processing → ready for review → published, original file access) and the client tabbed area from `specs/013-ai-resource-categorization`.
- Replaces `specs/013-ai-resource-categorization` entirely for everything category-related.

## Out of Scope

- Manual editing of AI-produced section text by the contributor.
- Per-project category configuration, or any UI to manage the category list.
- Analysing images embedded in a Notion page.
- Re-running analysis on an already-processed document.
- Cross-document synthesis: a section is drawn from one document; the system does not merge several documents' material into a single narrative per category.

## Resolved Decisions

Answered by the user on 2026-08-09; each is now binding on implementation.

- **Q1 — the whole-document plain-language rewrite is replaced by the sections, not kept alongside them.** A document produces sections and nothing else. One analysis pass instead of three (both languages of every section produced together, per FR-011), removing roughly two thirds of the current per-document analysis cost and latency. It also removes the risk of a whole-document rewrite and its sections disagreeing. Consequence: nothing in the product renders a "whole document, rewritten" text any more; the original file itself remains reachable (FR-020) for anyone who wants the source.
- **Q2 — a resource's detail page becomes the contributor's review screen and nothing else.** A client never reaches it: they read everything inline under the category tabs (FR-019) and open the original file from there (FR-020). The page hosts the section-by-section review of US2 — see each section's category, title and content, approve / reject / move it, then publish the resource. Role-conditional rendering disappears from it; it is contributor-only.
- **Q3 — clean slate for data produced under the 013 model.** AI-invented categories and their assignments are deleted outright, along with the whole-document rewrites Q1 removes. Existing resources are kept as rows with their original files, but carry no sections and are therefore invisible to clients until re-added. No automatic reprocessing. Rationale: real usage so far is a handful of test documents, and re-adding them is cheaper and more predictable than a migration that would leave every project's client view empty pending revalidation anyway.
