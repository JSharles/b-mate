# Feature Specification: Explicit Account Kind (Developer vs Client)

**Feature Branch**: `spec/account-kind`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Le compte utilisateur doit désormais porter un 'type de compte' explicite, distinct du rôle par projet (qui reste inchangé : role/is_admin sur ProjectMembers continuent de gérer les permissions projet par projet, exactement comme aujourd'hui). Deux types de compte : 'developer' et 'client'. Le choix se fait à deux endroits, jamais de manière ambiguë ou dérivée : sur le signup direct (page publique /signup), on demande explicitement à la personne si elle est développeur ou cliente ; via l'acceptation d'un lien d'invitation, le compte créé est automatiquement de type 'client', sans qu'on ait besoin de demander. Ce type de compte sert de socle pour adapter l'expérience globale, pas les permissions projet. Premier effet concret : sur Home, le bouton 'Créer un projet' n'apparaît que pour un compte 'developer'. Au-delà de cet effet immédiat, ce type de compte ouvre la porte à des différences futures (options de connexion différentes pour les développeurs, features futures réservées aux clients) — non décidées, à ne pas inventer ici. Contrainte importante : les comptes existants doivent recevoir un type cohérent avec leur usage réel (déduit de leurs memberships de projets), sans déchet ni valeur ambiguë laissée par l'ancien système."

## Relationship to the Project-Level Role Model

This feature does **not** change `ProjectMembers.role`/`.isAdmin`, which continue to govern permissions on a given project exactly as today (including the gating work already shipped in `specs/003-rich-project-view`). It adds a separate, account-level concept — which experience a person's account boots into — that a single account can hold independently of its per-project roles.

**Update (see FR-009)**: the two concepts are orthogonal in what they govern (global experience vs. per-project permissions), but they are **not** independent of each other at the account-kind boundary — a "developer"-kind account can never be invited, nor accept an invitation, as a `client`-role member on any project, since developer and client are non-overlapping audiences by design (established in FR-004). There is no existing path in the product for the reverse (a "client"-kind account acquiring a `contributor` role) — invitations always grant `client` role, and project creation (the only source of `contributor` membership) is already gated to developer-kind accounts by FR-004 — so this feature does not need to add a symmetrical rule for that direction.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Explicit choice at direct signup (Priority: P1)

A person creating an account through the public signup page is asked, plainly, whether they are a developer or a client, and that choice becomes their account's kind.

**Why this priority**: This is the one true decision point in the whole feature — every other behavior (automatic client-kind on invite, Home's gated CTA, the migration backfill) depends on this value existing and being explicit wherever it's actually a choice.

**Independent Test**: Complete the public signup flow choosing "developer"; confirm the resulting account's kind is "developer". Repeat choosing "client"; confirm "client".

**Acceptance Scenarios**:

1. **Given** a person on the public signup page, **When** they reach the point of creating their account, **Then** they must explicitly choose "developer" or "client" before the account is created.
2. **Given** a person completes signup choosing "developer", **Then** their account's kind is "developer".
3. **Given** a person completes signup choosing "client", **Then** their account's kind is "client".

---

### User Story 2 - Automatic client kind via invitation (Priority: P1)

A person who creates their account by accepting a project invitation is never asked to choose — their account kind is automatically "client", because the context (joining a specific project as its invited guest) already answers the question.

**Why this priority**: Equally foundational as User Story 1 — this is the other entry point, and it must never present the same explicit choice; asking would be confusing noise in a moment that's already unambiguous.

**Independent Test**: Accept a valid project invitation and complete account creation through it; confirm the resulting account's kind is "client" and that no kind-selection step was shown during that flow.

**Acceptance Scenarios**:

1. **Given** a valid, unexpired invitation link, **When** the invitee completes account creation through it, **Then** their account's kind is set to "client" automatically, with no question asked.
2. **Given** a project admin invites an email that already belongs to a developer-kind account, **When** they attempt to send the invitation, **Then** the system rejects it and no invitation is created (FR-009).
3. **Given** an invitation link whose target email belongs to a developer-kind account, **When** that person attempts to accept it, **Then** the system rejects the acceptance — no membership is granted and the invitation is not marked accepted (FR-009).

---

### User Story 3 - Home reflects account kind (Priority: P2)

A signed-in user only sees the "Create a project" action if their account kind is "developer". A client-kind account never sees it, anywhere it appears.

**Why this priority**: The first tangible, visible payoff of the whole feature — without this, the account kind is just an inert field nobody notices.

**Independent Test**: Log in as a developer-kind account and confirm "Create a project" is visible (header button and, if the project list is empty, the empty-state CTA); log in as a client-kind account and confirm it is absent from both places.

**Acceptance Scenarios**:

1. **Given** a signed-in user whose account kind is "developer", **When** they view Home, **Then** "Create a project" is visible.
2. **Given** a signed-in user whose account kind is "client", **When** they view Home, **Then** "Create a project" is not visible anywhere on the page.

---

### User Story 4 - Clean migration of existing accounts (Priority: P3)

Every account that existed before this feature is assigned a coherent, non-ambiguous kind, derived from how it has actually been used, not left null or defaulted arbitrarily.

**Why this priority**: Lower-priority than the user-facing behavior above (it's a one-time backfill, not something anyone interacts with directly), but the feature is not done without it — per the explicit "no debris from the old system" requirement.

**Independent Test**: After migration, query all existing accounts; confirm none has a missing/null kind, and spot-check that an account with a historical contributor membership on any project is "developer" while an account with only client memberships is "client".

**Acceptance Scenarios**:

1. **Given** an existing account that holds (or has ever held) a `contributor` membership on at least one project, **When** the migration runs, **Then** its kind is set to "developer".
2. **Given** an existing account whose project memberships are exclusively `client`, **When** the migration runs, **Then** its kind is set to "client".
3. **Given** an existing account with no project memberships at all, **When** the migration runs, **Then** it receives a kind per the documented default (see Assumptions) — never left blank.

---

### Edge Cases

- An account that is `contributor` on one project and `client` on another **from before this feature's FR-009 took effect** (already a supported, real historical scenario in the data model) is "developer" overall for migration purposes (User Story 4) — holding a contributor membership anywhere is what defines the developer kind. FR-009 only blocks *new* client-role invitations/acceptances going forward; it does not retroactively touch or remove any pre-existing client-role membership a developer-kind account already holds.
- A direct-signup account that never creates or joins any project keeps the kind it explicitly chose at signup — it is not reclassified for having zero projects.
- An account created by accepting an invitation always has at least one project membership by construction (the one it just joined), so the "zero memberships" case only applies to direct-signup accounts.
- If an email has no account yet when an invitation is created, but the person signs up directly as "developer" before clicking the invitation link, acceptance is still rejected at that point (FR-009) — the check is evaluated against the account's kind at accept time, not at invite-creation time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST require an explicit "developer" or "client" choice as part of the direct (public) signup flow before an account is created.
- **FR-002**: The system MUST NOT create an account through direct signup without recording that choice as the account's kind.
- **FR-003**: The system MUST automatically set an account's kind to "client" when the account is created via invitation acceptance, without prompting the person to choose.
- **FR-004**: The system MUST show the "Create a project" action, wherever it appears, only to signed-in accounts whose kind is "developer", **and** MUST reject a project-creation request from a "client"-kind account at the API level, not merely hide the UI control — developer and client are non-overlapping audiences by design (see Positioning), so there is no legitimate case where a client-kind account needs this capability.
- **FR-005**: The system MUST assign a kind to every account that existed before this feature: "developer" for an account with any historical `contributor` project membership; "client" for an account whose project memberships are exclusively `client`; the documented default (see Assumptions) for an account with no project memberships at all. No existing account may be left without a kind after migration.
- **FR-006**: The account kind MUST be independent of, and MUST NOT alter, the existing per-project `role`/`is_admin` model for accounts it does not block — this feature does not change how `role`/`is_admin` themselves work.
- **FR-007**: The account kind MUST be stored as a durable account property, not recomputed from current project memberships on each request — removing a project or a membership later must not silently change an account's kind.
- **FR-008**: The account kind MUST NOT be modeled as permanently fixed — it is an ordinary, updatable account attribute, not a write-once/immutable value, so a person can change it later (e.g. from their profile). Building the actual UI/flow for a person to change their own kind is deferred to a future pass (see Assumptions) — this feature must simply avoid any constraint (schema or business rule) that would block that later.
- **FR-009**: The system MUST reject, at the API level, any attempt to make a developer-kind account a `client`-role member of a project — both when a project admin creates an invitation targeting an email that already belongs to a developer-kind account, and when someone accepts an invitation while their account (existing, or resolved by email at acceptance time) is developer-kind. Developer and client are non-overlapping audiences by design (FR-004); there is no legitimate case for a developer-kind account to hold client-role membership anywhere.

### Key Entities

- **User** (existing): gains a new durable attribute — its account kind (`developer` | `client`). Independent of `ProjectMembers.role`/`.isAdmin`, which are unchanged by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of new accounts created through direct signup have an explicit, non-null kind at the moment of creation — never inferred silently.
- **SC-002**: 100% of new accounts created through invitation acceptance have kind "client" automatically, with zero manual selection steps shown during that flow.
- **SC-003**: 100% of accounts that existed before this feature have a non-null, coherent kind after the migration runs, with zero left ambiguous or defaulted arbitrarily.
- **SC-004**: A developer-kind account sees "Create a project" on Home and can use it; a client-kind account sees no such control anywhere, and a direct API request to create a project from a client-kind account is rejected — verifiable both by inspecting the rendered page for each kind and by calling the creation endpoint directly as a client-kind account.
- **SC-005**: 100% of attempts to invite, or to accept an invitation as, a developer-kind account into `client`-role membership are rejected at the API level — verifiable by attempting both actions directly against a developer-kind account's email and confirming no invitation and no membership is ever created.

## Assumptions

- A pre-existing account with zero project memberships at all (the only real edge case for existing data) defaults to "developer" kind — every pre-feature account was created either directly (the only completed flow before this feature existed) or by accepting an invite (which always creates a membership as part of that same action, so it could never end up with zero memberships); a zero-membership account can therefore only be a direct signup, historically the developer-facing flow.
- No new sign-in method (e.g. GitHub OAuth) is built by this feature — it is mentioned in the request only as a reason the account kind should exist, not as something to implement now.
- No client-specific feature beyond the Home CTA gating (User Story 3) is built by this feature — future client-only features are explicitly deferred and undecided, per the request.
- The account kind can be changed later (confirmed with the user), but the actual self-service UI/flow for doing so is deferred to a future pass — likely alongside the broader `/profile` editing work already noted as separate, deferred work in an earlier conversation. This feature only ensures the field itself is an ordinary, updatable attribute, not locked.
- The explicit choice at direct signup needs some UI control (e.g. two clearly labeled options); its exact visual treatment is left to planning/implementation, not fixed here.
