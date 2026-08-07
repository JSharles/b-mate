# Feature Specification: GitHub OAuth Board Connection

**Feature Branch**: `feat/github-oauth-board-connection`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Remplacer le flow de connexion de board GitHub Projects (actuellement : le développeur colle manuellement un Personal Access Token classique) par un flow basé sur GitHub OAuth, pour que le développeur puisse simplement choisir son board dans une liste sans avoir à créer/coller un token."

**Supersedes**: `specs/005-github-project-connection` FR-010 (PAT chosen over OAuth) and FR-011 (provider-agnostic constraint) are revised by this feature — see FR-009. `specs/005-github-project-connection/spec.md` will be annotated to mark those requirements as superseded by this spec, per this project's convention for revised decisions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer connects a board without ever touching a token (Priority: P1)

A developer opens their project's board connection dialog to link their GitHub Projects v2 board. Instead of being asked to go create a Personal Access Token on GitHub and paste it in, they authorize Diaphane's access to their GitHub projects (a GitHub consent screen, if not already granted), and are immediately shown a list of the boards they can access. They pick one, and the project is connected.

**Why this priority**: This is the entire feature — replacing the token-paste step with a pick-from-a-list experience is the whole point.

**Independent Test**: Can be fully tested by a developer with no existing board connection going through the flow end-to-end (authorize → see board list → pick one → project shows as connected) without creating or pasting any token.

**Acceptance Scenarios**:

1. **Given** a developer who has never granted Diaphane access to their GitHub projects, **When** they start connecting a board, **Then** they are sent through a GitHub authorization step and, upon approving, land back on a list of the GitHub Projects v2 boards they can access (personal and organization boards they belong to).
2. **Given** a developer who has already granted Diaphane access to their GitHub projects (from a previous connection, on this project or another), **When** they start connecting a board again, **Then** they see the board list directly, without being sent through GitHub's authorization screen again.
3. **Given** the board list is showing, **When** the developer selects a board and confirms, **Then** the project's board connection is created exactly as it works today (single active board per project, replacing any prior connection), and the existing task-sync features (current-task card, etc.) continue to work unchanged.

---

### User Story 2 - A developer with no accessible boards gets a clear message (Priority: P2)

A developer authorizes Diaphane's access to their GitHub projects, but has no GitHub Projects v2 boards they can access (personal or organization). They see a clear explanation instead of an empty or broken list.

**Why this priority**: Prevents a confusing dead end; not the core flow but a necessary guardrail already handled today for the PAT flow's empty case.

**Independent Test**: Can be tested by authorizing with a GitHub account/token that has zero accessible Projects v2 boards and confirming a clear "no boards available" message is shown, matching the existing empty-state behavior of the PAT flow.

**Acceptance Scenarios**:

1. **Given** a developer completes GitHub authorization, **When** the resulting board list is empty, **Then** they see a message explaining no boards were found, with no option to proceed to a board that doesn't exist.

---

### User Story 3 - A developer revokes access and the connected board keeps working until they act (Priority: P3)

A developer who previously connected a board later revokes Diaphane's access from their GitHub account settings (outside Diaphane). Diaphane's project pages should not crash or silently break — sync attempts should surface a clear "reconnect" state instead of an opaque error.

**Why this priority**: An edge case around token validity that matters for reliability but doesn't block shipping the core connection flow.

**Independent Test**: Can be tested by connecting a board, revoking Diaphane's GitHub authorization from GitHub's side, and confirming subsequent sync attempts surface a clear reconnect prompt rather than a raw error.

**Acceptance Scenarios**:

1. **Given** a connected board whose underlying GitHub authorization has been revoked or expired, **When** Diaphane next tries to sync data from that board, **Then** the developer sees a clear "reconnect your board" state rather than a generic error or silent failure.

---

### Edge Cases

- What happens when the developer cancels or denies the GitHub authorization screen instead of approving it? → They are returned to the board connection dialog with a clear "authorization was not completed" message, no board list shown, no connection created.
- What happens when a developer belongs to a GitHub organization that has restricted third-party OAuth app access? → The board list may omit that organization's boards (GitHub itself blocks the API from returning them); this is a GitHub-side restriction, not a Diaphane error, and should not be presented as a failure of the whole flow.
- What happens to a project's board connection that was made via the old PAT flow before this feature shipped? → Keeps working unchanged and indefinitely (FR-007); this feature only changes how *new* connections are made.
- What happens if the developer starts the GitHub authorization step, then closes the tab/browser before completing it? → No board connection is created; state is identical to never having started.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a developer connect a GitHub Projects v2 board to a project by authorizing Diaphane's access to their GitHub projects, without requiring them to manually create or paste any access token.
- **FR-002**: The system MUST present the developer with the list of GitHub Projects v2 boards they can access (their own and any organizations they belong to) after authorization, so they can pick exactly one to connect.
- **FR-003**: The system MUST NOT require the developer to re-authorize GitHub access every time they connect a board, once they have already granted it. This permission is granted by extending the developer's existing GitHub identity authorization (`specs/009-developer-github-oauth`) with the additional board-read permission, requested only at the point a board connection is first attempted — not upfront at login/signup for every developer.
- **FR-004**: The system MUST connect exactly one board per project, replacing any previously connected board on that project — this behavior is unchanged from the existing PAT-based flow.
- **FR-005**: The system MUST show a clear message when the authorized developer has no accessible GitHub Projects v2 boards, instead of an empty or broken board list.
- **FR-006**: The system MUST show a clear message when the developer declines or cancels the GitHub authorization step, without creating a connection.
- **FR-007**: The system MUST let existing PAT-based board connections keep working unchanged and indefinitely alongside the new OAuth mechanism — there is no forced migration or expiry imposed by this feature. A developer may reconnect via the new OAuth flow at any time, which replaces their existing connection per FR-004, but is never required to.
- **FR-008**: When a previously-authorized developer's GitHub access is later revoked, the system MUST surface a clear "reconnect" state to the developer the next time it tries to sync that board's data, rather than a generic error or silent failure. GitHub OAuth App access tokens do not expire on a fixed schedule by default, so this state is triggered by explicit revocation (by the developer or their organization), not routine expiry — no refresh-token mechanism is required.
- **FR-009**: The system's board-connection mechanism for GitHub MUST be GitHub OAuth going forward; this feature explicitly supersedes `specs/005-github-project-connection` FR-011's requirement to stay provider-agnostic — the connection flow may now be GitHub-specific.
- **FR-010**: The system MUST request only the GitHub permission scope needed to read the developer's Projects v2 boards — it MUST NOT request write access to the developer's projects or any permissions beyond what's needed to list and read boards.

### Key Entities

- **Board Connection**: Represents the link between a Diaphane project and one GitHub Projects v2 board. Unchanged in shape/meaning from `specs/005-github-project-connection`; only how the underlying access credential is obtained and stored changes (an OAuth-derived credential instead of a manually pasted PAT).
- **GitHub Authorization**: Represents a developer's grant of Diaphane's access to read their GitHub Projects v2 boards. New concept introduced by this feature — distinct from the existing developer-identity GitHub authorization (`specs/009-developer-github-oauth`), which grants no project-board access.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from "no board connected" to "board connected" without creating, copying, or pasting any token at any point in the flow.
- **SC-002**: A developer who has already authorized Diaphane once can connect a board on a second project in under 15 seconds, without seeing a GitHub authorization screen again.
- **SC-003**: 100% of developers who complete the authorization step but have no accessible boards see an explanatory message, not an empty screen or an error.
- **SC-004**: Existing board connections made via the previous token-paste flow continue to function with zero developer-facing disruption after this feature ships.

## Assumptions

- **On scope reduction from specs/005**: This feature deliberately narrows the board-connection mechanism to GitHub specifically, superseding `specs/005-github-project-connection`'s FR-011 provider-agnostic requirement. A future non-GitHub board provider (if ever built) will need its own connection mechanism; this is an accepted, explicit tradeoff, not an oversight.
- Only Projects v2 boards are in scope, matching the existing PAT-based feature — classic GitHub Projects (v1, deprecated by GitHub) remain out of scope.
- Client accounts are unaffected — this feature only changes a capability available to developer accounts.
