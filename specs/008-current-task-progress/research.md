# Phase 0 Research: Current Task Progress

## Decision 1: A new, locale-independent table — not an extension of `VulgarizedTask`

**Decision**: Progress data (start date, board-provided target date/estimate, AI-supplied estimate, AI complexity judgment) lives in a new `TaskProgress` table, keyed uniquely on `(projectId, githubItemId)` — no `locale` column.

**Rationale**: Everything this feature adds is language-independent — a start date, an estimated completion date, and a complexity judgment don't need translating. `VulgarizedTask` is keyed on `(projectId, githubItemId, locale)` specifically because vulgarized *text* does vary by locale. Storing progress data there too would mean two rows per item (one per supported locale) carrying what should be a single value, and — worse — the AI complexity/estimate call would need to run twice per item (once per locale sweep pass) with no guarantee the two runs agree, directly undermining FR-003a's confidence matrix (the AI's complexity judgment must be one consistent value per item, not one per locale).

**Alternatives considered**:
- **Add nullable columns to `VulgarizedTask`**: rejected for the duplication/inconsistency reason above.
- **Store progress data on `BoardConnection`**: rejected — a connection covers the whole board, but progress is per in-progress *item*; a project's connection can (rarely) have more than one in-progress item at once, and each needs its own start date/estimate.

## Decision 2: The AI estimate/complexity call is separate from the vulgarization call

**Decision**: A new `estimateTask()` method, added to the existing `AnthropicVulgarizationClient`, is called once per item per sweep (not once per locale) — independent of `vulgarize()`, which still runs once per locale.

**Rationale**: The feature spec's own Assumptions section floated reusing the vulgarization call, but flagged that explicitly as a planning-phase decision, not a commitment. Decision 1 above already establishes that complexity/estimate must be computed once per item, not once per locale — `vulgarize()` is structurally a per-locale call (it returns locale-specific title/description text), so bolting a locale-independent judgment onto it would either run redundantly per locale (cost, and a real risk of the model returning different complexity verdicts on different calls for the same task) or require awkwardly restructuring `vulgarize()` to special-case one locale as "the one that also asks for complexity." A separate, single call per item avoids both problems and keeps each call's responsibility singular (translate vs. estimate).

**Alternatives considered**:
- **Piggyback on the `en` locale's `vulgarize()` call**: rejected — couples two orthogonal concerns, and silently breaks if `en` is ever removed from `SUPPORTED_LOCALES` or reordered.
- **A second Anthropic client class**: rejected as unnecessary — `estimateTask()` reuses the exact same SDK client instance and model constant as `vulgarize()`; a second class would duplicate that wiring for no benefit.

## Decision 3: The AI is asked for a duration, never an absolute date

**Decision**: `estimateTask()`'s tool schema returns `{ estimatedDurationDays: number, complexity: 'simple' | 'complex' }` — never an ISO date. The service computes the actual estimated completion date itself, server-side, as `resolvedStartedAt + estimatedDurationDays` days.

**Rationale**: LLMs have no reliable built-in sense of "today's date" and are prone to date arithmetic errors or drift when asked to reason about calendar dates directly. Asking for a relative duration (a number) sidesteps that entirely — the model only has to judge "how long will this take," which is squarely a content-understanding task, and date arithmetic (a single addition) is done in code where it's guaranteed correct.

**Alternatives considered**:
- **Ask the model for an absolute completion date directly**: rejected for the reliability reason above.
- **Ask for a duration in hours for finer granularity**: rejected as unnecessary precision for a "current task" card — days is consistent with how the board's own `Estimate` field is interpreted (Decision 5) and with the granularity a non-technical client actually needs.

## Decision 4: Final estimate resolution and storage — resolved once at write time, not read time

**Decision**: `TaskProgress` stores the *resolved* `estimatedCompletionAt` and `estimateSource` (`'board' | 'ai'`) directly, computed once during the sweep using the three-tier priority from spec.md FR-004 (`Target date` → `Estimate` field + unit → AI duration). `aiComplexity` is stored separately and always populated whenever the AI call succeeds, regardless of whether its estimate ends up being the one shown (FR-003a requires the complexity judgment even when the board supplies its own estimate).

**Rationale**: Mirrors `VulgarizedTask`'s existing pattern (`vulgarizedTitle`/`vulgarizedDescription` are resolved once at write time and read as-is) rather than introducing a second resolution algorithm that only runs at read time. `estimateSource` stored directly (rather than re-derived from raw board columns on every read) means the confidence matrix (FR-003a) is a simple, pure two-input lookup (`estimateSource`, `aiComplexity`) wherever it's evaluated — one clear place to test, not logic re-implemented at each read site.

**What is *not* stored**: the progress percentage itself. It depends on the current moment, not just on stored facts, so it is computed live in the frontend from `startedAt` + `estimatedCompletionAt` + `Date.now()` — the same pattern `current-task-card.tsx` already uses for its "Updated X ago" relative-time text (spec.md Assumptions: "never stored as its own source of truth").

## Decision 5: GitHub field names and the `Estimate` unit setting

**Decision**: `GithubProjectsClient`'s item query adds aliased `fieldValueByName` lookups for `"Start date"` and `"Target date"` (`ProjectV2ItemFieldDateValue`) and `"Estimate"` (`ProjectV2ItemFieldNumberValue`), matching the field names confirmed against the user's real GitHub Projects v2 board (spec.md FR-005). A new `estimateUnit` enum column (`days | hours`, default `days`) on `BoardConnection` lets the developer specify how their board's numeric `Estimate` field converts to a duration (FR-005b) — set at board-connection creation time, alongside the existing token/owner/board-number fields.

**Rationale**: These are the field names GitHub itself suggests by default when a developer creates a project from its built-in templates, and match what the user's board actually has. No per-connection UI is needed to *name* the fields (unlike the unit, which genuinely varies by developer convention). Scoping the unit setting to connection-creation time (rather than adding a new settings/edit screen) keeps this feature from introducing board-connection editing as a side quest — `board-connections.controller.ts` currently has no update endpoint at all (create/preview/delete only); adding one is out of scope here. A developer who needs to change it later can disconnect and reconnect, the same workaround already implied by the connection flow's current shape.

**Alternatives considered**:
- **Per-connection configurable field names** (developer picks which board field maps to "start date" etc.): rejected per the earlier chat exchange — the fixed names already match the real board in question, and this adds a config UI for a problem that hasn't been observed.
- **A `PATCH` endpoint to edit `estimateUnit` after connection**: deferred — no existing precedent for editing a connection post-creation; worth revisiting if the fixed-at-creation approach proves annoying in practice, but not blocking this feature.

## Decision 6: Change detection for the AI estimate call

**Decision**: `TaskProgress` keeps its own `lastEstimatedTitle`/`lastEstimatedDescription` snapshot (independent of `VulgarizedTask`'s per-locale copies) and only calls `estimateTask()` when the freshly-fetched title/description differ from that snapshot, or no successful call has ever completed for this item. A failed call leaves `aiComplexity`/the AI-tier `estimatedCompletionAt` untouched, exactly like `VulgarizedTask`'s existing failure semantics (specs/007 research.md Decision 4) — so the next sweep retries against the same baseline.

**Rationale**: Consistent, proven pattern already established for the sibling table; keeping a separate snapshot (rather than reusing `VulgarizedTask`'s) avoids a cross-table dependency between two tables that are otherwise fully independent, and avoids picking an arbitrary locale's copy to compare against.

## Decision 7: Row lifecycle matches `VulgarizedTask`

**Decision**: `TaskProgress` rows are deleted in the same sweep step that already clears stale `VulgarizedTask` rows — `deleteMany({ where: { projectId, githubItemId: { notIn: currentItemIds } } })`, run once per connection, for both tables.

**Rationale**: An item that leaves "in progress" must stop being served (same reasoning as specs/007) — reuses the already-verified `notIn: []`-matches-everything behavior rather than inventing new cleanup logic.
