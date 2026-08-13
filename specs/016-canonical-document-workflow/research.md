# Phase 0 Research: Canonical Document Workflow

**Feature**: `016-canonical-document-workflow`  
**Date**: 2026-08-11

This research resolves the technical choices needed to turn the approved specification into an implementation plan. It deliberately does not choose provider/model brands in the contributor product UI and does not change the fixed four-category taxonomy.

## Decision 1 — Store canonical knowledge as versioned relational items, not one large generated file

**Decision**: Keep each original upload or connected-page snapshot as a `SourceDocument`, but represent the canonical source in PostgreSQL as stable `InformationItem` identities and a complete immutable set of `SourceRevisionItem` snapshots with explicit `ProvenanceLink` rows for every `SourceRevision`. A `ProjectSource` points to the current immutable revision; the readable “single source” is assembled from that revision’s items, ordered under the fixed category taxonomy. JSONB is limited to heterogeneous locators and validated generated block structures.

**Rationale**:

- A PDF, Markdown blob, or giant JSON document is cheap to render but expensive to merge repeatedly and cannot reliably explain which source supports one statement.
- Item-level validity and provenance let deletion remove one support without deleting a fact still supported elsewhere.
- Complete immutable snapshots make additions, contributor corrections, clarification answers, removals, and working-language changes directly reproducible without replaying an event log. Copying unchanged rows costs database storage, not model tokens, and the expected per-project corpus is modest.
- PostgreSQL remains the system of record; derived continuous prose can be regenerated without making a generated blob the factual truth.

**Alternatives considered**:

- **One canonical PDF/Markdown blob**: rejected because provenance and safe partial deletion would depend on model-generated offsets and full-corpus rewrites.
- **Delta/event-log revisions only**: rejected for the first implementation because every historical/current read would need replay or validity-interval logic. It can be revisited only if measured snapshot volume becomes material.
- **One JSON snapshot per revision only**: rejected as the primary representation because deduplication, provenance joins, history queries, and concurrent updates become application-side scans. Small validated JSON structures remain appropriate for locators and immutable generated blocks.
- **Vector database/RAG as the source of truth**: rejected. Retrieval can omit facts and semantic similarity does not provide revision semantics. Embeddings can be evaluated later as an optimization, never as the authoritative store.

## Decision 2 — Extract attributable claims first, then consolidate only impacted category partitions

**Decision**: Ingestion is a staged pipeline:

1. store the original and acknowledge receipt;
2. normalize the input into provider-neutral document parts (text/page or block locators, plus images where supported);
3. extract immutable `DocumentClaim` records with category, language-normalized wording, source locator, and exact content hash;
4. short-circuit exact duplicates, then consolidate each touched category against the active items for that category;
5. apply one new source revision transactionally and record all material clarifications;
6. advance only touched categories’ projection targets and generate their factual drafts.

Long documents are split deterministically by page/heading and approximate token budget. Chunk extraction results are reduced category by category. Every claim must be accounted for as retained, additional support, explicitly superseded, conflict/open point, or excluded as non-material; unknown claim IDs or missing dispositions fail validation.

**Rationale**:

- It avoids sending the complete project source on every upload.
- Category partitioning matches the fixed taxonomy and gives deterministic impact isolation.
- Claims and locators make provenance portable across Anthropic/OpenAI adapters and allow a removed document’s contribution to be recalculated.
- Exact hashes reduce needless model work; semantic equivalence and contradiction detection remain model-assisted and schema-constrained.

**Alternatives considered**:

- **Merge the new document directly into current reference prose**: this is the current failure mode; it conflates factual storage with presentation and loses attribution.
- **Reprocess every surviving original after each change**: accurate in principle, but unnecessarily slow and costly.
- **Embeddings for first implementation**: deferred until real corpus size demonstrates a need; four category partitions and chunked claims are simpler and measurable.

## Decision 3 — Use optimistic revision commits and per-category catch-up targets

**Decision**: Every consolidation operation is pinned to an expected source head. Its mutations commit only if `ProjectSource.currentRevisionId` still matches that head. If another operation won the race, the result is marked superseded and a new operation is enqueued against the latest head. Each category aggregate stores `targetSourceRevisionId`, `activeDraftId`, and `validatedVersionId`. A pending draft is never overwritten; accept or discard closes it, then the coordinator generates a catch-up draft if the target revision is newer.

Mutating review calls carry an `expectedVersion`/ETag-style concurrency token. Conditional updates return `409 Conflict` when two contributors act on stale state.

**Rationale**:

- Database locks cannot be held while a provider runs for seconds or minutes.
- A source revision can incorporate later documents even while an older category draft waits for human review.
- Explicit catch-up state fixes the current path where discard can strand a newer extract.

**Alternatives considered**:

- **One global project queue**: safe but blocks unrelated categories and reduces useful concurrency.
- **Overwrite the active draft with the newest result**: rejected because it destroys review context and can silently discard contributor work.
- **Long database transaction around generation**: infeasible and operationally unsafe.

## Decision 4 — Model clarifications as source state, not text-only questions

**Decision**: A `Clarification` belongs to the source revision that detected it and links to all affected claims/items through evidence rows. Status is `open`, `left_open`, `answered`, or `superseded`. All material clarifications are returned, ordered by impact rank and grouped by category; there is no numerical cap. Answering or deliberately leaving a point open is recorded as a `ClarificationResolution`. An answer creates a new source revision. An unresolved point remains a structured item state and is rendered consistently as “point à clarifier” in factual and client projections.

**Rationale**:

- A literal marker embedded only in prose is fragile across regeneration and translation.
- A structured open-point identity can be checked deterministically before publication.
- Ranking preserves scanability without hiding lower-ranked material questions.

**Alternatives considered**:

- **Keep the current five-question cap**: conflicts with FR-011a.
- **Block publication until every answer exists**: conflicts with the approved non-blocking behavior.
- **Treat accepting a category as implicitly skipping questions**: too ambiguous for audit; “leave open” must be an explicit resolution action.

## Decision 5 — Separate factual reference versions from editorial client releases

**Decision**: Factual drafts and accepted references are immutable, source-revision-pinned records. Factual correction prompts may change supported facts only through a guided correction that creates a source revision; requests for length, tone, pedagogy, or technical level are redirected to the editorial-profile flow.

Client-visible content is published through immutable `ClientRelease` snapshots. A release contains the complete visible category manifest and one `ClientContentVersion` per regenerated category; unchanged categories reuse their previous version. The project has one atomic `currentClientReleaseId` pointer.

- Accepting one factual category creates a release that replaces that category and reuses the others.
- Confirming an editorial profile creates one release that regenerates every currently visible category. The pointer changes only after all outputs pass validation.
- Release requests are sequenced; a factual acceptance arriving during a full editorial rebuild queues behind it and uses the confirmed profile revision.

**Rationale**:

- A single pointer swap enforces “all categories together” for editorial changes without weakening independent factual-category publication.
- Previously published content remains available through every generation failure.
- Immutable releases give contributors an exact client preview and a clear publication audit.

**Alternatives considered**:

- **Update `CategoryContent` rows one by one**: rejected because a profile change could expose a mixed voice.
- **Store two columns (`live`, `pending`) on each category**: still needs a cross-category commit coordinator and has weaker history.

## Decision 6 — Make the editorial profile revisioned, previewed, and independently validated

**Decision**: Store length, pedagogy, assumed client technical familiarity, tone, and optional guidance as an immutable `EditorialProfileRevision`; the project aggregate points to the confirmed revision. When validated content exists, a candidate profile produces an `EditorialPreview` from a real representative accepted category and shows the currently published text beside the candidate output. Cancel deletes/expires only the preview. Confirm atomically creates the confirmed profile revision and queues a full release. With no validated content, confirmation stores the profile without fabricating a preview.

Generated reference/client bodies use structured blocks containing text, covered information-item IDs, and open-clarification IDs. Publication requires:

- strict JSON/Zod schema validation;
- no unknown input IDs;
- complete required-item coverage;
- preservation of every open-point marker;
- no unsupported claim disposition;
- deterministic length checks plus an independent semantic validation operation for faithfulness and editorial constraints.

**Rationale**:

- This directly addresses the current regeneration prompt, where “shorter and more pedagogical” conflicts with a factual prompt that explicitly prioritizes exhaustiveness.
- Structured coverage makes validation stronger than a prose-only second opinion.

**Alternatives considered**:

- **Free-text correction on a factual draft for all feedback**: rejected because factual and editorial intent conflict.
- **Preview against invented sample content**: rejected because it does not prove the effect on the contributor’s project.

## Decision 7 — Introduce a provider-neutral durable generation orchestrator

**Decision**: Add a `generation` API module with a stable `GenerationProviderAdapter` interface and stage-specific schemas. Implement Anthropic and OpenAI adapters behind it. The documentary modules create durable `GenerationOperation` rows; a leased worker creates `GenerationAttempt` rows, submits/polls providers, validates results, retries recoverable failures, advances through the frozen route list, and ends in `succeeded`, `needs_attention`, `cancelled`, or `superseded`.

Each operation freezes:

- operation type and idempotency key;
- source/document/reference/profile revision IDs;
- prompt/schema version;
- ordered route snapshot, batch/synchronous mode, retry limits, and cross-provider permission;
- every attempt’s provider, model, remote request/job ID, timing, error classification, token usage, and estimated cost.

Provider payload construction remains adapter-specific, but provider outputs must map into the same schemas in `packages/schemas`. A provider switch never changes the input revisions, output schema, validation, or human approval gate.

**Rationale**:

- The current Anthropic batch ID fields tie domain rows to one provider and lose terminal failures.
- A durable operation survives API restarts and lets “accepted remotely, temporarily unqueryable” remain a polling state rather than cause immediate duplicate billing.
- OpenAI is the first fallback implementation, not a product promise; more adapters can be registered later.

**Alternatives considered**:

- **A generic third-party LLM gateway**: not selected for the first implementation because it adds another data processor and control plane before actual routing data exists.
- **Provider-specific service calls from each domain service**: rejected because retry/fallback/audit rules would diverge.
- **Only change the Anthropic model environment variable**: handles model retirement but not exhausted credit or provider outage.

## Decision 8 — Configure routing by validated operator policy, not contributor settings

**Decision**: Parse a versioned `GENERATION_POLICY_JSON` environment variable at API startup with Zod. It contains an ordered route list per stage (`document_extraction`, `source_consolidation`, `factual_drafting`, `editorial_preview`, `client_derivation`, `output_validation`), retry bounds, mode (`sync` or `batch`), and `crossProviderFallbackEnabled`. A route list may contain one provider only. API keys stay in provider-specific secrets. `.env.example` documents a development-safe single-provider sample and an optional fallback sample.

Each operation keeps its creation-time policy snapshot for reproducibility. Before sending any not-yet-submitted attempt, the worker also applies the current policy as a deny gate: disabling cross-provider fallback or forbidding a provider prevents an older waiting operation from sending new data there, and moves it to `needs_attention` if no permitted route remains. Already-submitted remote jobs cannot be recalled, but stay auditable. Missing primary credentials or an invalid policy fail startup clearly. A configured fallback whose secret is absent is treated as unavailable and recorded, not silently substituted.

**Rationale**:

- Railway environment configuration satisfies “modifiable without product code change.”
- One route entry supports the future single-provider choice requested by the user.
- A JSON policy is more coherent than multiplying stage/provider/model environment variables.

**Alternatives considered**:

- **Contributor-facing model picker**: explicitly out of scope and harms the product abstraction.
- **Database admin UI now**: deferred; no operator UI exists and environment policy is sufficient for the learning phase.
- **Hard-coded fallback**: rejected because disabling cross-provider transfer must be enforceable operationally.

## Decision 9 — Use a hybrid batch/synchronous policy based on interaction latency

**Decision**: The orchestrator supports both modes per route. The learning-phase default is:

- batch for document extraction and source consolidation, which are heavy and explicitly background work;
- synchronous provider calls executed by the durable worker for factual draft/correction, editorial preview, individual client derivation, and output validation, where the contributor is waiting for feedback;
- up to four synchronous category derivations in parallel for an editorial-profile release, followed by one atomic publication transaction.

The HTTP request always returns after durable operation creation, not after model completion. Transport remains route-configurable, so the operator can later trade latency for batch savings using observed data.

Anthropic documents that Message Batches are asynchronous, cost 50% less, usually finish within an hour, and may run/expire at 24 hours. OpenAI’s Batch API likewise has a 24-hour completion window and a 50% discount. These properties make batch inappropriate for an interactive preview promise but suitable for background corpus work. See [Anthropic Message Batches](https://platform.claude.com/docs/en/build-with-claude/batch-processing) and [OpenAI Batch API](https://developers.openai.com/api/docs/guides/batch).

**Rationale**:

- Keeps the contributor request path reliable even for long documents.
- Preserves the existing cost advantage without forcing every user-visible interaction into batch latency.
- Mode remains policy-configurable as real latency/cost data arrives.

**Alternatives considered**:

- **Batch for everything**: rejected for preview responsiveness.
- **Synchronous HTTP calls for everything**: rejected because uploads and multi-category releases can exceed request lifetimes and lose work on restart.

## Decision 10 — Poll durable work adaptively instead of adding SSE/WebSockets

**Decision**: A Nest scheduled worker scans due operations every five seconds and acquires each with a conditional lease (`leaseOwner`, `leaseExpiresAt`) so multiple Railway instances do not process it concurrently. Provider polling uses per-attempt `nextAttemptAt` backoff. The contributor workspace uses TanStack Query polling every five seconds while any visible state is non-terminal or actionable work is being prepared, then slows to 30 seconds while the tab is focused and stops when hidden. Mutations invalidate the workspace query immediately.

**Rationale**:

- It meets SC-012’s 15-second UI update target with the stack already installed.
- SSE would still require durable jobs, cross-instance event distribution, reconnect cursors, and additional Railway behavior for a workflow that changes on a seconds/minutes scale.
- One workspace summary query avoids many independently drifting requests.

**Alternatives considered**:

- **Manual refresh/current no-polling hooks**: fails FR-047 and SC-012.
- **SSE**: viable later if measurements show polling load or perceived latency is a problem.
- **WebSockets**: unnecessary bidirectional complexity.

## Decision 11 — Make the contributor experience a dedicated documentary workspace

**Decision**: For contributors, `/projects/[id]` becomes the day-to-day documentary workspace with four progressive areas: overview/status, source documents and canonical source, clarifications, and impacted category review/client preview. Rare configuration moves to `/projects/[id]/settings`, including editorial profile, working language, board/Notion connections, meeting link, and locale preferences. Existing team management stays separate. Client routing and client category reading remain unchanged.

The workspace API returns a single role-gated summary with client visibility, document stages, source head, clarification counts, category target/validated/published states, active operations, and actionable failure codes. Detail endpoints paginate source items/provenance and drafts. Provider/model names and raw diagnostics never appear in contributor or client contracts.

**Rationale**:

- The current project page interleaves resources, draft queue, team, connections, meeting, and preferences, while resource hooks never poll.
- The UI should answer three questions at a glance: what changed, what needs me, and what the client sees.
- Dedicated detail views allow all material clarifications without making the overview unscannable.

**Alternatives considered**:

- **Keep adding rows to the current settings-like project page**: rejected because it preserves the fragmented workflow identified in the UX audit.
- **Separate screen for every state**: rejected because it makes status harder to reconstruct.

## Decision 12 — Use a controlled staged documentary reset and retirement

**Decision**: Do not attempt to delete R2 objects from a Prisma migration. Use a staged transition coordinated by a singleton `DocumentaryTransitionState` (`legacy|resetting|canonical`). The preparatory migration idempotently inserts exactly one fixed `documentary-transition` row in `legacy` mode and enforces singleton uniqueness. Services never synthesize a missing default: if the row cannot be loaded, every legacy documentary write and sweep fails closed and the reset command aborts. The preparatory release makes every legacy mutation and scheduled sweep acquire/check the same transition lock before external or database writes. A dry-run remains read-only and produces an inventory digest. After explicit approval, the confirmed command then:

1. acquires the exclusive PostgreSQL reset/mutation lock, validates the approved digest, switches to `resetting`, and waits for older guarded mutations to finish;
2. aborts and requires a new dry-run if the inventory changed before the freeze;
3. reads the frozen inventory and deletes each stored original, treating an already-absent key as success;
4. records every per-item success/failure and emits the same machine-readable report;
5. after storage is clean, transactionally purges legacy documentary rows in foreign-key dependency order while preserving accounts/projects/memberships/invitations/connections/tasks and reset audit tables;
6. rechecks zero legacy rows, zero pending/failed manifest items, and no in-flight legacy mutation before switching to `canonical` and marking the run clean;
7. remains `resetting` with non-zero exit on any failure so retry is safe and legacy writes stay disabled.

Only then may an additive Prisma migration create the replacement documentary domain. The reset-empty legacy tables and Prisma models remain temporarily so intermediate reviewable slices still compile; state `canonical` permanently blocks their runtime mutation and the new workflow never reads, converts, or dual-writes them. After every route and consumer has moved, one release removes the legacy API module, frontend feature, compatibility exports, scheduled services, and tests while deliberately keeping the empty Prisma models/tables. After that release is healthy and every older Railway instance is drained, a separate release applies the final migration. It fails unless the transition is `canonical`, the reset is clean, all manifest items are terminal-success, and every legacy table is empty. `User`, `Project`, `ProjectMember`, `Invitation`, `BoardConnection`, `NotionConnection`, task-tracking data, and the content-free reset report remain untouched. Neither reset nor final drop is an automatic command on every application start, and `speckit-implement` is limited to local Docker PostgreSQL plus a non-production R2 namespace. Railway reset, drain, deployment, and final drop require a separate explicit operator approval.

The compatibility floor is monotonic. Before reset, all instances must run the guard-aware release. From the first `resetting` transition until recovery, the only safe strategy is roll-forward; an older unguarded build must never be redeployed. After `canonical`, rollback is allowed only to a transition-aware build that refuses every legacy write. After the runtime-removal release, a rollback build may still coexist with retained empty legacy tables only if it respects that guard. After the final schema drop, rollback is restricted to builds that contain no legacy Prisma/schema references. The operator runbook records the minimum compatible build at each checkpoint and turns an incompatible rollback into a failed precondition rather than an operational option.

**Rationale**:

- Database migrations cannot atomically coordinate PostgreSQL and R2.
- A versioned, reportable command makes unavoidable partial external deletion visible and safely retryable.
- Dry-run plus a narrow confirmation token prevents accidental broad deletion.

**Alternatives considered**:

- **Delete database rows in the migration and best-effort R2 afterward**: rejected because lost keys would leave untracked objects.
- **Run reset automatically on every deploy**: rejected as dangerously broad once new documentary data exists.
- **Convert legacy data**: explicitly out of scope; the user chose an empty documentary start.

## Decision 13 — Preserve current file limits and source adapters for the first iteration

**Decision**: Keep the current 25 MB upload limit and accepted PDF, DOCX, PNG, and JPEG types, plus one-time Notion-page snapshots. Preserve originals in R2 and use short-lived contributor-only download URLs. Adapter-neutral input preparation reuses the current image normalization and DOCX extraction behavior; provider adapters handle native PDF/image syntax. Continuous Notion synchronization remains out of scope.

**Rationale**:

- The feature changes documentary semantics, not the accepted-input promise.
- Retaining known limits keeps risk bounded while the canonical model is evaluated.

**Alternatives considered**:

- **Raise limits/add formats now**: no evidence of need and increases token/storage variability.
- **Flatten originals permanently into one generated file**: loses fidelity and violates original preservation.

## Resolved Technical Context

There are no remaining `NEEDS CLARIFICATION` items for planning. Exact production model IDs and route ordering are deployment configuration, not product behavior; the implementation will ship validated samples and tests with fake adapters. Pricing and billing policy remain out of scope.
