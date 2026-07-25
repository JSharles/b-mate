# Feature Specification: Vulgarize the Current Task with AI

**Feature Branch**: `feat/current-task-ai-vulgarization`

**Created**: 2026-07-24

**Status**: Draft

**Input**: User description: "Une fois qu'une tâche 'en cours' est récupérée depuis un board GitHub Projects (v2) connecté (specs/006-current-task-fetch), le contenu réel (titre, description) doit être vulgarisé par une IA avant d'être affiché au client — conformément à la vision produit (docs/PRODUCT.md, § Positioning/Vision) qui prévoit explicitement cette couche IA comme itération suivante après l'affichage brut du contenu réel. Décision de flux déjà actée : le backend récupère la tâche depuis GitHub, stocke l'original en base, vulgarise immédiatement via un LLM (pas à la demande du frontend), stocke le résultat vulgarisé, et ne revulgarise que si le contenu original a changé depuis la dernière version stockée. Le frontend ne reçoit jamais que du contenu déjà vulgarisé."

## Positioning

This is the third concrete step of the "fetch layer" described in `docs/PRODUCT.md` (§ Positioning, § Vision), directly following `specs/006-current-task-fetch` (real GitHub content, shown as-is, explicitly deferring "no AI layer" as out of scope for that iteration). This feature delivers that deferred AI layer: the real board content is rewritten in plain language before a client ever sees it — the actual promise in `docs/PRODUCT.md`'s positioning ("translated into plain language, never jargon"). It does not change what counts as "in progress" or how items are fetched from GitHub — it adds a vulgarization and persistence step on top of the existing fetch.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Client sees a plain-language current task (Priority: P1)

A client on a project whose board is connected, viewing the "Current task" cartouche, sees the task's title and description rewritten in plain, non-technical language — not the raw GitHub text `specs/006-current-task-fetch` shows today.

**Why this priority**: This is the entire point of the AI layer promised in `docs/PRODUCT.md`'s positioning. Without it, the client still has to parse developer jargon themselves, which is exactly what b-mate exists to remove.

**Independent Test**: As a client-role member of a project with a connected board and an in-progress item whose GitHub title/description use technical language, open the project page; confirm the "Current task" cartouche shows a plain-language rewrite of that content, not the original GitHub text.

**Acceptance Scenarios**:

1. **Given** a project with a connected board and exactly one in-progress item with a technical title/description on GitHub, **When** a client opens the project page, **Then** they see a plain-language version of that title and description, not the original GitHub text.
2. **Given** the same item's GitHub content has not changed since it was last processed, **When** the system processes it again, **Then** the previously generated plain-language version is served unchanged — no new vulgarization is generated for unchanged content.
3. **Given** the same item's GitHub title or description changes on GitHub, **When** the system next processes it, **Then** a new plain-language version is generated from the updated content and replaces the previous one.
4. **Given** a project has clients using different app locales (`en` and `fr`), **When** each client opens the project page, **Then** each sees the plain-language version generated for their own locale.
5. **Given** vulgarization fails while processing a newly-changed item that already has a previously successful plain-language version stored, **When** a client opens the project page, **Then** they still see that last known plain-language version — not raw GitHub content, not an empty state.
6. **Given** vulgarization fails while processing an item that has never been successfully vulgarized, **When** a client opens the project page, **Then** they see the same clean "nothing in progress" state used for any other case with nothing to show.

---

### User Story 2 - Vulgarized content stays in sync with GitHub edits (Priority: P2)

When a developer edits an in-progress item's title or description on GitHub, the client-facing plain-language version stays in sync with that new content rather than continuing to describe the old wording indefinitely.

**Why this priority**: Without this, the AI layer would silently drift out of sync with reality the first time a developer edits a ticket — a trust-breaking bug, though secondary to the AI layer existing at all (US1).

**Independent Test**: Edit an in-progress item's description on GitHub after its plain-language version has already been generated once; after the system's next processing cycle, confirm the client sees a plain-language version reflecting the new description, not the old one.

**Acceptance Scenarios**:

1. **Given** an in-progress item already has a stored plain-language version, **When** its original GitHub title or description changes, **Then** the next processing cycle produces and stores a new plain-language version reflecting the change.

---

### Edge Cases

- What happens the very first time an in-progress item is seen, before any plain-language version has ever been generated for it? Same clean "nothing in progress" state as `specs/006-current-task-fetch` until the first successful vulgarization completes — this feature does not introduce a distinct "processing…" state.
- What happens if the vulgarization step fails for a newly-changed item? If a previously successful plain-language version already exists for that item, it continues to be served (stale but real) until vulgarization next succeeds; if none has ever succeeded, the client sees the same clean "nothing in progress" state as any other case with nothing to show (FR-007).
- What happens when more than one item is "in progress" simultaneously (`specs/006` Edge Case)? Each item is processed and vulgarized independently — a failure or staleness on one item does not affect another.
- What happens if the underlying board connection itself is invalid or removed? Same clean "nothing in progress" state as `specs/006` — this feature does not introduce a new distinct error for that case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist, for each GitHub item detected as "in progress" (per `specs/006-current-task-fetch`'s detection rules), the original title and description content as fetched from GitHub.
- **FR-002**: The system MUST generate a plain-language ("vulgarized") rewrite of an in-progress item's title and description, and persist it alongside the original content, as part of the same fetch-and-store flow — never as part of handling a frontend read request.
- **FR-003**: Whenever the frontend requests the current task, the system MUST return only the persisted, already-vulgarized content. The request path MUST NOT trigger a new vulgarization call.
- **FR-004**: The system MUST detect whether a re-fetched item's original content (title, description) is identical to the last-stored original for that item, and MUST NOT regenerate the vulgarized version when it is identical.
- **FR-005**: The system MUST regenerate and re-store the vulgarized version whenever a re-fetched item's original content differs from the last-stored original.
- **FR-006**: The system MUST generate a vulgarized version of each in-progress item's title and description in every locale currently supported by the app's UI (today: `en` and `fr`), persisting one vulgarized version per item per locale. The frontend MUST be served the version matching its current locale.
- **FR-007**: When vulgarization fails for an item that already has a previously successful vulgarized version stored (in the locale being processed), the system MUST continue serving that last known vulgarized version until a new vulgarization succeeds. When vulgarization fails for an item that has never been successfully vulgarized before (in that locale), the system MUST fall back to the same clean "nothing in progress" state used elsewhere for cases with nothing to show.
- **FR-008**: This feature MUST NOT alter how "in progress" items are detected or fetched from GitHub — `specs/006-current-task-fetch`'s detection rules and read-only behavior are unchanged; this feature only adds a vulgarization and persistence step on top of that existing fetch.
- **FR-009**: This feature MUST NOT introduce any UI allowing a client to view the original, non-vulgarized content, or to manually trigger re-vulgarization.
- **FR-010**: The fetch-and-vulgarize cycle MUST run on a recurring, backend-scheduled basis, independent of any frontend request — no client viewing the project page MUST ever cause a fetch or vulgarization to run (reinforces FR-003).

### Key Entities *(include if feature involves data)*

- **Vulgarized Task Content**: The AI-rewritten version of one GitHub item's title and description in a given locale (one record per item per app-supported locale — currently `en` and `fr`), persisted alongside a copy of the original title/description it was generated from (used for change detection), and linked to the item's identity on the project's connected board. Retains its last successfully generated version even when a later regeneration attempt fails (FR-007).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client viewing the Current task cartouche sees plain-language content — never the developer's raw technical wording — for 100% of in-progress items that have been successfully processed at least once.
- **SC-002**: No vulgarization is regenerated for an item whose GitHub content has not changed since it was last processed — repeated processing cycles over unchanged content produce zero additional AI-generation calls for that item.
- **SC-003**: A GitHub content change to an in-progress item's title or description is reflected in the client-facing plain-language version within one processing cycle — the same "as fresh as last processed" guarantee `specs/006` already sets for raw fetches.
- **SC-004**: A client viewing the Current task cartouche in either of the app's supported locales (`en`, `fr`) sees the vulgarized content in that same locale, never a mismatched language.

## Assumptions

- This feature builds directly on `specs/006-current-task-fetch`'s item detection and GitHub read; it does not change what counts as "in progress" or how items are fetched.
- The fetch-and-vulgarize cycle is driven by a recurring backend schedule (FR-010), decoupled from any frontend request — this follows directly from FR-003 (no LLM call may ever occur in the frontend's request path), which rules out an on-demand/TTL-based trigger tied to page views. The exact cadence (e.g. every N minutes) is a tuning detail left to the planning phase (`research.md`), not resolved here.
- The specific AI provider/model used to generate the vulgarized content is a technical implementation decision, not a product-facing one, and is deferred to the planning phase (`research.md`) rather than resolved in this spec.
- The set of locales vulgarized into follows the app's currently supported UI locales (`en`, `fr`). Adding a new supported app locale in the future would need this feature explicitly extended to it — not treated as automatic.
- "Vulgarization" means a plain-language rewrite of real GitHub content (title, description) — never fabricated information beyond what GitHub already contains. `specs/006`'s "no AI-driven summarization/fabrication" framing is superseded for this feature specifically, which reintroduces AI deliberately, but strictly as a rewording layer over real content, never inventing facts absent from the original.
- Multiple simultaneously in-progress items (`specs/006` Edge Case) are each vulgarized and cached independently.
