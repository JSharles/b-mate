# Feature Specification: Project Invitations

**Feature Branch**: `spec/invitations`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "En tant que développeur, j'ai créé un projet, je suis admin. Je suis le seul à pouvoir envoyer des invitations. Je peux également supprimer des membres, annuler des invitations, renvoyer l'invitation. L'invitation à terme devra envoyer un email, mais le lien est également accessible et doit pouvoir être copié-collé. En tant que client, je reçois une invitation, lorsque je me rends à l'URL, si j'ai déjà un compte alors je me connecte sinon je suis invité à créer un compte. Une fois connecté, j'arrive sur mon espace et je vois le(s) projet(s) pour le(s)quel(s) on m'invite apparaître. En me rendant sur un projet, je ne suis pas admin, je n'ai donc pas le pouvoir d'inviter ou de révoquer des gens."

## Clarifications

### Session 2026-07-21

- Q: Inviting an email that already belongs to the project as a member — allowed or blocked? → A: Blocked — the system tells the admin this person is already a member, no invitation is created.
- Q: Does the admin's invitation list show pending-only, or full history (cancelled/expired/accepted too)? → A: Pending-only for this iteration — once resolved, an invitation drops out of the admin's view.
- Q: Should cancel/resend/remove actions be logged and attributable to the admin who performed them? → A: No audit trail required in this iteration — current state (who's a member, what's pending) is sufficient.

### Session 2026-07-22

- Q: Does accepting an invitation grant the client admin status on the project, or regular non-admin client status? → A: Non-admin — a client is never an admin by default; this corrects a `/speckit-analyze` finding (X1) where FR-011 and data-model.md had drifted to say the opposite of the original feature description.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin invites someone to a project (Priority: P1)

The admin of a project adds a person by entering their email address, and
gets a shareable link back — since automatic email delivery isn't built yet,
they can copy that link and send it themselves.

**Why this priority**: Entry point for every other story — nothing else can
happen until an invitation exists.

**Independent Test**: An admin submits an email address on a project they
administer and receives a unique, copyable link, with no other story built
yet.

**Acceptance Scenarios**:

1. **Given** an admin viewing a project they administer, **When** they submit
   a person's email address, **Then** a new pending invitation is created and
   a unique link is available to copy.
2. **Given** a member of a project who is not an admin, **When** they attempt
   to invite someone, **Then** the system refuses and no invitation is
   created.

---

### User Story 2 - New person accepts an invitation by creating an account (Priority: P1)

Someone who has never used the product opens their invite link and creates
an account directly from that page.

**Why this priority**: Primary path for bringing a non-technical client in —
most invitees won't already have an account.

**Independent Test**: Open a pending invitation's link with an email that has
no existing account, complete the account creation form, and confirm the
person is signed in with access to the project.

**Acceptance Scenarios**:

1. **Given** a pending invitation for an email with no existing account,
   **When** the invitee opens the link, **Then** they see a form asking for
   their name and a password (their email is shown but fixed).
2. **Given** that form, **When** the invitee submits valid details, **Then**
   an account is created, they are signed in, the invitation is marked
   accepted, and they gain access to the project.

---

### User Story 3 - Returning person accepts an invitation by logging in (Priority: P1)

Someone who already has an account (e.g. invited to a second project)
receives an invite link and joins by confirming their existing password —
no new account is created.

**Why this priority**: The product's data model already allows one person to
belong to several projects; this path has to work from day one, even though
it affects fewer people than User Story 2 at launch.

**Independent Test**: Open a pending invitation's link with an email that
already has an account, enter that account's password, and confirm the
person is signed in with access to the new project without a duplicate
account being created.

**Acceptance Scenarios**:

1. **Given** a pending invitation for an email with an existing account,
   **When** the invitee opens the link, **Then** they see a form asking only
   for their password.
2. **Given** that form, **When** the invitee enters the correct password,
   **Then** they are signed in, the invitation is marked accepted, and they
   gain access to the project — without a second account being created.
3. **Given** that form, **When** the invitee enters an incorrect password,
   **Then** access is refused and the invitation remains usable to try again.

---

### User Story 4 - Invitee sees their invited project(s) after connecting (Priority: P1)

Once signed in — whether by creating an account or logging in — the person
lands on their own space and sees the project(s) they've been invited to.

**Why this priority**: Accepting an invitation is only valuable if it visibly
leads somewhere; without this, an invitee has no way to find what they just
joined.

**Independent Test**: After completing either acceptance path, land on the
invitee's own space and confirm the newly joined project appears there,
without needing to build invitation cancellation, resend, or removal first.

**Acceptance Scenarios**:

1. **Given** a person has just accepted an invitation to a project, **When**
   they land on their own space, **Then** that project appears in their list.
2. **Given** a person who belongs to several projects (through one or more
   accepted invitations), **When** they view their own space, **Then** every
   project they belong to appears.

---

### User Story 5 - Invitee opens a link that is no longer valid (Priority: P2)

Someone opens an invitation link that has expired, was cancelled, or was
already used, and understands clearly why they can't proceed — instead of a
broken or confusing form.

**Why this priority**: Affects trust for a first-time, non-technical visitor,
but the product is usable end-to-end without it (a still-pending link always
works; this only covers the unhappy paths).

**Independent Test**: Open an expired invitation's link and, separately, an
already-accepted one, and confirm each shows a clear message with no form.

**Acceptance Scenarios**:

1. **Given** an invitation that is no longer pending (expired or cancelled),
   **When** anyone opens its link, **Then** they see a message that the
   invitation is no longer available, with no form to fill in.
2. **Given** an invitation already accepted, **When** anyone opens its link
   again, **Then** they see a message that it was already used, with no form.
3. **Given** a link that does not correspond to any invitation ever created,
   **When** anyone opens it, **Then** they see a message that the link isn't
   valid.

---

### User Story 6 - Admin cancels a pending invitation (Priority: P2)

An admin who invited the wrong email, or no longer wants that person to
join, cancels the invitation before it's accepted.

**Why this priority**: Mistakes happen (typo'd email, change of plan); the
feature is usable without this at small scale, but it's a real gap in
control for the admin.

**Independent Test**: Create a pending invitation, cancel it, and confirm its
link no longer leads to a working acceptance form.

**Acceptance Scenarios**:

1. **Given** a pending invitation, **When** the admin cancels it, **Then** it
   is no longer usable and no longer counted as pending.
2. **Given** a member who is not an admin, **When** they attempt to cancel an
   invitation, **Then** the system refuses.

---

### User Story 7 - Admin resends a pending invitation (Priority: P2)

An admin refreshes a pending invitation that hasn't been accepted yet — for
example because the person lost the original link or it's about to expire —
without creating a second, separate invitation for the same person.

**Why this priority**: Directly supports the "copy-paste, no email yet"
reality of this iteration — links get lost, and re-inviting from scratch
would otherwise leave two invitations for the same person.

**Independent Test**: Create a pending invitation, resend it, and confirm
there is still exactly one pending invitation for that email on that
project, usable to accept.

**Acceptance Scenarios**:

1. **Given** a pending invitation, **When** the admin resends it, **Then**
   the same link is still valid, its expiration is reset, and the project
   still shows exactly one pending invitation for that email.
2. **Given** a member who is not an admin, **When** they attempt to resend an
   invitation, **Then** the system refuses.
3. **Given** an email that already has a pending invitation on the project,
   **When** the admin invites that same email again, **Then** it is treated
   as resending the existing invitation — the same link keeps working, its
   expiration is reset, and no second invitation is created.

---

### User Story 8 - Admin removes a member from the project (Priority: P2)

An admin removes someone who already joined the project — a client or
another admin — revoking their access.

**Why this priority**: Completes the admin's control over who's on the
project — inviting without the ability to later remove would be an
incomplete story.

**Independent Test**: Have a second person join a project, remove them as an
admin, and confirm they no longer have access to that project.

**Acceptance Scenarios**:

1. **Given** a project with more than one member, **When** the admin removes
   one of them — client or admin — **Then** that person no longer has access
   to the project.
2. **Given** a member who is not an admin, **When** they attempt to remove
   another member, **Then** the system refuses.
3. **Given** a project with a single admin, **When** that admin attempts to
   remove themselves (or another admin attempts to remove them), **Then**
   the system refuses, since a project must always keep at least one admin.

### Edge Cases

- What happens when a project's only admin tries to remove themselves, or is
  removed, leaving the project with no admin? The system MUST prevent this —
  a project always keeps at least one admin.
- What happens when someone accepts an invitation for a project they already
  belong to? The system does not create a second membership; the invitation
  is simply marked accepted.
- What happens if the invitee closes the acceptance form partway through and
  reopens the link later? The invitation is still pending until acceptance
  completes; reopening the link shows the same form again.
- What happens when an admin tries to invite an email that already belongs
  to the project as a member? The system blocks it and tells the admin the
  person is already a member.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a project admin to invite a person to that
  project by supplying an email address, except a person who is already a
  member of that project (see FR-022).
- **FR-002**: System MUST refuse invitation creation, cancellation, resend,
  and member removal from anyone who is not an admin of the target project.
- **FR-003**: System MUST generate a unique, unguessable link for every
  invitation.
- **FR-004**: Every invitation MUST be in exactly one state at any time:
  pending, accepted, cancelled, or expired.
- **FR-005**: A pending invitation MUST automatically become expired once a
  fixed amount of time has passed since its creation (see Assumptions for the
  duration).
- **FR-006**: An admin MUST be able to cancel a pending invitation, after
  which its link no longer leads to a working acceptance form.
- **FR-007**: An admin MUST be able to resend a pending invitation; resending
  keeps the same link valid and resets its expiration — it does not issue a
  new link or invalidate the old one.
- **FR-008**: Inviting an email that already has a pending invitation on the
  same project MUST be treated as resending that existing invitation (same
  link, expiration reset) rather than creating a second, independent
  invitation.
- **FR-009**: When a person opens a pending invitation's link, the system
  MUST determine whether an account already exists for the invited email and
  present the corresponding action: create an account, or confirm identity
  with a password.
- **FR-010**: The invitation page MUST show which project the invitation is
  for and which email it was sent to.
- **FR-011**: Accepting a pending invitation MUST grant the accepting person
  membership on the project as a client, **without** admin status — a client
  is never an admin by default, per the Assumptions below.
- **FR-012**: An invitation MUST NOT be usable again once accepted.
- **FR-013**: Opening a no-longer-pending invitation's link (expired or
  cancelled) MUST show a clear message instead of a form.
- **FR-014**: Opening an already-accepted invitation's link MUST show a clear
  message instead of a form, distinct from the expired/cancelled message.
- **FR-015**: Opening a link that does not correspond to any invitation MUST
  show a clear message instead of a form.
- **FR-016**: Accepting an invitation for a project the person already
  belongs to MUST NOT create a duplicate membership.
- **FR-017**: An incorrect password on the confirm-identity path MUST refuse
  access and MUST NOT consume the invitation (it remains usable to retry).
- **FR-018**: A project admin MUST be able to view the list of that
  project's pending invitations, each with the invited email address, and
  retrieve each one's link again. This list is pending-only — cancelled,
  expired, and accepted invitations do not appear in it (no history view in
  this iteration).
- **FR-019**: A project admin MUST be able to remove any existing member from
  the project — including another admin — revoking their access immediately,
  subject to FR-020.
- **FR-020**: System MUST prevent an action that would leave a project with
  no admin (removing the last admin).
- **FR-021**: Once signed in through either acceptance path, the invitee
  MUST see every project they belong to, including the one just joined, in
  their own space.
- **FR-022**: Inviting an email that already belongs to the project as a
  member MUST be blocked, with a clear message to the admin that the person
  is already a member; no invitation is created.

### Key Entities

- **Invitation**: An offer to join one specific project, addressed to one
  email address. Has a state (pending / accepted / cancelled / expired), the
  role and admin status to grant on acceptance, a creation time, and an
  expiration time. The stored value for "pending" is the literal string
  `"invited"` in the database and API responses (pre-existing convention,
  kept as-is during implementation rather than renamed — see
  `/speckit-analyze` finding T073); "pending" and "invited" are the same
  state throughout this spec.
- **Project Membership**: The relationship that grants a person access to a
  project, carrying a role and an admin status. Can be revoked by an admin.
- **Account**: A person's identity in the system. May or may not exist yet
  at the moment they are invited — this is exactly the fork the acceptance
  page has to handle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can go from deciding to invite someone to having a
  shareable link in hand in under 30 seconds.
- **SC-002**: A first-time invitee (no existing account) can go from opening
  the link to seeing the project in their own space in under 2 minutes.
- **SC-003**: A returning invitee (existing account) can go from opening the
  link to seeing the project in their own space in under 30 seconds.
- **SC-004**: 0% of expired, cancelled, or already-accepted invitations grant
  access when their link is reused.
- **SC-005**: 100% of member-removal and last-admin-protection actions leave
  the project with at least one admin.
- **SC-006**: An admin can cancel, resend, or remove a member in under 15
  seconds per action, without leaving the project page.

## Assumptions

- Every invitation grants the client role **without** admin status by
  default — the description consistently frames the invitee as "client,"
  distinct from the project's admin(s); a role picker is out of scope for
  this iteration, and this feature introduces no path for a client to
  become an admin.
- Invitations expire 7 days after creation — no duration was specified; this
  matches the existing session-expiry convention already used elsewhere in
  the product.
- Sending the invitation link by email is out of scope for this feature; the
  admin shares it manually for now. This is a known, separate open decision
  (which email service to use) tracked in `docs/PRODUCT.md`.
- The invited email address itself is not re-verified at acceptance time;
  possession of the link is treated as proof of identity, consistent with
  how this product already treats session tokens.
- "Expired" and "cancelled" invitations show the same generic
  no-longer-available message to the invitee (the system does not
  distinguish the reason in what the invitee sees); "already accepted" gets
  its own distinct message.
- No audit trail (who cancelled/resent/removed what, and when) is required
  in this iteration — the admin's view reflects current state only.
- The exact wording shown for "no longer available" / "already accepted" /
  "invalid link" / cancellation-confirmation messages (FR-006, FR-013,
  FR-014, FR-015) is intentionally left to implementation, not fixed here —
  what's required is that each case is visually distinct and accurate, not
  a specific string.
