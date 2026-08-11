# Feature Specification: Canonical Document Workflow

**Feature Branch**: `codex/016-canonical-document-workflow`

**Created**: 2026-08-11

**Status**: Approved

**Approved**: 2026-08-11

**Input**: User description: "Treat every project document as a contribution to one canonical source; preserve provenance, resolve duplicates and contradictions through contributor questions, regenerate only impacted categories, apply a project-level editorial profile with preview and confirmation, and keep AI processing resilient through a configurable provider fallback."

## Why This Supersedes the Current Document Workflow

The current workflow preserves one extract per document and asks the contributor to review merged reference prose per category. This gives the client one continuous text, but it still treats the merged prose as the durable source of truth. It also mixes two different review intentions: checking factual reference content and steering the tone or length of client-facing content.

This feature makes the project's canonical source the durable unit. Documents progressively contribute attributable information to that source. Categories become projections of the source, and client-facing content becomes a stylistic derivation controlled by a separate editorial profile. A contributor can therefore trace information to its origin, leave an unresolved point explicitly marked, change how the client content is written without changing the facts, and recover safely from an unavailable generation service.

## Clarifications

### Session 2026-08-11

- Q: How may contributors modify the canonical source? → A: The source is readable but not freely editable; contributors use a guided correction action that creates an attributable source revision.
- Q: Which language does the canonical source use? → A: Each project has one contributor-selected working language; multilingual source documents are normalized into it while originals remain unchanged.
- Q: How are existing categories published after an editorial-profile change? → A: All currently published categories are regenerated and switch together only when the complete new set is ready.
- Q: How is existing documentary data transitioned to the canonical workflow? → A: Reset the documentary domain and start empty; accounts, projects, memberships, and external connection settings remain untouched.
- Q: How many clarification questions are shown for one source revision? → A: Show every detected clarification, ordered by impact; do not hide or defer questions behind a numerical cap.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add Knowledge to One Project Source (Priority: P1)

A contributor adds a file or connected page to a project. Diaphane incorporates its useful information into the project's existing canonical source rather than creating a separate reading unit. Information already present is not duplicated, information that updates an older fact replaces it only when the update is unambiguous, and every retained point remains attributable to its originating document.

**Why this priority**: The canonical source is the factual foundation for every reference category and every client-facing version. If it loses information, provenance, or coherence, all downstream content becomes unreliable.

**Independent Test**: Add three overlapping documents containing repeated facts, one explicit update, and unique facts. Confirm that the canonical source contains every unique fact once, reflects the explicit update, and can trace each retained fact to at least one source document.

**Acceptance Scenarios**:

1. **Given** a project with no documentary source, **When** a contributor adds its first document, **Then** the system creates the first canonical source revision and attributes every retained item to that document.
2. **Given** an existing canonical source, **When** a new document repeats information already present, **Then** the source keeps one coherent item and adds the new document as additional provenance where relevant.
3. **Given** a new document that explicitly supersedes an existing date, decision, or figure, **When** the relationship is unambiguous, **Then** the next source revision reflects the current value while preserving the history and provenance of the change.
4. **Given** a document that affects only one category, **When** it is incorporated, **Then** no unrelated category is regenerated.
5. **Given** an uploaded source document, **When** ingestion succeeds or fails, **Then** the original remains available to authorized contributors for inspection.
6. **Given** a contributor reading the canonical source, **When** they identify an incorrect item, **Then** they can initiate a guided correction that records them as the correction's provenance and creates a new source revision.
7. **Given** source documents in different languages, **When** they are incorporated, **Then** the canonical source remains coherent in the project's selected working language and each original remains unchanged.

---

### User Story 2 - Clarify Without Silently Guessing (Priority: P1)

When documents disagree or leave an ambiguity that changes what a client may understand, Diaphane asks the contributor a focused question. The contributor may answer it or leave it unresolved. An unresolved point does not block publication, but it remains visibly marked as a point to clarify and is never silently decided by the system.

**Why this priority**: The product promise depends on presenting real information without fabrication. Contradictions and ambiguities are inevitable in a growing project corpus and must be handled explicitly.

**Independent Test**: Add two documents with contradictory launch dates, verify every material contradiction remains ranked and attributable, answer one clarification, deliberately leave another open, and confirm its stable open-point identity survives the canonical-source reading model and clarification API. Propagation into factual references and client content is verified by User Story 3 once the publication gate exists.

**Acceptance Scenarios**:

1. **Given** two sources that disagree on a client-relevant fact, **When** neither clearly supersedes the other, **Then** the system creates a ranked clarification linked to the conflicting information and its sources.
2. **Given** an open clarification, **When** the contributor answers it, **Then** the answer produces a new canonical source revision and settles the corresponding point without removing its provenance.
3. **Given** an open clarification, **When** the contributor chooses not to answer it, **Then** affected reference and client content may still be published with the unresolved point explicitly identified.
4. **Given** several possible questions, **When** they are presented, **Then** every material clarification is visible and ordered by how much its answer could change the client-facing outcome; low-value stylistic questions are omitted.
5. **Given** an ambiguity that does not affect any client-facing statement, **When** the document is incorporated, **Then** the contributor is not interrupted solely for completeness or wording preferences.

---

### User Story 3 - Review Factual Changes by Impacted Category (Priority: P1)

After the canonical source is updated, the contributor reviews the regenerated factual reference for each impacted category. They can see why the category changed, which source revision it comes from, and which points remain open. Accepting a category authorizes client-facing regeneration; rejecting it never asks the factual layer to become shorter or more pedagogical.

**Why this priority**: This is the human trust gate. It must validate facts and structure without conflating them with client-facing editorial choices.

**Independent Test**: Add a document affecting two categories, accept one category and leave the other pending. Confirm only the accepted category is eligible for client-facing regeneration and the previously published version of the other remains visible.

**Acceptance Scenarios**:

1. **Given** a new canonical source revision affecting multiple categories, **When** category drafts are ready, **Then** each appears as an independent review item with its cause, provenance summary, and open clarifications.
2. **Given** a factual error in a reference draft, **When** the contributor requests a correction, **Then** the correction is applied against the same canonical source revision and returns for factual review.
3. **Given** a request such as "make it shorter" or "make it more pedagogical", **When** entered during factual review, **Then** the interface directs the contributor to the editorial preview rather than treating it as a factual correction.
4. **Given** a pending category draft, **When** the contributor discards it, **Then** the previously validated reference and client-facing content remain unchanged and no later document contribution is stranded.
5. **Given** one accepted category and other pending categories, **When** client-facing regeneration completes, **Then** the accepted category may update independently while the others retain their previous published versions.

---

### User Story 4 - Define and Preview the Client Voice (Priority: P2)

A contributor configures an editorial profile in project settings. The profile describes the desired length, pedagogical level, assumed technical familiarity, tone, and optional project-specific instruction. Before changing existing client-facing content, the contributor previews a representative before-and-after result and confirms the change.

**Why this priority**: Contributors need predictable control over how technical material is explained without weakening or rewriting the validated factual source.

**Independent Test**: Change a project's profile from detailed and technical to concise and highly pedagogical, preview an existing category, confirm the change, and verify all regenerated categories preserve the same facts while following the new style.

**Acceptance Scenarios**:

1. **Given** a project, **When** a contributor opens editorial settings, **Then** they can configure length, pedagogical level, assumed client familiarity, tone, and an optional free-text instruction.
2. **Given** existing validated content, **When** the profile is changed, **Then** the contributor sees a preview based on real project content before the change can affect published categories.
3. **Given** a preview, **When** the contributor cancels it, **Then** neither the saved profile nor client-facing content changes.
4. **Given** a confirmed preview, **When** regeneration starts, **Then** the old client-facing content remains visible across the project until replacements for every currently published category are ready, at which point they switch together.
5. **Given** a project with no validated category, **When** its profile is configured, **Then** the profile may be saved for future content without presenting a fabricated project preview.
6. **Given** a confirmed editorial profile, **When** new categories are later published, **Then** they automatically use the current confirmed profile.

---

### User Story 5 - Continue Safely Through AI Service Failures (Priority: P2)

Document ingestion and regeneration continue as durable operations even when a model or provider is temporarily unavailable. Diaphane retries recoverable failures, may use a configured secondary provider, and keeps the prior validated content visible throughout. Operators can disable cross-provider fallback without changing the contributor experience or losing queued work.

**Why this priority**: Documentary processing is central to the product but depends on external services. An outage, exhausted credit balance, rate limit, or retired model must delay work rather than corrupt or silently drop it.

**Independent Test**: Simulate an unavailable primary provider while fallback is enabled, confirm the same operation completes with the secondary provider, then disable fallback and confirm a later failure remains queued or requires attention without changing published content.

**Acceptance Scenarios**:

1. **Given** a recoverable temporary failure, **When** processing is interrupted, **Then** the operation is retried without requiring the contributor to upload the document again.
2. **Given** a persistently unavailable primary provider and enabled fallback, **When** the retry policy is exhausted, **Then** the operation may continue with the configured secondary provider using the same source revision and expected output rules.
3. **Given** cross-provider fallback is disabled, **When** the primary provider remains unavailable, **Then** the operation waits or moves to a visible needs-attention state and no other provider receives the project content.
4. **Given** any fallback attempt, **When** its output does not meet the expected factual or structural rules, **Then** the output is rejected and never published merely because the request technically succeeded.
5. **Given** all configured providers fail, **When** a contributor views the workflow, **Then** they see a clear delayed or needs-attention state and the last validated client-facing content remains available.
6. **Given** an operator changes the provider policy, **When** new operations begin, **Then** they follow the new policy while already-running operations retain an auditable record of the policy under which they started.

---

### User Story 6 - Understand the End-to-End Document State (Priority: P2)

A contributor sees one coherent documentary workspace rather than a disconnected resource list and review queue. They can understand whether a document is being incorporated, whether questions need attention, which categories changed, whether an editorial preview is ready, and what the client currently sees.

**Why this priority**: The backend workflow is asynchronous and may take time. Without explicit state and progression, users cannot tell whether the product is working or what action is expected from them.

**Independent Test**: Run one document through ingestion, an unanswered clarification, category validation, editorial regeneration, and publication. At each step, ask a first-time contributor what has happened, what is currently visible to the client, and what action is available; all answers must be discoverable from the workspace.

**Acceptance Scenarios**:

1. **Given** a newly submitted document, **When** processing starts, **Then** the contributor immediately sees that it was received and what stage comes next.
2. **Given** background processing changes state, **When** the contributor remains on the project, **Then** the displayed state updates without requiring a manual page refresh.
3. **Given** pending clarifications or category reviews, **When** the contributor opens the documentary workspace, **Then** required and optional actions are visually distinct.
4. **Given** a validated reference awaiting client-facing regeneration, **When** the contributor views the category, **Then** the interface distinguishes the validated factual version, the currently published client version, and the replacement being prepared.
5. **Given** a completed client-facing version, **When** the contributor reviews it, **Then** they can preview exactly what the client will read without changing roles or accounts.
6. **Given** a processing failure, **When** recovery is automatic, **Then** the interface communicates delay without demanding unnecessary action; when recovery is not automatic, it presents a specific next action.

---

### User Story 7 - Remove a Document Without Losing Trust (Priority: P2)

A contributor can remove a source document while preserving the integrity of the canonical source. Information supported by other documents remains; information supported only by the removed document is withdrawn or marked for review; affected categories are regenerated and validated before replacing client-visible content.

**Why this priority**: Provenance is valuable only if it can support safe correction and removal. Deletion must not require the model to guess which prose originated in which document.

**Independent Test**: Add two partially overlapping documents, remove one, and confirm shared facts remain with the surviving provenance, unique facts from the deleted source are removed, and only affected categories enter review.

**Acceptance Scenarios**:

1. **Given** an item supported by multiple documents, **When** one supporting document is removed, **Then** the item remains with its surviving provenance.
2. **Given** an item supported only by the removed document, **When** that document is removed, **Then** the item no longer contributes to future reference or client-facing content.
3. **Given** a removal affects one category, **When** recalculation completes, **Then** unrelated categories and their published content remain untouched.
4. **Given** a document removal, **When** a replacement category draft is pending, **Then** the client continues seeing the last validated version until the contributor accepts the recalculated version.
5. **Given** removal leaves a category with no supported information, **When** the contributor confirms the resulting change, **Then** the empty category disappears from the client view.

### Edge Cases

- A document contains no new information after deduplication.
- A document contradicts itself before it conflicts with any other source.
- Several documents are added while an earlier source revision or category draft is awaiting review.
- A contributor discards a category draft while newer document contributions are waiting behind it.
- The same fact is supported by several sources and one or more are later removed.
- A clarification answer itself conflicts with a newer document.
- One source revision produces an unusually large number of material clarifications; all remain accessible while ranking and grouping preserve scanability.
- A contributor changes the editorial profile while another profile-driven regeneration is already running.
- A preview cannot be generated because the project has no validated content or the generation service is unavailable.
- A primary provider accepts a job but becomes unavailable before its result can be retrieved.
- A provider returns a successful response with missing provenance, invalid structure, lost facts, or output that ignores the confirmed editorial profile.
- The available source exceeds a single model's processing capacity.
- A model is retired or becomes unavailable between submission and retry.
- Cross-provider fallback is disabled while operations are already waiting to use it.
- A contributor deletes a document while it is still being incorporated.
- Two contributors answer the same clarification or validate the same category concurrently.
- The documentary reset encounters an original file or processing record that cannot be removed; the reset reports the incomplete item and does not claim a clean transition.

## Requirements *(mandatory)*

### Functional Requirements

#### Canonical source and provenance

- **FR-001**: The system MUST maintain one canonical documentary source per project, revised over time as documents are added, clarified, or removed.
- **FR-002**: The system MUST preserve each original uploaded or connected document as a contributor-accessible source record independently from generated reference and client-facing content.
- **FR-003**: Every retained canonical information item MUST be traceable to at least one source document or an explicit contributor clarification.
- **FR-004**: The system MUST retain enough revision history to explain which source or clarification introduced, confirmed, superseded, or removed an information item.
- **FR-005**: Repeated equivalent information MUST appear once in the canonical source while retaining all relevant provenance links.
- **FR-006**: A clearly stated newer correction MAY supersede an older value; an unresolved contradiction MUST NOT be silently resolved.
- **FR-007**: Adding, clarifying, or removing information MUST identify and regenerate only categories whose factual inputs changed.
- **FR-008**: The system MUST prevent concurrent ingestion or review activity from stranding a document contribution or silently overwriting a newer source revision.
- **FR-009**: Removing a document MUST remove only information that no longer has surviving support and MUST preserve information supported elsewhere.
- **FR-009a**: Contributors MUST be able to read the canonical source and initiate a guided correction against a specific information item.
- **FR-009b**: The canonical source MUST NOT support untracked free-form editing; every contributor correction MUST create a new attributable source revision.
- **FR-009c**: Contributors MUST be able to select one canonical-source working language in project settings.
- **FR-009d**: Information from source documents in other languages MUST be normalized into the selected working language without modifying the originals or losing provenance.
- **FR-009e**: Changing the canonical-source working language MUST require explicit confirmation and MUST create a new source revision while preserving the factual identity and provenance of every item.

#### Clarifications

- **FR-010**: The system MUST create contributor questions only for contradictions, ambiguities, or missing decisions that could materially change client-facing content.
- **FR-011**: Clarifications MUST be ranked by expected impact on the client-facing outcome.
- **FR-011a**: Every material clarification detected for a source revision MUST be accessible to the contributor; the system MUST NOT hide or defer questions solely because a numerical limit was reached.
- **FR-012**: Each clarification MUST identify the affected information and its relevant provenance to the contributor.
- **FR-013**: Contributors MUST be able to answer or deliberately leave each clarification unresolved.
- **FR-014**: An unresolved clarification MUST NOT block category validation or publication.
- **FR-015**: Any published unresolved point MUST be explicitly and consistently marked as a point to clarify in both the factual reference and client-facing versions.
- **FR-016**: A contributor answer MUST create a new source revision rather than altering an already validated revision invisibly.

#### Factual category review

- **FR-017**: The system MUST generate one factual reference draft for each impacted category from a fixed canonical source revision.
- **FR-018**: Each category draft MUST show why it changed, the source revision it represents, a provenance summary, and any unresolved clarifications.
- **FR-019**: Category drafts MUST be independently acceptable, correctable, or discardable.
- **FR-020**: A factual correction instruction MUST be applied without treating editorial preferences as permission to remove supported facts.
- **FR-021**: The interface MUST distinguish factual corrections from requests about length, tone, technical level, or pedagogy and route editorial requests to the editorial profile workflow.
- **FR-022**: Discarding a draft MUST preserve the previously validated version and MUST trigger any required catch-up work for newer source contributions.
- **FR-023**: Only contributor acceptance of a category's factual reference MUST authorize a new client-facing derivation for that category.
- **FR-024**: A client MUST never see an unvalidated factual revision.

#### Editorial profile and preview

- **FR-025**: Each project MUST have one confirmed editorial profile controlling client-facing length, pedagogical level, assumed technical familiarity, tone, and optional free-text guidance.
- **FR-026**: Editorial settings MUST describe desired communication outcomes and MUST NOT expose provider or model names to contributors.
- **FR-027**: When validated project content exists, changing the profile MUST generate a before-and-after preview from real project content before the change can be confirmed.
- **FR-028**: Contributors MUST be able to cancel a preview without changing the confirmed profile or published content.
- **FR-029**: Confirming a profile change MUST regenerate every currently published category and preserve the complete old client-facing set until every replacement is ready.
- **FR-029a**: Client-facing categories regenerated for one profile change MUST become visible together as one coherent project-wide release; partial profile rollout is not permitted.
- **FR-030**: When no validated content exists, contributors MUST be able to save a profile for future use without seeing fabricated project content.
- **FR-031**: Every client-facing derivation MUST use the validated factual reference and the currently confirmed editorial profile, never a previous client-facing version.
- **FR-032**: The system MUST verify that a generated client-facing version preserves required facts, unresolved markers, and the confirmed editorial constraints before it becomes visible.
- **FR-033**: Contributors MUST be able to preview the exact currently published and pending client-facing versions from their own project workspace.

#### Resilient generation policy

- **FR-034**: Every generation operation MUST remain durably identifiable from submission through success, retry, fallback, failure, or cancellation.
- **FR-035**: The system MUST retain the operation type, source revision, editorial profile revision where applicable, generation policy, attempts, outcome, and consumption information needed for audit and evaluation.
- **FR-036**: Recoverable failures MUST be retried according to a bounded retry policy without requiring source re-entry.
- **FR-037**: The system MUST support different generation quality and cost policies for factual extraction, source consolidation, factual drafting, and client-facing derivation.
- **FR-038**: The system MUST support an operator-configurable ordered list of permitted providers and models.
- **FR-039**: Operators MUST be able to enable or disable cross-provider fallback without a product code change.
- **FR-040**: When cross-provider fallback is disabled, project content MUST NOT be sent to a provider outside the permitted primary policy.
- **FR-041**: A fallback attempt MUST use the same immutable source and editorial revisions as the failed attempt.
- **FR-042**: Switching provider or model MUST NOT weaken output validation or bypass contributor approval.
- **FR-043**: Exhausting every permitted recovery path MUST leave the operation in a visible recoverable or needs-attention state while preserving all previously validated content.
- **FR-044**: Already-running operations MUST keep an audit record of the generation policy they started with even if an operator later changes the policy.

#### Contributor and client experience

- **FR-045**: The contributor project experience MUST present documents, canonical source progress, clarifications, impacted categories, editorial previews, and publication state as one coherent documentary workflow.
- **FR-046**: The contributor MUST receive immediate acknowledgement that an uploaded or connected document was received before background incorporation completes.
- **FR-047**: Long-running states MUST update in the open project experience without requiring manual refresh.
- **FR-048**: The interface MUST distinguish optional clarifications, required factual validation, automatic recovery, and failures requiring contributor action.
- **FR-049**: At every stage, the interface MUST state whether the client is seeing the previous validated version, the new version, or no content yet.
- **FR-050**: Clients MUST continue to see one coherent text per non-empty category, ordered by the product's fixed category list.
- **FR-051**: Clients MUST never receive access to source documents, internal provenance records, generation diagnostics, or unvalidated drafts.
- **FR-052**: Contributor-facing failures MUST be expressed in the contributor's interface language and MUST never be presented as draft content that can accidentally be accepted or published.
- **FR-053**: Deleting a source document MUST require explicit confirmation explaining which documentary content may be recalculated.

#### Transition from the current workflow

- **FR-054**: Activating this feature MUST begin with an empty documentary domain rather than converting or reusing current documents, extracts, references, drafts, client-facing documentary content, clarifications, or generation operations.
- **FR-055**: The documentary reset MUST NOT alter user accounts, projects, project memberships, invitations, or configured external connections.
- **FR-056**: The reset MUST remove stored originals belonging to reset document records and MUST report any item it could not remove rather than silently leaving an unknown partial transition.

### Key Entities

- **Project Source**: The project's current canonical documentary knowledge, selected working language, and revision identity. It is readable by contributors, is the factual input to category references, and is never directly client-facing or freely edited.
- **Source Revision**: An immutable snapshot of the canonical source produced by a document addition, clarification, or removal. It identifies what changed and which categories are impacted.
- **Source Document**: An uploaded file or connected page, its original reference, lifecycle, contributor, and relationship to canonical information.
- **Information Item**: One coherent fact, decision, date, figure, constraint, explanation, or explicitly open point retained in the canonical source.
- **Provenance Link**: The relationship showing which document, document location where available, or contributor clarification supports an information item.
- **Clarification**: A ranked question about conflicting or ambiguous information, its affected items and sources, answer state, and resolution history.
- **Category Reference**: The validated factual projection of one product category from a specific source revision.
- **Category Reference Draft**: A reviewable proposed replacement for a category reference, including its cause, provenance summary, open points, and review outcome.
- **Editorial Profile**: The project's confirmed client communication preferences and its revision history.
- **Editorial Preview**: A temporary before-and-after comparison generated from real validated project content for an unconfirmed profile change.
- **Client Category Content**: The client-readable version derived from one validated category reference and one confirmed editorial profile revision.
- **Generation Policy**: The operator-controlled ordered set of permitted generation routes, including whether cross-provider fallback is allowed.
- **Generation Operation**: The durable record of one extraction, consolidation, drafting, preview, or derivation attempt and its recovery history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a corpus audit, 100% of retained factual items can be traced to at least one source document or explicit contributor clarification.
- **SC-002**: Across a test corpus containing duplicates, 100% of semantically equivalent repeated facts appear only once in the canonical reading view while retaining every valid provenance link.
- **SC-003**: Across a test corpus containing contradictions, 100% of unresolved client-relevant contradictions are surfaced as clarifications or explicit points to clarify; none are silently selected.
- **SC-004**: Adding or removing a document that changes one category causes zero unaffected categories to enter regeneration or review.
- **SC-005**: In concurrent-ingestion tests, 100% of accepted document contributions eventually appear in a reviewable source revision; none are stranded by accepting or discarding another draft.
- **SC-006**: In moderated usability testing with at least 10 developers/freelances who have never used or previewed this workflow, a contributor can identify a document's current stage, required next action, and what the client currently sees within 10 seconds at every workflow stage.
- **SC-007**: In the same first-time-contributor cohort and standardized scenario, at least 9 of 10 participants complete document addition, clarification handling, factual validation, and client preview without assistance.
- **SC-008**: In editorial evaluation, at least 90% of generated previews satisfy the selected length, pedagogy, technical familiarity, and tone constraints while preserving every required fact and open-point marker.
- **SC-009**: Changing an editorial profile alters zero published categories before preview confirmation and zero partially regenerated category sets become visible after confirmation.
- **SC-010**: During simulated provider, model, rate-limit, and exhausted-credit failures, 100% of operations either recover under the configured policy or reach a visible needs-attention state without losing source data or replacing validated client content.
- **SC-011**: With cross-provider fallback disabled, zero project content is sent outside the configured primary provider during failure tests.
- **SC-012**: Contributors see background state changes within 15 seconds of the application learning about them, without manually refreshing the page.
- **SC-013**: Clients encounter zero source documents, provenance diagnostics, unvalidated factual revisions, or generation error messages in the client-facing project experience.
- **SC-014**: Removing a document from a representative multi-document corpus removes 100% of facts supported only by that document and preserves 100% of facts with surviving support.

## Assumptions

- The existing fixed product-wide category list remains unchanged; this feature changes how categories are sourced and reviewed, not the taxonomy.
- Source documents remain contributor-only and clients continue to read category-level content rather than individual documents.
- Open clarifications are deliberately publishable when explicitly marked; they are not treated as factual certainty.
- The editorial profile is configured per project, while provider and model routing is configured by the product operator rather than individual contributors.
- The canonical source uses one contributor-selected project working language independently from the languages produced for client-facing content.
- Provider/model names are implementation details hidden from the ordinary contributor workflow, though they remain available to authorized operators for diagnosis and evaluation.
- Cross-provider fallback is allowed by default in the product design but can be disabled by operator policy.
- A provider change may send project content to another configured processor; the operator is responsible for enabling only providers permitted by the product's contractual and privacy commitments.
- Previously validated client content remains available during every ingestion, review, preview, regeneration, retry, or fallback operation.
- A project with no validated category can save an editorial profile but cannot generate a truthful project-specific preview yet.
- The current document upload and connected-page source types remain supported; continuous synchronization of connected pages remains outside this feature unless separately specified.
- The feature replaces the current contributor resource list plus disconnected draft queue as the primary document-management experience.
- Existing documentary data is development-only and disposable; this feature starts its documentary model empty instead of providing a migration or automatic reprocessing path.

## Dependencies

- Existing project membership and contributor/client access rules.
- Existing document upload, original-document preservation, and connected-page ingestion capabilities.
- Existing fixed category taxonomy and client category reading surface.
- Existing project settings surface, extended with editorial preferences.
- At least one configured generation provider; fallback requires at least two permitted providers.

## Out of Scope

- Allowing clients to inspect or download source documents.
- Allowing contributors to choose provider or model brand names per project.
- Replacing the fixed category taxonomy with contributor-defined categories.
- Free-form client chat over the documentary source.
- Real-time collaborative editing of the canonical source.
- Free-form editing of the canonical source or generated factual references; contributors correct specific information through guided, attributable revisions.
- Continuous synchronization of a connected page after its initial ingestion.
- Pricing tiers or billing rules based on model quality; the generation policy records cost and quality information so pricing can be designed later.
- Migration or automatic reprocessing of documents, extracts, references, drafts, or client-facing documentary content created by the superseded workflow.
