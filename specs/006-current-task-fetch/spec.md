# Feature Specification: Show the Real Current Task from a Connected Board

**Feature Branch**: `feat/github-task-fetch`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Une fois qu'un board GitHub Projects (v2) est connecté à un projet, le client doit voir la vraie 'tâche en cours' du projet dans le cartouche 'Current task' existant — au lieu du texte statique actuel. On affiche le contenu réel de l'item GitHub (titre, description) tel quel côté client, sans reformulation par IA. Hors scope : le cartouche Roadmap, toute traduction/vulgarisation par IA, toute écriture vers GitHub, les autres cartouches placeholder. Comment savoir ce qui est 'en cours' : détection automatique par convention — le champ à choix unique par défaut de GitHub Projects v2 s'appelle 'Status' et sa valeur par défaut pour le travail en cours est 'In Progress' (c'est ce qui alimente la colonne du même nom dans la vue Board) ; pas de configuration manuelle par le développeur pour cette itération."

## Positioning

This is the second concrete step of the "fetch layer" described in `docs/PRODUCT.md` (§ Positioning, § Vision), building directly on the board connection shipped in `specs/005-github-project-connection`. It delivers the first of the two client-facing surfaces that vision names ("the task currently in progress"); the second ("roadmap") is explicitly a separate, later piece of work. This feature shows the real board content as-is — the actual item title and description GitHub already has — with no AI-driven rewording or simplification; that layer is deliberately deferred (`docs/PRODUCT.md` lists "no AI layer" as out of scope for now).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Client sees the real current task (Priority: P1)

A client on a project whose board is connected opens the project page and sees the actual task(s) currently being worked on — not a placeholder — with zero setup required from the developer beyond having already connected the board (`specs/005-github-project-connection`).

**Why this priority**: This is the entire point of the feature — without it, connecting a board has no visible payoff for the audience the whole product exists to serve.

**Independent Test**: As a client-role member of a project with a connected board that has at least one item whose "Status" field is set to a value containing "In Progress," open the project page; confirm the "Current task" cartouche shows that item's real title and description — not the static placeholder text.

**Acceptance Scenarios**:

1. **Given** a project with a connected board that has a "Status" field and exactly one item with that field set to an "In Progress"-like value, **When** a client opens the project page, **Then** they see that item's real title and description in the "Current task" cartouche.
2. **Given** the same setup but the matching item has no description on GitHub, **When** a client opens the project page, **Then** they see the title with no fabricated or placeholder description text.
3. **Given** a project with no board connected at all, **When** a client opens the project page, **Then** they see the same "nothing in progress" clean state as any other case with nothing to show (FR-005) — not the prior static placeholder text, and not an error.
4. **Given** a connected board whose items are all in a "Status" state other than "In Progress" (e.g. everything is "Todo" or "Done"), **When** a client opens the project page, **Then** they see a clear "nothing in progress" state, not an error.
5. **Given** a connected board that has no "Status" field at all (renamed or removed by the developer), **When** a client opens the project page, **Then** they see the same clean "nothing in progress" state — this feature does not ask the developer to restore or rename anything.

---

### Edge Cases

- What happens when *more than one* item is set to an "In Progress"-like value at the same time? All matching items are shown (as a short list), rather than arbitrarily picking one and hiding the rest — showing an incomplete picture would be misleading (see FR-003, Assumptions).
- What happens when the board connection itself becomes invalid (e.g., the stored token was revoked on GitHub's side, per the edge case already noted in `specs/005-github-project-connection`)? The client sees the same "nothing in progress" state as the no-match case, rather than a distinct error — this feature does not introduce a new broken-connection message; that is a `specs/005` concern.
- What happens if the developer's board uses a "Status"-like field but names it something else entirely (e.g. "Progress," "État," a fully custom name), or uses values that don't literally contain "In Progress" (e.g. "Doing," "En cours")? This feature does not detect those — falls into the same clean "nothing in progress" state. Broadening detection beyond GitHub's own default convention is explicitly out of scope for this iteration (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect "in progress" work automatically, by convention, using GitHub's own default Projects (v2) setup: a single-select field named "Status" (case-insensitive match), and any of its option values whose name contains "In Progress" (case-insensitive match) — no developer configuration step is introduced by this feature.
- **FR-002**: The system MUST fetch, at the time a client views the project page, the board item(s) currently matching that convention, using the project's existing board connection (`specs/005-github-project-connection`) — no new credential or connection step.
- **FR-003**: The system MUST show all matching items (not an arbitrary single pick) if more than one currently matches.
- **FR-004**: The system MUST show each matching item's real title, and its real description if one exists, exactly as stored on GitHub — no AI-driven rewording, summarization, or simplification in this feature.
- **FR-005**: The system MUST show a clear "nothing in progress" state — not an error and not the prior static placeholder — whenever no board is connected at all, the board has no "Status" field matching the convention, the field exists but currently matches no item, or the board connection itself is unusable.
- **FR-006**: The system MUST NOT write, update, or otherwise modify anything on GitHub — this feature is read-only, consistent with `specs/005-github-project-connection`.
- **FR-007**: Visibility of the real "Current task" content MUST be limited to client-role project members, matching the existing placeholder's visibility; a developer/contributor's own view of the project page is unaffected by this feature (their cartouches remain what they are today).

### Key Entities

- No new persisted entity. This feature reads live from GitHub through the existing `BoardConnection` (`specs/005-github-project-connection`) and stores nothing new of its own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client on a project with a connected board (using GitHub's default "Status" field convention) sees the real, current task title (and description, when present) with zero setup from the developer beyond having connected the board.
- **SC-002**: 100% of the time no board is connected, the board has no matching "Status"/"In Progress" convention, or nothing currently matches, the client sees a clean, non-error, non-misleading state.
- **SC-003**: 100% of the content shown to a client under this feature is verifiably real GitHub content (title/description), never fabricated, summarized, or reworded text.

## Assumptions

- "Contributor" and "client" carry the same meaning as in `specs/003-rich-project-view` and `specs/005-github-project-connection` — this feature introduces no new role or permission concept, and no new contributor-facing UI at all (no configuration screen).
- Detection is intentionally limited to GitHub's own default convention (a field named "Status," a value containing "In Progress") for this iteration. A board that renames this field/value, or uses a different scheme entirely, simply shows "nothing in progress" rather than being detected some other way — broadening or making this configurable is explicitly deferred, not silently expanded here.
- Field-name and value-name matching is case-insensitive substring matching (e.g. "in progress", "🚧 In Progress" both match) — forgiving of minor cosmetic variation without attempting to guess beyond GitHub's own convention.
- When more than one item matches "in progress" at once, all matching items are shown as a short list rather than picking one arbitrarily (see Edge Cases) — a real, if less common, situation for a developer juggling more than one active task.
- The fetch happens live when a client views the project page (on-demand), not on a background schedule or via webhooks from GitHub — consistent with the read-only, on-demand nature of the board connection itself. Real-time push updates from GitHub are not part of this feature.
- No caching/staleness guarantee beyond "as fresh as the last time the page was viewed" is promised by this feature; a slow or unavailable GitHub API surfaces as the same "nothing in progress" state rather than a distinct loading-forever or error state, consistent with FR-005.
