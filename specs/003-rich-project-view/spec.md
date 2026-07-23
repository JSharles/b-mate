# Feature Specification: Rich Project Content & Client View

**Feature Branch**: `spec/rich-project-view`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "La page projet doit distinguer ce que voit et peut faire un développeur de ce que voit un client. [...] Lorsqu'un client se rend sur un projet, il doit être en mesure d'y consulter toutes les caractéristiques du projet : date de création, summary, le besoin formulé, éventuels retours d'audit / phase de découverte du besoin, choix de la stack technique, choix architecturaux, la roadmap, la/les tâche(s) en cours, la documentation. Ce contenu passera par le prisme LLM afin d'être vulgarisé ; le client doit aussi pouvoir récupérer le contenu brut. Pour le développeur, l'app ne doit être qu'un connecteur avec ses outils actuels : il crée un projet, y connecte ses outils, y upload éventuellement des documents, et n'a à se soucier de rien d'autre — c'est l'IA qui cherche les informations et construit le contenu digeste pour le client. Aucune saisie manuelle de contenu par le développeur. Il faut découper cela en plus petites tâches."

## Why This Supersedes the Narrower "Role Visibility" Framing

This feature started as a narrower request — gate the *existing* project page (members, invitations, two empty placeholder cartouches) by role. Clarifying what a client should actually see revealed a much bigger, and stricter, need: a client should be able to consult the project's real substance (the need it was built to answer, technical decisions, current work, documentation), translated into plain language but always with the real content one click away — and critically, **none of that content may be manually authored by the developer**. The only developer-side actions are creating a project, connecting their existing tools, and optionally uploading documents; an AI layer is responsible for finding and constructing everything the client reads. This is a direct application of the already-locked product principle in `docs/PRODUCT.md`: *"Zero added process — b-mate must not force the developer to adopt a new methodology, board, or tool just to use it."* Writing content by hand would be exactly that kind of added process, and would undermine the product's reason to exist.

Because none of that pipeline (tool connectors, document upload and extraction, AI content construction) exists yet, **almost none of the rich content is buildable today**. This spec's real, shippable scope is therefore small: the role-based gating (User Story 1), and a set of clearly-labeled, honest "coming soon" placeholders (User Story 2) that reserve the page's future shape without inventing any manual-entry workaround.

## Relationship to `docs/PRODUCT.md`

This feature's eventual full realization depends on capabilities `docs/PRODUCT.md`'s current "Out of scope (explicitly)" list excludes from the MVP: external tool integrations, file/attachment handling, and any AI feature. This spec does not build toward those now, and does not silently redefine the MVP. Once the tool-connector/document-upload/AI-extraction direction is confirmed as the product's next major initiative, `docs/PRODUCT.md` should be updated accordingly (moving these items out of "Out of scope" and recording why) — a deliberate, separate step, not something this spec performs on its own.

## Clarifying Note on Roles

The product's existing data model (see `docs/PRODUCT.md`) defines two **independent** axes on project membership:

- **`role`** (`client` | `contributor`): governs whether a member manages the project's work, or only views it.
- **`is_admin`** (boolean, independent of `role`): governs whether a member can invite and manage other members. A client can be `is_admin` (the documented default for the client who commissioned the project), gaining member-management rights without gaining any content-management rights.

Member/invitation management is gated by `is_admin` (regardless of `role`). Work-management surfaces (Settings/Documentation-as-developer-tooling) are gated by `role = contributor`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Role-appropriate project page (Priority: P1)

A contributor keeps the full management view of the project page (members, invitations, Settings/Documentation-as-developer-tooling placeholders). A client sees a simplified, read-only view with none of those management controls. An admin client (the documented default for the project's commissioning client) keeps member/invitation management despite otherwise seeing the client view.

**Why this priority**: The foundation everything else in this feature is presented through, and the only part of the original request that is fully buildable today with no external dependency.

**Independent Test**: Log in as a contributor, an admin client, and a non-admin client on the same project; confirm each sees exactly the controls their role/admin status grants.

**Acceptance Scenarios**:

1. **Given** a user with `role = contributor`, **When** they open a project page, **Then** they see the members list, and — if `is_admin` — the invitations card and Settings/Documentation placeholders.
2. **Given** a user with `role = client` and `is_admin = false`, **When** they open a project page, **Then** they see no invite action, no member-removal controls, and no Settings/Documentation placeholders.
3. **Given** a user with `role = client` and `is_admin = true`, **When** they open a project page, **Then** they see member/invitation management but not the Settings/Documentation placeholders.

---

### User Story 2 - Reserved space for future project content (Priority: P2)

A client opens a project page and sees clearly-labeled, honest placeholder cartouches for the content that will eventually be built once the tool-connector/document-upload/AI pipeline exists: project overview (need & summary), discovery/audit findings, technical decisions, roadmap, documentation, and current task in progress. Each placeholder says plainly that the feature is coming, rather than showing an empty gap or inventing sample content.

**Why this priority**: Establishes the page's future shape now — so later work has a clear place to land — without pretending any of this content is real today, and without building a manual-entry UI that would immediately contradict the "zero added process" principle once the real pipeline ships.

**Independent Test**: Open any project page as a client; confirm each of the six placeholder cartouches is present, clearly labeled, and contains no fabricated content or data-entry control.

**Acceptance Scenarios**:

1. **Given** any project, **When** a client opens its project page, **Then** they see placeholder cartouches for: project overview, discovery/audit findings, technical decisions, roadmap, documentation, and current task — each clearly marked as coming soon.
2. **Given** the same page, **When** a client looks for a way to type in or upload content directly on this page, **Then** no such control exists — content will only ever come from the (future) tool-connector/document-upload/AI pipeline, never from a form on this page.

---

### Edge Cases

- A user who is `contributor` on one project and `client` on another must see the view that matches each project's own membership row, never a global "user type."
- The placeholders in User Story 2 must never be mistaken for real content — no sample/lorem text, no invented numbers.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST determine, for the signed-in user and the specific project being viewed, that user's `role` (`client` or `contributor`) and `is_admin` status from that project's membership record.
- **FR-002**: The system MUST show the member-removal controls on the members list only to a viewer whose `is_admin` is `true` on that project, regardless of their `role`.
- **FR-003**: The system MUST show the invitations cartouche (pending count and the invite action) only to a viewer whose `is_admin` is `true` on that project, regardless of their `role`.
- **FR-004**: The system MUST show the Settings and Documentation-as-developer-tooling placeholder cartouches only to a viewer whose `role` is `contributor` on that project, regardless of `is_admin`.
- **FR-005**: The system MUST show the project's title to every viewer of the project page, regardless of `role` or `is_admin`.
- **FR-006**: The system MUST NOT show any member-management, invitation, or Settings/Documentation-as-developer-tooling affordance to a viewer whose `role` is `client` and `is_admin` is `false`.
- **FR-007**: The system MUST continue to enforce all existing membership business rules (e.g., the last-admin protection on member removal) exactly as they work today.
- **FR-008**: The system MUST show a client, on every project's page, six clearly-labeled placeholder cartouches — project overview, discovery/audit findings, technical decisions, roadmap, documentation, current task — each stating the feature is not yet available.
- **FR-009**: The system MUST NOT provide any manual data-entry control (text field, upload button, or similar) for the content described in FR-008, on this page or anywhere else, as part of this feature.

### Key Entities

- **Project Membership** (existing `ProjectMembers`): `role` and `is_admin` — the sole inputs for User Story 1's gating.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client member viewing any project page sees zero management controls (invite, member removal, Settings, Documentation-as-developer-tooling).
- **SC-002**: A client member viewing any project page sees all six reserved content placeholders, each honestly labeled as not yet available, with zero fabricated content and zero data-entry controls.
- **SC-003**: A contributor's existing experience of the project page (members, invitations, placeholders) is unchanged by this feature.

## Assumptions

- Only the two axes already documented in `docs/PRODUCT.md` (`role`, `is_admin`) drive management-control visibility.
- No project content (overview, findings, decisions, roadmap, documentation, task status) is authored manually by the developer, now or in the future design — the only developer-side actions this product will ever ask for are creating a project, connecting existing tools, and optionally uploading documents. This is treated as a durable product constraint, not a detail specific to this feature.
- The eventual real implementation of User Story 2's placeholders depends on future, separately-scoped work: tool/board connectors (e.g., GitHub Projects, Notion), document upload and extraction, and an AI layer that constructs and vulgarizes client-facing content from those sources, always leaving the raw source accessible and escalating to the developer rather than guessing when it cannot confidently do so (per the already-locked AI principles in `docs/PRODUCT.md`). None of that is designed or built by this spec.
- `docs/PRODUCT.md` will need a follow-up update once the tool-connector/AI-extraction direction is confirmed as active work (currently "Out of scope"); that update is a deliberate, separate step, not performed by this spec.
