# Feature Specification: GitHub Projects Board Connection

**Feature Branch**: `feat/github-project-connection`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Le développeur doit pouvoir connecter un projet b-mate à son board GitHub Projects (la version moderne "Projects" v2, pas l'ancienne "Classic Projects"). C'est la première étape du "fetch layer" décrit dans docs/PRODUCT.md — pas encore la traduction/vulgarisation côté client, juste la connexion du board. Ce chantier couvre uniquement : la connexion elle-même (associer un projet b-mate existant à un board GitHub Projects v2 existant), le stockage de cette connexion (quel repo/org, quel numéro de board), et la possibilité de déconnecter / reconnecter à un autre board. Hors scope : récupération réelle des tâches/issues et leur affichage, traduction/vulgarisation pour les clients, autres trackers (Jira, Linear, Trello, Notion)."

## Positioning

This is the first concrete step of the "fetch layer" described in `docs/PRODUCT.md` (§ Positioning, § Vision): b-mate connects to the developer's **existing** task board rather than requiring re-entry. This feature delivers only the *connection* — establishing and storing the link between a b-mate project and a GitHub Projects (v2) board. It deliberately does not fetch or display any task/issue content yet (that is a separate, future feature once the connection exists), and it does not touch the client-facing experience at all. Zero added process: the developer keeps using GitHub Projects exactly as they do today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a project to a GitHub Projects board (Priority: P1)

A developer working on a b-mate project that doesn't yet have a board connected wants to link it to the GitHub Projects (v2) board they already use to track that work.

**Why this priority**: This is the entire feature — without it, nothing else here has any value. It's also the direct, tangible replacement for the "Settings — Connect your board — coming soon" placeholder already shipped in `specs/003-rich-project-view`.

**Independent Test**: From a project's Settings area, a developer authorizes b-mate's access to their GitHub account/organization, selects one of their GitHub Projects (v2) boards, and confirms the connection. Reloading the project afterward shows that board as connected (e.g., its name/URL), not the placeholder.

**Acceptance Scenarios**:

1. **Given** a project with no board connected, **When** a developer (a contributor on that project) opens Settings, **Then** they see an option to connect a GitHub Projects board instead of the "coming soon" placeholder.
2. **Given** a developer has authorized b-mate's access to their GitHub account, **When** they pick one of their GitHub Projects (v2) boards and confirm, **Then** the project is linked to that board and Settings now shows it as connected.
3. **Given** a developer who has not yet authorized b-mate's access to GitHub, **When** they start the connect flow, **Then** they are guided through granting that access before they can pick a board.
4. **Given** a developer attempts to select a GitHub Projects board they do not actually have access to, **When** they try to connect it, **Then** the system rejects it and no connection is stored.

---

### User Story 2 - See which board is connected (Priority: P2)

Anyone who can see a project's Settings (any contributor on that project) can tell, at a glance, whether a board is connected and which one.

**Why this priority**: Without visible confirmation, a developer has no way to verify the connection succeeded, or to recall which board a project is linked to when working across several projects.

**Independent Test**: Open Settings on a project with a board connected; confirm the connected board's identifying info (its name and a link to it on GitHub) is shown, with no ambiguity about whether it's actually connected.

**Acceptance Scenarios**:

1. **Given** a project with a board connected, **When** a contributor opens Settings, **Then** they see that board's name and a working link to it on GitHub.
2. **Given** a project with no board connected, **When** a contributor opens Settings, **Then** they see a clear invitation to connect one, not an error or blank state.

---

### User Story 3 - Disconnect or switch to a different board (Priority: P2)

A developer wants to remove an existing board connection (e.g., the project moved to a different board, or was connected by mistake), optionally replacing it with a different one.

**Why this priority**: A connection that can never be undone or corrected would make developers hesitant to connect in the first place; this is required for the feature to be trustworthy, though it's used far less often than connecting.

**Independent Test**: On a project with a board connected, disconnect it; confirm Settings reverts to the "no board connected" state. Then connect a different board and confirm it replaces the previous one with no leftover reference to the old board.

**Acceptance Scenarios**:

1. **Given** a project with a board connected, **When** a contributor disconnects it, **Then** the project reverts to having no board connected, and no board-identifying data remains associated with the project.
2. **Given** a project with a board connected, **When** a contributor connects a different board without disconnecting first, **Then** the new board replaces the old connection entirely (no project is ever linked to two boards at once).

---

### Edge Cases

- What happens if the developer revokes b-mate's GitHub access (or the underlying credential otherwise becomes invalid) from GitHub's side, outside of b-mate? Settings must reflect that the connection is no longer valid rather than silently continuing to show it as connected (this feature stores that state; re-authorizing is the same flow as User Story 1 — no separate "repair" flow is introduced here since nothing yet reads from the board).
- What happens if two different b-mate projects try to connect to the *same* GitHub Projects board? Allowed — this feature does not enforce uniqueness of the board across projects, since a real-world board can legitimately track work that spans more than one client engagement.
- What happens if the developer's GitHub account loses access to the board after it was connected (e.g., removed from the organization)? The connection remains stored as-is; this feature does not periodically re-validate access. (Re-validation only matters once a future feature actually fetches from the board.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a contributor on a project connect that project to exactly one GitHub Projects (v2) board.
- **FR-002**: The system MUST verify, at the time of connecting, that the developer's GitHub identity actually has access to the selected board — a board the developer cannot access MUST be rejected, never stored.
- **FR-003**: The system MUST show, on a project with a board connected, that board's identifying information (at minimum its name and a link to view it on GitHub) to any contributor on that project.
- **FR-004**: The system MUST show a clear "not connected yet" state (not an error) on a project with no board connected, with a way to start connecting one.
- **FR-005**: The system MUST let a contributor disconnect a project's board, after which the project has no board connected and no board-identifying data remains stored for it.
- **FR-006**: The system MUST let a contributor connect a different board directly, without requiring disconnecting first — doing so replaces the existing connection; a project is never linked to more than one board at a time.
- **FR-007**: The system MUST NOT fetch, store, or display any task/issue content from the connected board as part of this feature — only the connection itself (which board, and enough identifying/display info about it).
- **FR-008**: The system MUST scope GitHub access to what's needed to list and read the developer's own GitHub Projects (v2) boards — it must not request broader access than that (e.g., no access to private repository code).
- **FR-009**: Access to connect, view, or disconnect a project's board MUST be limited to that project's contributors (developer-kind project members) — a client-role member MUST NOT see connection controls or credential/authorization details, consistent with the existing Settings placeholder's visibility.
- **FR-010**: The system MUST authenticate against GitHub using a developer-supplied Personal Access Token that the developer pastes into b-mate — not an OAuth or GitHub App installation flow. **Correction from initial research (twice over)**: the developer is guided to create a **classic** PAT with the `project` scope, not a fine-grained one. A fine-grained PAT's "Projects" permission only exists under *Organization* permissions — GitHub does not currently support fine-grained PATs for Projects (v2) boards owned by a personal account at all (a documented GitHub limitation, not a b-mate restriction), and even for an organization-owned board it still can't be scoped to a single board, only to "every project in that org" — the exact same granularity as a classic PAT's `project` scope. Since b-mate's audience is more likely to have personal boards than org-owned ones, classic is the recommendation that actually works for everyone; the system itself only needs to accept, use, and store whatever token is provided, and does not enforce or rely on the classic/fine-grained distinction.
- **FR-011**: This "paste a token" pattern is chosen deliberately so that connecting a *different* provider in the future (e.g. Notion) can reuse the same connect UX (paste this provider's own integration token) — this feature does not build multi-provider support, but MUST NOT make a GitHub-specific choice (e.g. a GitHub OAuth flow) that would make a future provider's connect flow feel inconsistent.
- **FR-012**: The stored token MUST be treated as a sensitive credential — never displayed again in full once saved (only enough to identify it, e.g. a name/last-used date, not the token value), never logged, and never exposed to a client-role project member (see FR-009).

### Key Entities

- **BoardConnection**: Represents the link between one b-mate project and one GitHub Projects (v2) board. Belongs to exactly one project (1:1 — a project has at most one connection at a time). Holds enough identifying information to display the board (its name, its GitHub URL, the org/user and project number) and the developer-supplied Personal Access Token used to act on their behalf (FR-010). Removed entirely when disconnected — no soft-delete/history is required by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from "no board connected" to "board connected and visible in Settings" in under 2 minutes, without leaving b-mate to look up any information (org name, project number, etc.) by hand.
- **SC-002**: 100% of connection attempts for a board the developer doesn't actually have access to are rejected, with zero such connections ever stored.
- **SC-003**: 100% of client-role project members are unable to see any board-connection control or state — Settings-area board information is exclusively visible to contributors.
- **SC-004**: Disconnecting a board leaves zero residual board-identifying data associated with the project, verifiable by inspecting the project's stored data after disconnecting.

## Assumptions

- "Contributor" here means the same thing it already means elsewhere in the product: a project member whose per-project `role` is `contributor` (see `specs/003-rich-project-view`) — i.e. anyone on the developer side of that specific project, not only its admin. This matches the existing "Settings" placeholder's visibility, which is not admin-only.
- Only one board can be connected per project at a time (FR-006); connecting a new one silently replaces the old one rather than requiring an explicit disconnect step first, since that's less friction for the common "we moved boards" case and the old connection carries no data worth preserving.
- This feature does not re-validate an existing connection's continued validity on any schedule; if the underlying GitHub authorization is revoked or the developer loses access, this surfaces only the next time a future feature attempts to use the connection (e.g., the eventual fetch layer), not proactively.
- No historical record of past connections/disconnections is kept — disconnecting is a hard delete of the connection data, consistent with how this product already treats project membership removal.
- A GitHub Projects (v2) board is identified by its owner (a GitHub user or organization) and its project number, per GitHub's own model — not tied to a single repository, since Projects v2 can span multiple repositories or none.
- The "paste a token" pattern (FR-010/FR-011) is a deliberate, forward-looking choice: connecting other tools (e.g. Notion) later should feel like the same action, even though this feature only builds the GitHub side. No multi-provider abstraction is built now — just the single-provider flow, shaped so it does not foreclose that consistency later.
