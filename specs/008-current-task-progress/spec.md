# Feature Specification: Current Task Progress

**Feature Branch**: `[008-current-task-progress]`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Le composant client 'Tâche en cours' affiche aujourd'hui uniquement le titre et la description vulgarisés de l'item GitHub Projects v2 en cours. L'utilisateur souhaite enrichir ce composant avec : la date à laquelle la tâche a été commencée, une estimation de la date de fin, et un indicateur de progression visuel (barre de progression). Décision déjà actée : le backend vérifie d'abord si l'item GitHub Projects v2 a des champs personnalisés fournissant une date de début et une estimation ; si absents, b-mate calcule un fallback (date de première détection en cours + estimation calculée par b-mate)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Client sees when work on their task actually started (Priority: P1)

A client viewing the "Current Task" card wants to know how long their developer has been working on the task currently in progress, so they can judge whether things are moving at a reasonable pace instead of wondering silently.

**Why this priority**: This is the most foundational piece of transparency being added — a start date alone (even without an estimate) already answers the client's core anxiety ("is anyone actually working on this, and since when?"), addressed as a critique finding in specs/007's follow-up work (no freshness signal on the page).

**Independent Test**: Can be fully tested by connecting a board, marking an item "in progress" with no custom start-date field set, and confirming the client-facing card shows the date b-mate first detected that item as in-progress — deliverable on its own even before the estimate/progress-bar pieces exist.

**Acceptance Scenarios**:

1. **Given** the developer's GitHub Projects v2 item has a custom field the system recognizes as a start date, populated with a value, **When** the client views the Current Task card, **Then** the card shows that board-provided start date.
2. **Given** the developer's GitHub Projects v2 item has no such field (or it's empty), **When** b-mate first detects the item as "in progress", **Then** b-mate records that moment as the task's start date and shows it to the client from then on, even across later sweeps where the item's content changes but it remains the same item.
3. **Given** a task has been showing a fallback (b-mate-detected) start date, **When** the developer later adds/fills in a real start-date field on the board, **Then** the client-facing card switches to the board-provided date on the next sweep (board data always wins once available).

---

### User Story 2 - Client sees an estimated completion and a progress indicator (Priority: P2)

A client wants a sense of how much of the current task is left, via an estimated completion date and a simple visual progress indicator, so the "current task" view feels like active tracking rather than a static snapshot.

**Why this priority**: Builds directly on User Story 1's start date — a progress indicator is meaningless without a start date and an end estimate to measure against. Secondary to shipping the start date alone, but the two together are what make "progress" the operative word in the feature name.

**Independent Test**: Can be tested by taking a task with a known start date and a known estimate (board-provided or fallback) and confirming the client-facing card shows both a plain-language estimated-completion date and a progress bar whose fill percentage matches elapsed-time-over-estimated-duration.

**Acceptance Scenarios**:

1. **Given** a task has both a start date and an estimate (from either source), **When** the client views the card, **Then** it shows a plain-language estimated completion date and a progress bar reflecting elapsed time against the estimated total duration.
2. **Given** a task has a start date but no estimate available from either source, **When** the client views the card, **Then** the card shows the start date without a progress bar or estimated completion date, rather than a misleading or broken indicator.
3. **Given** elapsed time already exceeds the estimated duration (task running over), **When** the client views the card, **Then** the progress indicator communicates "running longer than estimated" rather than silently capping at 100% as if finished.

---

### User Story 3 - Board-provided data always takes precedence over b-mate's own estimate (Priority: P3)

A developer who explicitly maintains start-date/estimate fields on their GitHub Projects v2 board wants those values to be what the client sees — b-mate's own fallback estimate should only ever fill a gap, never override real data the developer entered.

**Why this priority**: This is a trust/correctness guarantee rather than new visible functionality on its own (it's implicitly exercised by User Story 1 and 2's acceptance scenarios) — called out separately because it's the constraint most likely to regress silently if not tested explicitly.

**Independent Test**: Can be tested by setting a board-provided start date/estimate that would produce a visibly different result than b-mate's own fallback calculation, and confirming the client-facing values always match the board's numbers, never b-mate's guess, whenever the board data is present.

**Acceptance Scenarios**:

1. **Given** a board provides only a start date but no estimate, **When** the client views the card, **Then** the start date shown is the board's value and the estimate (if shown at all) is b-mate's own fallback — the two sources combine per-field, not all-or-nothing.
2. **Given** a board provides a "Target date" field, **When** the client views the card, **Then** the estimated completion date shown is that field's value directly, without involving the numeric "Estimate" field at all.
3. **Given** a board has no "Target date" but has a numeric "Estimate" field, **When** the client views the card, **Then** the estimated completion date is computed as the start date plus that number, interpreted in whatever unit the developer configured for that board connection (days, by default).

---

### User Story 4 - Client sees how much to trust the estimate (Priority: P2)

A client looking at an estimated completion date wants to know how much weight to put on it — an estimate typed in by the developer for a task the AI reads as simple is a very different thing from an AI guess on a task it reads as complex, and presenting both identically would be misleading.

**Why this priority**: Directly tied to User Story 2 — an estimate without any signal of its reliability risks being read as a hard promise rather than a rough guide, which the "never fabricate confidence" product principle (docs/PRODUCT.md) argues against.

**Independent Test**: Can be tested by producing the four source/complexity combinations below and confirming the confidence level shown to the client matches the matrix in FR-003a, independent of the other pieces of this feature.

**Acceptance Scenarios**:

1. **Given** the developer's board provides the estimate, and the AI reading the task's own content judges it simple, **When** the client views the card, **Then** the estimate is shown with a high-confidence indicator.
2. **Given** the developer's board provides the estimate, and the AI judges the task complex, **When** the client views the card, **Then** the estimate is shown with a medium-confidence indicator.
3. **Given** no board estimate exists so the AI itself supplies one, and the AI judges the task simple, **When** the client views the card, **Then** the estimate is shown with a medium-confidence indicator.
4. **Given** no board estimate exists so the AI itself supplies one, and the AI judges the task complex, **When** the client views the card, **Then** the estimate is shown with a low-confidence indicator.

---

### Edge Cases

- What happens when a task's GitHub item is edited (title/description changed) but it remains the same in-progress item? The recorded start date (whether board-provided or b-mate-detected) MUST NOT reset — it's tied to the item's identity, not its content. The AI-supplied estimate and complexity judgment, however, MAY be recomputed on a genuine content change, the same way vulgarized title/description already are (specs/007 change-detection).
- What happens if the board's custom field for start date/estimate exists but holds a value in an unexpected type or format (e.g., a text field instead of a date field)? System MUST treat it as absent and fall back, rather than failing the whole sweep.
- What happens if the AI-supplied estimate and the AI-supplied complexity judgment disagree in a way that produces an implausible date (e.g., a "trivial" task estimated at three months)? Out of scope for this spec to prevent — the confidence indicator (User Story 4) is the intended signal for the client to weigh a questionable estimate, not a validation layer that second-guesses the AI's own numbers.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST check the connected GitHub Projects v2 item for start-date and estimate custom fields, and use their values when present and validly typed.
- **FR-002**: System MUST fall back to a b-mate-recorded start date — the moment the item was first observed as "in progress" — whenever the board does not provide a valid start date for that item.
- **FR-003**: System MUST fall back to an AI-supplied estimated completion date, produced from the task's own title/description content, whenever the board does not provide a valid estimate for that item — no historical-average or fixed-default calculation is used.
- **FR-003a**: System MUST also obtain, alongside every AI-supplied estimate, the AI's own judgment of the task's complexity (simple or complex), and MUST derive a confidence level for the estimate shown to the client from the combination of (a) whether the estimate came from the board or the AI and (b) that complexity judgment, per this fixed matrix:

  | Estimate source | AI complexity judgment | Confidence shown |
  |---|---|---|
  | Board-provided | Simple | High |
  | Board-provided | Complex | Medium |
  | AI-supplied | Simple | Medium |
  | AI-supplied | Complex | Low |

  The complexity judgment MUST always be produced (even when the board supplies its own estimate), since it is one input to this matrix regardless of estimate source. "Board-provided" covers both tiers of FR-004's resolution order that originate from the board itself ("Target date" or "Estimate" + unit) — only the final AI-supplied tier counts as "AI-supplied" for this matrix.
- **FR-004**: The two data points (start date, estimate) MUST be resolved independently — a board-provided value for one does not require a board-provided value for the other; each field falls back on its own. The estimated completion date specifically resolves through three tiers in order: "Target date" field, then "Estimate" field (converted via FR-005b's unit), then the AI-supplied estimate (FR-003) — the first valid value found wins.
- **FR-005**: System MUST look for GitHub Projects v2 custom fields named exactly "Start date" and "Target date" (case-insensitive) to source the board-provided start date and estimated completion date, respectively.
- **FR-005a**: When "Target date" is absent or invalid but a numeric "Estimate" field is present and valid, System MUST fall back to computing the estimated completion date as the start date plus the estimate value interpreted in a configurable unit (see FR-005b) — before falling back further to an AI-supplied estimate (FR-003).
- **FR-005b**: The unit "Estimate" values are interpreted in (e.g., days, hours) MUST be a setting the developer configures (scoped to the board connection), defaulting to days when unset.
- **FR-006**: System MUST preserve a task's recorded start date across content edits to the same underlying board item (title/description changes do not reset it).
- **FR-007**: System MUST expose to the client, for the current in-progress task: a start date, an estimated completion date (when available), a confidence level for that estimate (when the estimate is shown), and a progress percentage (when both a start date and an estimate are available).
- **FR-008**: System MUST represent "no estimate available" as a distinct state on the client-facing card (no progress bar / no estimated-completion date shown), never as a misleading 0% or a broken bar.
- **FR-009**: System MUST represent a task running past its estimated completion as a distinct visual/textual state, not as a silently capped 100% bar that reads as "finished."
- **FR-010**: All dates and progress language shown to the client MUST render in the client's active locale (en/fr), consistent with the rest of the Current Task card (specs/007).
- **FR-011**: Progress percentage MUST be computed as elapsed time since the start date, divided by the total estimated duration (start date to estimated completion date), expressed as a percentage.

### Key Entities *(include if feature involves data)*

- **Tracked task start**: The moment a specific GitHub Projects v2 item was first observed as "in progress" by b-mate, keyed to that item's stable identity (not its content) — the fallback source for start date.
- **Task estimate**: A completion date for the current task, resolved through three tiers in order — the board's "Target date" field, the board's "Estimate" field (a number, converted via the connection's configured unit), or an AI-supplied estimate when the board provides neither.
- **Estimate unit setting**: A per-board-connection configuration value (e.g., days, hours) the developer sets to specify how their board's numeric "Estimate" field should be converted into a duration. Defaults to days.
- **Estimate confidence**: A high/medium/low judgment of how much to trust the shown estimate, derived from the combination of the estimate's source (board vs. AI) and the AI's own complexity judgment of the task (simple vs. complex) — see FR-003a's matrix. Always recomputed alongside the estimate, never independently stored or edited.
- **Progress indicator**: A derived, display-only value (percentage + a distinct "no estimate" / "running over" state) computed from a task's start date and estimate — never stored as its own source of truth, always recomputed from the two underlying dates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client viewing any in-progress task can see how long ago it started, without needing to ask the developer, for 100% of tasks tracked by a connected board (via board data or the b-mate fallback — never blank).
- **SC-002**: When an estimate is available (from either source), a client can tell at a glance, without reading any text, roughly what fraction of the estimated time has elapsed, via the progress indicator.
- **SC-003**: A task with no estimate available never shows a misleading or broken progress indicator — 100% of "no estimate" cases render the distinct no-estimate state defined in FR-008.
- **SC-004**: When a developer explicitly maintains start-date/estimate fields on their board, the client-facing values match the board's values exactly, not b-mate's own fallback calculation, for 100% of such tasks.
- **SC-005**: Every estimate shown to a client is accompanied by a confidence level, so a client is never presented with a number that looks equally certain regardless of where it came from.

## Assumptions

- The GitHub Projects v2 connection already in place (specs/005-github-project-connection) is reused as-is; no new connection/auth flow is introduced.
- "Estimate" here means an estimated *completion date* for the single current task, not a story-point/effort-sizing concept — consistent with how the user described it ("estimation de la date de fin"). The board's own "Estimate" field is a number with a developer-configured unit (FR-005b), used only to compute a date; it is never shown to the client as a raw number.
- The "Estimate" unit setting only supports simple duration units (days, hours) for this iteration — story-point/Fibonacci-style values aren't directly convertible to a duration without a separate points-to-days mapping, which is out of scope here.
- The AI-supplied estimate and complexity judgment are produced by the same LLM step that already vulgarizes each task's title/description (specs/007), reusing that existing call rather than introducing a second one — this is an implementation detail for the planning phase, not a spec commitment, but it shapes what's realistic to ask the AI for in a single pass.
- No historical-duration tracking is introduced by this feature — the AI-supplied estimate replaces the originally-proposed "average of past tasks" approach entirely, which also removes the "first tracked task, no history" edge case from consideration.
- The progress bar is a purely derived, read-only display element; it is never stored as its own value and never editable from within b-mate, consistent with the feature description's explicit scope boundary.
- This feature only concerns the single current in-progress task shown on the client-facing project page — it does not introduce any project-wide roadmap, timeline, or multi-task view (explicitly out of scope, matching docs/PRODUCT.md's existing "Roadmap, milestones, Gantt charts" exclusion).
- Locale-aware date formatting reuses the existing locale plumbing already established for the Current Task card (specs/007) rather than introducing new i18n infrastructure.
