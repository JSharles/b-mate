# Phase 0 Research: Vulgarize the Current Task with AI

## Decision 1: LLM provider and model

**Decision**: Anthropic Claude, model `claude-haiku-4-5`, via the official `@anthropic-ai/sdk` TypeScript SDK. Structured output forced via tool-use (a single tool whose input schema mirrors `vulgarization-output.schema.ts`), not free-text parsing.

**Rationale**: The payload per call is tiny (one task title + a short description, twice per changed item for `en`/`fr`) — at this size the cost difference between a small and a large model is negligible in absolute terms, so the deciding factor is instruction-following reliability on a short, tightly-constrained rewrite, not price. Haiku 4.5 is Anthropic's current fast/cheap tier and is expected to handle this bounded a task reliably. No other AI vendor is yet present in this codebase, so introducing exactly one keeps the surface small.

**Alternatives considered**:
- **Claude Sonnet 5**: Higher quality ceiling, same negligible per-call cost at this payload size. Rejected only as the *starting* point — recommended as the first, trivial fallback (a one-line model-name change in `AnthropicVulgarizationClient`, no architecture change) if evaluation against real ticket examples shows Haiku's output is unreliable.
- **OpenAI / another vendor**: Would add a second AI vendor and a second SDK for no established benefit over Anthropic here; rejected for this iteration.
- **LangChain/LangGraph wrapping the call**: Rejected — this is a single, stateless, one-shot call with a fixed prompt and a schema-validated structured response, exactly what the official SDK already does directly. LangChain's value (multi-step chains, multi-provider abstraction, retrieval orchestration) doesn't apply here; it would add a dependency and an indirection layer for no benefit. Revisit only if a future feature genuinely needs multi-step orchestration or provider-swapping.

## Decision 2: Trigger mechanism (write-path scheduling)

**Decision**: A NestJS `@Cron` job (via `@nestjs/schedule`), running every 5 minutes, sweeping every project that has a `BoardConnection`.

**Rationale**: FR-003/FR-010 require that no frontend request can ever trigger a GitHub fetch or an LLM call — this rules out any on-demand or TTL-lazy-on-read scheme (both would occasionally couple an LLM call to a request). A fixed schedule, fully decoupled from any request, is the only option consistent with that constraint. 5 minutes balances freshness (SC-003's "within one processing cycle") against GitHub API and LLM usage; it is a single constant in the service, trivial to retune later without any structural change.

**Alternatives considered**:
- **Frontend polling driving an on-demand backend refresh** (the approach recommended for `specs/006` alone, before this feature existed): rejected once FR-003 was tightened — `specs/006` never called an LLM, so coupling its fetch to a request was harmless; doing the same for vulgarization would violate FR-003 directly.
- **Webhooks from GitHub** (`projects_v2_item` event): confirmed via GitHub's own documentation to be organization-level only — unusable for a personal/user-owned board, which this product must support. Rejected, as already established for `specs/005`'s equivalent PAT-scoping finding.
- **A shorter or longer interval** (e.g. 1 minute or 15 minutes): rejected as the starting point in favor of 5 minutes — no data yet on real usage patterns to justify either extreme; easy to change once real usage is observed.

## Decision 3: Stable item identity for change detection

**Decision**: Key `VulgarizedTask` rows on `(projectId, githubItemId, locale)`, where `githubItemId` is the GraphQL global node `id` of the `ProjectV2Item` itself (not the underlying Issue/PR/DraftIssue's own `id`). `GithubProjectsClient.fetchInProgressItems`'s query is extended to select `id` on each `items.nodes` entry.

**Rationale**: The `ProjectV2Item` id identifies "this content's placement on this specific board," which is what the feature actually tracks (specs/006 already iterates these nodes) — using it directly avoids a second lookup and matches the granularity `specs/006` already established.

**Alternatives considered**:
- **Keying on the content's own Issue/PR node id**: would conflate "the same underlying GitHub issue" with "the same board item," which is usually equivalent but not guaranteed (e.g. an issue removed and re-added to the board would be a new `ProjectV2Item` pointing at the same Issue). Rejected as unnecessary complexity for no observed benefit.
- **Keying on title text alone**: rejected — two different items could coincidentally share a title, and this is the exact field the feature needs to detect changes on, not use as an identity key.

## Decision 4: Change-detection and failure semantics

**Decision**: `originalTitle`/`originalDescription` and `vulgarizedTitle`/`vulgarizedDescription` are only ever written together, atomically, on a successful vulgarization call. A failed call updates neither — it leaves the row exactly as it was after the last success (or leaves no row at all, if there has never been one).

**Rationale**: This is what makes FR-004/005/007 correct simultaneously. If a failed attempt updated `originalTitle`/`originalDescription` to the newly-fetched (but unvulgarized) content, the next sweep's change-detection would compare against that value, see no difference, and never retry — silently freezing the item on stale, previously-vulgarized text forever. Leaving the whole row untouched on failure guarantees every subsequent sweep keeps comparing against the same last-known-good baseline and keeps retrying until it succeeds.

**Alternatives considered**:
- **Updating `original*` on every fetch regardless of vulgarization outcome, with a separate `lastAttemptedContent` field to compare against**: functionally equivalent but adds a field and a second comparison path for no behavioral difference. Rejected as unnecessary complexity.

## Decision 5: Locale selection on the read path

**Decision**: `GET /projects/:projectId/current-task` accepts an optional `locale` query parameter (`en` | `fr`); missing or invalid values default to the app's default locale (`fr`, per `apps/web/i18n/routing.ts`). The frontend's `useCurrentTask` hook reads the active locale via next-intl's `useLocale()` and passes it explicitly — this is a normal query parameter, not content negotiation via `Accept-Language`, keeping the contract explicit and easy to test.
