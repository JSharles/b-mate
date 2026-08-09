# Feature Specification: Project Settings

**Feature Branch**: `012-project-settings`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Ajouter une page 'Project Settings' au niveau du projet, qui regroupe les connexions à des outils externes — actuellement dispersées et modélisées de façon incohérente — en un seul endroit cohérent et extensible pour de futurs types de settings. Migrer Board Connection GitHub et Notion Connection vers ces Settings. Le dialogue d'ajout de ressource renvoie vers Settings quand aucun token Notion n'est configuré, plutôt que de le demander en ligne."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer manages every external connection from one place (Priority: P1)

A developer wants to connect (or reconnect, or disconnect) their project's GitHub Projects board and/or Notion integration. Today these two connections live in two unrelated places with two different interaction patterns (a card on the project page for GitHub, an ad-hoc field buried inside the "Add a resource" dialog for Notion) — nothing on the project page signals that a "connections" concept even exists. Instead, the developer opens a single, dedicated Settings area for the project and manages both connections there, side by side.

**Why this priority**: This is the core of the feature — without a Settings destination, there's nothing to redirect to (User Story 2) and the current inconsistency persists. Everything else depends on this existing first.

**Independent Test**: Open a project's Settings as a contributor; confirm both the GitHub board connection and the Notion connection are visible and manageable (connect, view current connection, reconnect/disconnect) from this single screen, with no connection-management UI left on the main project page.

**Acceptance Scenarios**:

1. **Given** a project with no connections configured, **When** a contributor opens the project's Settings, **Then** they see both a GitHub board connection section and a Notion connection section, each clearly in a "not connected" state with a way to connect.
2. **Given** a project with a GitHub board already connected, **When** a contributor opens Settings, **Then** the board connection's current state (connected board, or "needs reconnect" if the authorization was revoked) is shown, exactly as it is today on the project page — only its location has moved.
3. **Given** a project with a Notion integration already connected, **When** a contributor opens Settings, **Then** the Notion connection's state is shown, with the ability to replace the stored token (e.g. after it was revoked in Notion).
4. **Given** the project's main page, **When** a contributor views it, **Then** no board-connection or Notion-connection management UI remains inline on that page — a link/indicator directs them to Settings instead.

---

### User Story 2 - Adding a Notion resource without a configured connection routes to Settings (Priority: P2)

A developer tries to add a resource by connecting a Notion page, but the project has no Notion integration configured yet. Instead of being asked to paste a token inline (today's behavior, which this feature removes), they see a clear explanation that a Notion connection must be set up first, with a direct link to the project's Settings.

**Why this priority**: Depends on User Story 1 (Settings must exist to link to it), and is the direct trigger the user identified for this whole redesign — but the feature already delivers its core value (a single, coherent connections screen) without this specific redirect wired up, so it can ship second.

**Independent Test**: As a contributor on a project with no Notion connection, open "Add a resource" → Notion, attempt to connect a page; confirm no token field is offered inline and a message with a working link to Settings appears instead.

**Acceptance Scenarios**:

1. **Given** a project with no Notion connection configured, **When** a contributor opens the Notion tab of "Add a resource", **Then** no token input field is shown — instead, a message explains that a Notion connection must be configured first, with a link to the project's Settings.
2. **Given** a project that already has a Notion connection configured, **When** a contributor opens the Notion tab of "Add a resource", **Then** they can add a resource by page URL alone (unchanged from the current, already-implemented behavior) — no re-prompt for a token, no redirect.
3. **Given** a contributor who follows the link from the "Add a resource" dialog to Settings and connects Notion there, **When** they return to "Add a resource", **Then** the Notion tab now behaves as in Scenario 2 (page-URL-only), without needing to reload in an unusual way beyond what the app already does when data changes elsewhere.

---

### User Story 3 - A developer can tell at a glance whether connections are configured, without opening Settings (Priority: P3)

From the main project page, a contributor can see a lightweight indicator of each connection's state (e.g. "Board: connected" / "Notion: not connected") that links into Settings, rather than having to open Settings just to check.

**Why this priority**: A convenience on top of User Stories 1–2, not required for the core redesign to deliver its value — Settings itself is fully usable without a summary shown elsewhere.

**Independent Test**: View a project's main page as a contributor; confirm a compact connections summary is visible and each part links into the corresponding section of Settings.

**Acceptance Scenarios**:

1. **Given** a project with the GitHub board connected and Notion not connected, **When** a contributor views the project's main page, **Then** a summary reflects both states accurately and links to Settings.

---

### Edge Cases

- What happens when a non-contributor (client role) or a non-member tries to reach a project's Settings directly (e.g. via a guessed URL)? Must be refused exactly like every other contributor-only surface in this app today (board connection, Notion connection, resource management) — the same not-found response as a nonexistent project, never a distinct "forbidden."
- What happens if the developer disconnects Notion (from Settings) while an in-progress Notion-sourced resource still references it? Existing resources and their content are unaffected — disconnecting only removes the ability to *add new* Notion resources without reconnecting; it does not retroactively touch already-created resources (consistent with how deleting a resource today never touches the project-level connection, and how GitHub board disconnection already works).
- What happens to the GitHub board connection's OAuth-initiated redirect flow (the developer is sent to GitHub and back) once it's launched from Settings instead of the project page? The redirect must return the developer to Settings, not to the old project-page location.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a dedicated Settings area for each project, distinct from the project's main page, reachable via its own route linked from the project's main page.
- **FR-002**: The system MUST let a contributor view and manage the project's GitHub Projects board connection (connect, reconnect, disconnect) from Settings — this reuses the connection logic that already exists today; only its presentation location changes.
- **FR-003**: The system MUST let a contributor view and manage the project's Notion connection (connect, replace/reconnect) from Settings — this reuses the connection logic and data model that already exist today; only its presentation location changes.
- **FR-004**: The system MUST remove the board-connection and Notion-connection management UI from the project's main page once Settings exists — these are no longer managed inline on that page (User Story 3's summary, if present, is a read-only indicator, not a management surface).
- **FR-005**: The "Add a resource" dialog's Notion tab MUST NOT collect a Notion integration token inline. When the project has no Notion connection configured, it MUST instead show only an explanatory message and a link to the project's Settings — no page-URL field or submit control is offered until a connection exists.
- **FR-006**: When the project already has a Notion connection configured, the "Add a resource" dialog's Notion tab MUST let a contributor add a resource by page URL alone, without asking for a token (already implemented; unaffected by this feature beyond removing the now-dead inline-token code paths).
- **FR-007**: Access to a project's Settings MUST be restricted to that project's contributors (any contributor, matching board/Notion connections' current individual access level — not restricted to admins) — a client-role member or a non-member MUST receive the same response as for a nonexistent project (consistent with FR-009 of specs/011 and the equivalent rule already applied to board/Notion connections).
- **FR-008**: The system's data model MUST associate connection settings with the project (not with an individual resource or user) — already true today for both `BoardConnection` and `NotionConnection`; this feature does not change that association, only where it is surfaced.
- **FR-009**: Settings MUST be structured so that a future, different kind of project-level setting can be added as its own section without requiring the connections already present to be redesigned.

### Key Entities

- **Board Connection**: The project's GitHub Projects board connection (existing entity, unchanged) — now presented within Settings instead of the project's main page.
- **Notion Connection**: The project's Notion integration connection (existing entity, unchanged, already project-scoped) — now presented within Settings instead of inside the "Add a resource" dialog.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor can find and manage both the GitHub board connection and the Notion connection without leaving a single screen.
- **SC-002**: Zero connection-management controls (connect/reconnect/disconnect for either GitHub or Notion) remain outside of Settings once this feature ships.
- **SC-003**: A contributor attempting to add a Notion resource with no connection configured reaches a working Notion connection in two navigation steps or fewer (open the link, connect).
- **SC-004**: No existing GitHub board connection or Notion connection is lost, broken, or requires re-authorization solely as a result of this feature's relocation of their UI.

## Assumptions

- Settings is scoped to a single project (there is no cross-project or account-level settings screen in this iteration).
- The underlying connection business logic (GitHub OAuth flow, Notion access verification, token encryption) is unchanged by this feature — only where each connection's UI is mounted and how a missing Notion connection is communicated during resource creation.
- User Story 3 (at-a-glance summary on the main project page) is a nice-to-have; if time-boxed out, Stories 1–2 alone still deliver the feature's core value.

## Clarifications

### Session 2026-08-08

- Q: Where should Settings live in the navigation? → A: A dedicated route (e.g. `/projects/[id]/settings`), reached via a link from the project's main page.
- Q: Who can access a project's Settings? → A: Any contributor (same access level board/Notion connections already have individually today) — not restricted to admins.
- Q: When no Notion connection exists, should the "Add a resource" Notion tab be fully disabled, or remain partially usable? → A: The tab shows only the explanatory message and the Settings link — no page-URL field or submit control is offered until a connection exists.
