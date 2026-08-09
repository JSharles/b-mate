# Phase 0 Research: AI Resource Categorization

## Decision 1: Category detection runs as a third, locale-agnostic item in the existing Claude Batch submission

**Decision**: `DocumentVulgarizationClient.submitBatch` currently submits one Claude Batch holding two requests — one per supported locale (`en`, `fr`) — each producing that locale's vulgarized `{ title, content }`. Category detection is added as a **third request in the same batch**, run once (not once per locale), whose structured output is `{ categories: [{ key, labelEn, labelFr }] }`.

**Rationale**: A category is meant to describe the resource's *type of information*, which does not change with the reader's language — only its display label does. Running detection once and emitting both locales' labels together keeps the two labels of the same category atomically consistent (impossible to end up with the English and French versions of a resource disagreeing on how many categories it has, or their identity). It also satisfies the standing constraint that this stays "the same processing pass," not a second independent LLM call — it is one more item inside the one batch already submitted per resource.

**Alternatives considered**:
- *Fold category output into each locale's own vulgarization request* (extend `DocumentVulgarizationOutputSchema` per locale) — rejected: two independent LLM calls (one per locale) proposing categories separately could easily diverge on count, identity, or key naming for the same underlying document, with no way to reconcile them after the fact.
- *A fully separate LLM call outside the batch* — rejected: explicitly excluded by the user's decision that this must reuse the existing processing pass, and it would double the number of Anthropic requests per resource for no benefit over item 3 above.

## Decision 2: Categories are identified by a stable, English, kebab-case `key`; reuse is enforced by showing the model the project's existing keys

**Decision**: Every `ResourceCategory` has a project-scoped, unique `key` (e.g. `architecture-stack`) used purely for identity/matching, plus `labelEn`/`labelFr` for display. Before submitting a resource's batch, the system queries the project's existing `ResourceCategory` rows and includes their `key`+`labelEn` pairs in the category-detection request's prompt, instructing the model to reuse an existing key when the type of information genuinely matches, and only mint a new key when it doesn't.

**Rationale**: Directly implements FR-008 (reuse over duplication). A stable English key sidesteps the ambiguity of matching on freeform localized text (which would need fuzzy/semantic matching at write time) — reuse is enforced at generation time, by giving the model the existing vocabulary to choose from, rather than after the fact by a separate deduplication pass.

**Alternatives considered**:
- *Match/deduplicate categories after generation* (e.g. embedding similarity between new and existing category labels) — rejected as unnecessary added infrastructure (a vector store or embedding call) when giving the model the existing key list in-prompt is sufficient and matches how the rest of this codebase avoids adding new AI infrastructure beyond direct Anthropic SDK calls (`document-vulgarization.client.ts`'s own comment: "Deliberately no LangChain/LangGraph... a thin, explicit wrapper directly over the SDK").
- *Global, cross-project category vocabulary* — rejected: spec.md and docs/PRODUCT.md both scope categories per-project, consistent with resources themselves being project-scoped.

## Decision 3: Many-to-many via a join table (`ResourceCategoryAssignment`) carrying its own per-assignment approval state

**Decision**: `ResourceCategory` (the canonical per-project label) and `Resource` are linked through a new `ResourceCategoryAssignment` join row, which — not the resource, and not the category — carries the `proposed`/`approved`/`rejected` state (mirrors `ResourceStatus`'s existing enum style).

**Rationale**: Directly implements the corrected model from clarification: a resource can carry several categories, and each is approved/rejected independently. Putting the state on the join row (rather than on `Resource` or `ResourceCategory`) is the only shape where "approve category A on resource X" doesn't affect "category A on resource Y" or "category B on resource X." Mirrors `ResourceVulgarization`'s existing pattern of a join-style table carrying data specific to one (resource, dimension) pair — same shape, different dimension (locale there, category here).

**Alternatives considered**:
- *A single nullable category + status directly on `Resource`* — rejected outright by the clarification that a resource can have more than one category at once.
- *A JSON array column on `Resource` holding category ids/state* — rejected: makes "which resources currently have category X approved" (needed for the client tab query) a full-table scan/JSON query instead of a straightforward join, and loses referential integrity to `ResourceCategory`.

## Decision 4: Category approval is a resource-scoped sub-action, decoupled from `publish()`

**Decision**: Two new endpoints, `POST /projects/:projectId/resources/:resourceId/categories/:categoryId/approve` and `.../reject`, alongside the existing `POST /projects/:projectId/resources/:resourceId/publish`. `publish()` itself is untouched — it continues to gate only the resource's own content visibility, unaffected by any category's approval state.

**Rationale**: Directly implements the clarified answer: each proposed category is approved/rejected individually, independent of the resource's own publish action. Mirrors the existing `publish()` endpoint's shape (`POST :resourceId/<action>`) rather than inventing a new REST pattern.

**Alternatives considered**:
- *A single `PATCH .../categories/:categoryId` with a `{ status }` body* — considered equivalent in spirit; `POST .../approve` and `.../reject` were chosen only to match the existing `publish()` convention already established in this exact controller, for consistency within the same file rather than introducing a second action-naming style.

## Decision 5: Client-facing display groups by category via a new shared `Tabs` primitive

**Decision**: `apps/web/shared/components/ui/tabs.tsx` is added (no local Tabs component exists yet), hand-built on `radix-ui`'s `Tabs` namespace, matching the existing pattern already used for `alert-dialog.tsx` and `avatar.tsx` (data-slot attributes, `cn()` from `shared/lib/utils`). `ResourcesList`'s client branch (`canManage={false}`) is changed to group its resources by approved category and render them inside this `Tabs` component instead of a flat `<ul>`; the developer branch (`canManage={true}`) keeps today's flat list unchanged, per spec.md FR-006.

**Rationale**: `Tabs` is fundamentally a cross-feature, reusable UI primitive (like `AlertDialog`/`Avatar` before it), so it belongs in `shared/components/ui/`, not inside `features/resources/` — consistent with this project's own stated reason for `useCurrentUser` living in `shared/hooks` rather than `features/auth` (AGENTS.md: "almost every feature needs to know who's logged in" → generalized here as "any feature could plausibly need tabs").

**Alternatives considered**: None seriously — this is a standard, low-risk shadcn/Radix component addition with an established local precedent to follow exactly.
