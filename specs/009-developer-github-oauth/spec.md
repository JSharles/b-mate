# Feature Specification: Developer GitHub OAuth Login

**Feature Branch**: `feat/developer-github-oauth`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Repenser le parcours de connexion/inscription côté développeur (login/signup) sur Diaphane. Pour cette première version, le seul moyen d'authentification proposé au développeur est GitHub (OAuth) — aussi bien pour l'inscription que la connexion. Pas de formulaire email/mot de passe pour les développeurs dans ce nouveau parcours. Le compte client n'est pas concerné et garde son parcours actuel (email + mot de passe, invitation par token)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer authenticates with GitHub (Priority: P1)

A developer — whether it's their very first visit or their hundredth — arrives at a single Diaphane entry point and sees one action: "Continue with GitHub." They authorize (or GitHub recognizes them without an extra prompt), and land on their dashboard: a brand-new account if this is their first time, their existing account and projects if they've been here before. Diaphane never asks them to state up front whether they're "signing up" or "logging in" — GitHub's own authorization response settles that.

**Why this priority**: This is the entire feature. Without it, a developer has no way to create an account or get back into one.

**Independent Test**: Can be fully tested by a developer with no existing Diaphane account completing the GitHub authorization flow and arriving at their dashboard with a usable account, then repeating the same action later and landing back on that same account.

**Acceptance Scenarios**:

1. **Given** a developer with no existing Diaphane account and a GitHub account, **When** they choose "Continue with GitHub" and approve the authorization on GitHub's side, **Then** a new developer account is created for them and they land on their dashboard, already logged in.
2. **Given** a developer with an existing GitHub-linked Diaphane account, **When** they choose "Continue with GitHub" again and approve, **Then** they are logged into that same existing account — not a new one — with all their existing projects visible.
3. **Given** a developer who cancels or denies the GitHub authorization, **When** they are returned to Diaphane, **Then** they see a plain-language message that it didn't complete and can try again, and no account is created.
4. **Given** a developer who is already logged in with an active Diaphane session, **When** they navigate back to the entry point, **Then** they are redirected straight to their dashboard rather than being asked to authorize again.

---

### Edge Cases

- **GitHub returns no public, verified email for the developer during account creation.** Handled explicitly — see FR-006.
- What happens if the developer denies the authorization request, or GitHub is unreachable/errors mid-flow? The developer sees a plain-language failure message and can retry; no partial account is created.
- What happens if a developer authorizes with a *different* GitHub account than one they used before? A new, separate Diaphane account is created for that GitHub identity — this is standard, expected OAuth behavior and does not need special handling.
- What happens to a developer's session if they revoke Diaphane's access from their GitHub account settings? Their next action in Diaphane requires re-authenticating; already-active sessions are not proactively invalidated by this feature (consistent with the existing session-revocation model).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The developer-facing authentication surface MUST offer a single "Continue with GitHub" action that serves both account creation and login — Diaphane MUST NOT ask the developer to declare up front whether they are a new or returning user.
- **FR-002**: The developer-facing authentication surface MUST NOT present email/password fields at any point.
- **FR-003**: The system MUST automatically create a new developer account on a developer's first successful GitHub authorization, with no separate confirmation or registration step.
- **FR-004**: The system MUST recognize a returning developer's subsequent GitHub authorizations and log them into their existing account rather than creating a duplicate.
- **FR-005**: This change MUST NOT affect the client sign-up/login journey (email + password, invitation by token) in any way. Concretely (discovered during planning: `/login` is today a single page shared, undifferentiated, by both developer and client accounts, and `/signup` already lets a client self-serve via an account-kind toggle) — `/login` and `/signup` MUST continue to offer email/password login for a returning client, discoverably, on the same page and without extra navigation (see the 2026-08-07 course correction below — resolved as a Developer/Client toggle, not a separate hidden page). Self-serve client sign-up (the account-kind toggle on the current `/signup`) is removed, not relocated — a client's real first-time entry point remains the invitation-acceptance page, unaffected by this feature.
- **FR-006**: If GitHub does not supply a public, verified email for the developer during account creation, the system MUST block account creation and show a plain-language message asking the developer to make an email public/verified on their GitHub account, then retry — no email/password fallback form is offered.
- **FR-007**: The system MUST keep this GitHub sign-in connection entirely independent of the existing GitHub Projects board-connection feature (`apps/web/features/board-connections`) — connecting, viewing, or disconnecting a project's board MUST continue to work exactly as it does today, unaffected by how the developer authenticated.
- **FR-008**: Pre-existing developer accounts created via the old email/password form are not linked, matched, or migrated by this feature — Diaphane is pre-launch with no real developer account base to preserve (per `docs/PRODUCT.md`), so no account-linking mechanism is in scope. Any local/seed developer accounts left over from the old flow may be discarded or left inert.

### Key Entities

- **Developer Account**: An existing `User` record (role: developer/contributor per `ProjectMembers`) that authenticates via a linked GitHub identity rather than a password.
- **GitHub Identity**: The GitHub-side identity (account id, username, public profile info) a Developer Account is linked to, used to recognize the developer on future logins.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from the authentication entry point to their dashboard, ready to create or resume a project, without ever typing into a field (name, email, or password) other than on GitHub's own authorization screen.
- **SC-002**: 100% of developer sign-ups and logins complete without an email or password form ever appearing on Diaphane's own pages.
- **SC-003**: A returning, already-authorized developer reaches their dashboard within two actions (one click on Diaphane, one GitHub confirmation) or fewer.
- **SC-004**: On `/login` and `/signup`, a developer never needs to fill in a form to authenticate (down from a full email/name/password form), and a returning client can log in in the same number of steps as before this change — no new page or URL to discover.

## Clarifications

### Session 2026-08-07 (during `/speckit-tasks`)

- Q: `/login` today is a single, role-agnostic page shared by developers and clients, and `/signup` already lets a client self-serve via a "Developer/Client" toggle — making both GitHub-only would silently remove client login/signup, contradicting FR-005. How should this be resolved? → A: Keep `/login` and `/signup` fully GitHub-only and developer-only; add a separate, distinct page for client email/password login (self-serve client sign-up is removed — the invitation-acceptance page remains a client's real first-time entry point, per `docs/PRODUCT.md`'s canonical flow).

### Session 2026-08-07 (post-implementation course correction)

- Q: the separate `/client-login` page from the answer above was unlinked from any nav — after shipping, "how do clients log in now?" surfaced that a *returning* client (session expired, logged out) has no discoverable way back in, only a URL they'd have to already know. How should this be resolved? → A: No separate page. `/login` and `/signup` each show a Developer/Client toggle (defaulting to Developer) directly on the page; choosing "Client" reveals the same familiar email/password form in place. Mirrors the toggle the old self-serve `SignupForm` already had, so the pattern is not new to the product. `/client-login` is removed.

## Assumptions

- Diaphane is pre-launch with no paying customers or real developer account base (per `docs/PRODUCT.md`); this feature does not need to preserve or migrate any pre-existing password-based developer account.
- No GitHub access token needs to be stored long-term for this feature — authentication only needs to confirm the developer's GitHub identity once per login; ongoing GitHub API access (for board connections) already has its own, separate Personal Access Token mechanism and is unaffected.
- The existing free-text `github` field on `Users` (a declarative profile field, unrelated to authentication) is a distinct concept from the new GitHub OAuth identity link; how they relate at the data-model level is a planning-phase decision, not a product-behavior question.
- Diaphane's session model (server-side sessions, httpOnly cookie, 30-day fixed expiry) is reused as-is for developer sessions created via GitHub — this feature changes how a session is *established*, not how it behaves once created.
- A GitHub OAuth App (not a GitHub App) is sufficient for identity-only sign-in; this is a planning-phase detail, not a product-behavior question.
- `/login` and `/signup` both stay as routes (many existing links point at each); both now present a Developer/Client toggle, with the "Continue with GitHub" entry point as the default (Developer) side of it.
