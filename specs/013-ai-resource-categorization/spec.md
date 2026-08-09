# Feature Specification: AI Resource Categorization

**Feature Branch**: `013-ai-resource-categorization`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Ajouter la catégorisation automatique des ressources par IA : au lieu d'une liste plate de ressources, l'IA détecte les thématiques présentes dans les ressources d'un projet et crée elle-même les catégories pertinentes (au lieu d'une taxonomie fixe imposée à l'avance)... Côté client, les ressources publiées sont regroupées et affichées sous forme d'onglets (tabs) par catégorie, plutôt qu'en liste plate."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AI proposes categories, developer approves each individually (Priority: P1)

A contributor adds a resource (upload or Notion page) to a project, as they already can today. In addition to the existing plain-language rewrite, the system also analyzes the resource's content and proposes one or more categories describing the **type(s) of information** it contains — not its technical subject matter. A single resource can genuinely contain several types of information at once (e.g. a "stack and architecture" document might contain both "Architecture" and "Technical decisions" information), so the system may propose more than one category for the same resource. The contributor sees every proposed category next to the resource once it's ready for review, and approves or rejects **each one individually** — approving one category on a resource does not automatically approve the others, and rejecting one does not affect the rest.

**Why this priority**: Nothing else in this feature has meaning without trustworthy, individually-vetted categories attached to a resource. This is also the direct extension of the existing `processing → ready_for_review → published` pipeline and its "never fabricate" guardrail (Product Principles), so it's the safest, most self-contained first slice.

**Independent Test**: Add a resource whose content plausibly spans more than one type of information, wait for processing to finish, confirm multiple proposed categories appear next to the vulgarized content, approve one and reject another, and confirm only the approved one is ever eligible to reach the client.

**Acceptance Scenarios**:

1. **Given** a contributor has just added a resource, **When** AI processing finishes, **Then** the resource is `ready_for_review` with its vulgarized content and zero or more proposed categories, all visible only to contributors.
2. **Given** a resource has two proposed categories, **When** the contributor approves one and leaves the other pending (or rejects it), **Then** each category's approval state is tracked independently — approving one has no effect on the other.
3. **Given** a proposed category is rejected, **When** that happens, **Then** the resource is simply never grouped under that category later, without blocking the resource's content or its other categories from being published normally.

---

### User Story 2 - Client sees resources grouped into category tabs (Priority: P2)

A client opens their project's Resources area and, instead of a flat list, sees the published resources grouped under tabs named after their approved categories. Because a resource can carry more than one approved category, it can legitimately appear under more than one tab — the same document showing up under both "Architecture" and "Technical decisions," for instance, if both were approved for it.

**Why this priority**: This is the actual client-facing value the feature exists to deliver, but it structurally depends on User Story 1 already producing approved categories to group by.

**Independent Test**: With one published resource carrying two different approved categories, open the client-facing project view and confirm the resource appears under both corresponding tabs.

**Acceptance Scenarios**:

1. **Given** a project has published resources with approved categories, **When** a client views the Resources area, **Then** resources are grouped into tabs, one per distinct approved category, each showing every resource that carries that category (a resource with multiple approved categories appears in each of its tabs).
2. **Given** a single approved category exists on the project so far, **When** a client views the Resources area, **Then** the tabbed layout is already shown (a single tab), rather than staying a flat list until more categories accumulate.
3. **Given** a published resource has no approved category yet (all proposals still pending or rejected), **When** a client views the Resources area, **Then** that resource is still visible somewhere (its publish status is unaffected by category approval) rather than being lost — see Assumptions for where.
4. **Given** a contributor views the same Resources area, **When** they look at it, **Then** they still see every resource regardless of category/approval state, matching today's existing developer-facing flat behavior (this feature does not change the developer view's presentation).

---

### Edge Cases

- What happens when a resource's AI processing produces vulgarized content but category proposal fails independently (partial failure)? The existing content must not be blocked from `ready_for_review`/publishing by a category failure.
- What happens when a project has zero resources with an approved category yet (a brand-new project, or one where every proposal was rejected)? The client view needs a sensible fallback (flat list) until the first category is approved.
- What happens when a newly proposed category is semantically the same "type of information" as one already approved on the project, but the AI would otherwise phrase it slightly differently (e.g. "Architecture" vs "Architecture & Stack")? The system must reuse the existing project category rather than creating a near-duplicate (resolved — see FR-008).
- What happens when a contributor deletes a resource that was the only one under a given category? The tab must disappear from the client view once no published resource carries that category anymore.
- Is there a practical limit to how many categories a single resource can be proposed for? No hard cap is assumed; a resource genuinely spanning many types of information can carry many proposed categories.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST analyze a resource's content (upload or Notion page, including images) as part of the same AI processing pass that already produces its vulgarized content, and propose zero or more categories describing the **type(s) of information** present — not technical subject matter (e.g. "Architecture," "Audit findings," "Technical decisions," "Roadmap-related" are the intended kind of label; "Security," "Databases," "Frontend" are not).
- **FR-002**: System MUST NOT make an AI-proposed category visible to a client until a contributor has explicitly approved that specific category.
- **FR-003**: Contributors MUST be able to see every category proposed for a resource alongside its existing review information (vulgarized title/content) once processing finishes.
- **FR-004**: Contributors MUST be able to approve or reject each proposed category **individually and independently of the others**, and independently of the resource's own publish action — rejecting one category MUST NOT affect the resource's other categories or block the resource's content from being published normally.
- **FR-005**: System MUST group published resources by their approved categories into client-facing tabs, one tab per distinct approved category; a resource with multiple approved categories MUST appear under each of its tabs.
- **FR-006**: System MUST continue to show contributors every resource regardless of category or approval state, unchanged from today's flat presentation on the developer-facing view.
- **FR-007**: System MUST handle a published resource with no approved category (all rejected, still pending, or category processing failed) by still showing it to the client somewhere rather than hiding it. [Assumption: an "Uncategorized" or equivalent catch-all grouping is used — see Assumptions.]
- **FR-008**: When proposing categories for a resource, system MUST take the project's existing approved categories into account and reuse/match one of them instead of creating a near-duplicate, whenever the type of information genuinely matches. An already-approved category MAY continue to be proposed and reused for later resources.
- **FR-009**: System MUST switch the client-facing Resources area from a flat list to the tabbed layout as soon as at least one approved category exists on the project — no minimum count of categories is required first.
- **FR-010**: System MUST NOT change the vulgarization step itself (content, prompts, locales) — only add the category-detection step alongside it.

### Key Entities

- **Resource Category**: A short, AI-proposed label describing a **type of information** (not a technical topic) found in one or more of a project's resources (e.g. "Architecture," "Audit findings," "Meeting notes"). Scoped to a single project — categories are not shared or reused across different projects, though the AI is expected to reuse an existing project category rather than mint a near-duplicate (FR-008).
- **Resource-Category assignment** (many-to-many, new): links one Resource to one Resource Category, carrying its own approval state (proposed / approved / rejected) set by a contributor. A single resource can have several of these — one per category proposed for it — each approved or rejected on its own.
- **Resource** (existing entity, extended): gains zero or more Resource-Category assignments, alongside its existing status (`processing` / `ready_for_review` / `published`) and vulgarized content. A resource's publish status remains independent of any individual category's approval state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor can see every AI-proposed category for a newly added resource as soon as its processing finishes, with no additional manual step beyond what reviewing vulgarized content already requires today.
- **SC-002**: A client viewing a project with categorized resources can find a resource belonging to a given type of information by opening its corresponding tab, without scrolling a single undifferentiated list — including resources that appear under more than one tab.
- **SC-003**: No client ever sees a category the responsible contributor has not explicitly approved for that specific resource.
- **SC-004**: A resource with no approved category yet remains visible to the client once published — categorization never causes a resource to silently disappear from the client's view.
- **SC-005**: As a project accumulates more resources over time, the set of client-facing category tabs stays coherent (no runaway proliferation of near-duplicate categories for the same type of information).

## Assumptions

- An uncategorized-but-published resource is shown to the client under a catch-all grouping (e.g. an "Other"/"Uncategorized" tab or a section outside the tabs) rather than being hidden — exact placement is a presentation detail for planning, not a scope question.
- Category detection reuses the existing `DocumentVulgarizationClient` / Claude Batch API call already made for vulgarization (extending its structured output) rather than introducing a second, independent AI call per resource — per the decision already made with the user.
- Categories are per-project, not global/shared across projects — consistent with resources themselves being project-scoped today. The AI is given visibility into a project's own existing approved categories (not other projects') when proposing new ones, to support reuse (FR-008).
- This feature does not change how a contributor adds a resource, nor the existing publish gate's meaning for content visibility — it only adds a second, related piece of AI-generated metadata (one or more categories per resource) with its own per-category, contributor-approval requirement.
- Out of scope for this iteration: client-facing AI chat and automatic escalation (already excluded from MVP); manual category renaming/merging by the contributor beyond approve/reject (may become necessary during planning if approve/reject alone proves unworkable, but is not assumed here); any change to the vulgarization prompts or output already in production.
