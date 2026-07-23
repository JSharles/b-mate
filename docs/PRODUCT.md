# Client Portal — Project Tracking & Simplification

<!-- impeccable:product-schema 1 -->

## Platform

web

> Status: output of a first ideation pass. Nothing is locked in — see "Open decisions". Full project context, decisions made with the alternatives that were ruled out, and the data model diagrams are documented in Notion; this file is the working version used by AI agents on this repo.

## What the product does

A transparency and project-tracking tool for **non-technical clients**, who often pay a lot of money for something opaque. The goal: let them follow, understand, and participate in a digital project without mastering dev tools or vocabulary.

The full vision includes an AI-assisted simplification layer. **It is not part of the MVP** — see "Out of scope" below. It's described here only so that architecture choices don't accidentally rule it out.

### Product principles (locked)

- The content shown is **real**, displayed as-is, under the developer's responsibility. Never generated content.
- The AI's role (post-MVP) is **bounded**: it defines generic technical terms and answers based on content that actually exists. It never makes things up.
- If the information doesn't exist, the AI doesn't improvise: it **escalates the question to the developer**. An answer to the client is always either reliable or routed, never wrong.

---

## Positioning

**Full vision, not yet implemented — see "Out of scope" in MVP scope below for what exists today.** The mechanism that a neighboring "client portal" or generic status-report tool could not truthfully copy: b-mate connects to the developer's **existing** task board (whatever tool they already use day to day — Jira, Linear, GitHub Issues, Trello, etc.) and automatically translates its real content into plain language for the client, across two views: the task currently in progress, and the roadmap. The client is never asked to learn the developer's tool, and never reads a summary the developer had to write by hand — they read the real board, worded for them.

This is the product's ultimate differentiator; it is deliberately **not** part of the MVP (see "Out of scope" — no external integrations, no AI layer yet), but architecture should not accidentally rule it out.

## Operating Context

The developer's real workflow already lives inside whatever task tracker they use for their own work — b-mate is not meant to replace that tool. The full vision has b-mate fetch from that existing board rather than require re-entry, then vulgarize the fetched content for the client across two client-facing surfaces: current task status and roadmap.

Today (MVP), this fetch/translate layer does not exist: tasks are entered directly in b-mate (see "Out of scope" — no Jira/Linear/GitHub/Notion integration, no AI layer), and this gap is deliberate rather than an oversight — see Positioning above.

## Evidence on Hand

**Pre-launch. No paying customers, no case studies, no testimonials on hand.** The landing page FAQ says as much directly: "b-mate est en phase de lancement — la tarification sera communiquée prochainement." Future work (landing copy, onboarding, marketing surfaces) must not fabricate customer quotes, usage numbers, logos, or case studies until real ones exist.

## Brand Commitments

Product name: **b-mate**. Tagline (from app metadata): "Track your project's progress with total transparency." No other voice or visual-identity commitment has been confirmed as binding at the product-truth level — the current visual system lives in code, not in a confirmed brand brief.

---

## MVP scope

**Task tracking, without simplification.** An interface that mirrors the real state of ongoing work. The ticket, mirrored — no AI layer.

### Target flow

1. A developer creates an account.
2. They create a project.
3. They invite their client by email.
4. The client receives a link, activates their account, accesses the project.
5. The client views progress: task list, statuses, who's doing what.

### In scope

- Sign-up and authentication (developer and client)
- Project creation and editing
- Email invitation with token, acceptance, expiration
- Managing project members and their roles
- Task CRUD, with assignment
- Client view: viewing a project's progress
- Developer view: managing the project and its tasks

### Out of scope (explicitly)

- Any AI feature: chat, simplification, automatic escalation
- External integrations (Jira, Linear, GitHub, Notion) — tasks are entered directly in the tool
- Billing, payments, quotes
- Notifications other than the invitation email
- File or attachment management
- Roadmap, milestones, Gantt charts

---

## Stack

- **Frontend**: Next.js (`apps/web`)
- **Backend**: NestJS, as a separate service (deliberate choice, even though Next.js allows fullstack) (`apps/api`)
- **Repo**: pnpm + Turborepo monorepo — decided (this was originally in "Open decisions" below, now removed from that list)
- **Database**: PostgreSQL, via Prisma — decided (this was originally in "Open decisions" below, now removed from that list)
- **Hosting**: Railway, for both `apps/api` and the production Postgres instance — decided

---

## Data model

### Users

A single table for every person. A client and a developer are the same kind of thing: a person with a name and an email, who logs in.

| Field | Type | Note |
|---|---|---|
| id | uuid | PK |
| first_name | string | |
| last_name | string | |
| email | string | unique — used as the invitation identifier |
| password_hash | string | Argon2id hash. Both developer and client authenticate with email + password. |
| company | string | |
| address | string | |
| phone | string | |
| image | string | |
| bio | string | |
| github | string | |
| socials | string | |
| role_title | string | Job title, **free text**, purely declarative. No effect on permissions. Not to be confused with `ProjectMembers.role`. |
| status | string | |

### Projects

| Field | Type | Note |
|---|---|---|
| id | uuid | PK |
| title | string | |
| status | string | values TBD |
| progress_percentage | int | |

### ProjectMembers

Pivot table. This is where access is decided: who is on which project, and in what capacity.

| Field | Type | Note |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → Projects |
| user_id | uuid | FK → Users, **non-nullable** |
| role | enum | `client` \| `contributor` |
| is_admin | boolean | Multiple admins possible per project |

### Invitations

Separate table: what's invited is an **email**, which doesn't necessarily have an account yet.

| Field | Type | Note |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → Projects |
| email | string | no user_id |
| role | enum | role to be granted on acceptance |
| is_admin | boolean | whether the invitee becomes a project admin on acceptance — see "Ownership & handoff" below |
| token | string | random string, unguessable |
| status | string | invited / accepted / expired |
| expires_at | datetime | |

### Tasks

| Field | Type | Note |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → Projects |
| assignee_id | uuid | FK → Users, **nullable** |
| title | string | |
| description | string | |
| status | string | values TBD |
| duration | int | estimated time |

### Sessions

Server-side sessions (decided over JWT — see "Authentication" below). The row's `id` is itself the bearer secret sent to the browser in an `httpOnly` cookie; deleting the row logs the session out instantly, everywhere.

| Field | Type | Note |
|---|---|---|
| id | uuid | PK, cryptographically random — doubles as the session token |
| user_id | uuid | FK → Users |
| expires_at | datetime | fixed at creation (30 days), not sliding |

### Relations

```
USERS  ||--o{  PROJECT_MEMBERS
USERS  ||--o{  SESSIONS
PROJECTS  ||--o{  PROJECT_MEMBERS
PROJECTS  ||--o{  INVITATIONS
PROJECTS  ||--o{  TASKS
USERS  ||--o{  TASKS          (assignment)
```

---

## Business rules to respect

These rules follow from structural decisions. Not all of them are expressible in the schema — several must be enforced in code.

### Security and privacy

**No client directory.** A developer must never be able to search, list, or discover users who are not members of their own projects. Exposing a global list would leak other developers' client base.

**An invitation must not reveal whether an account exists.** The API response must be identical whether the invited email already exists in the database or not. Otherwise the directory comes back through enumeration: a developer could probe addresses to find out who's a client.

**The invitation token must be cryptographically random.** Never a sequential or predictable id — possessing the token is the only proof of legitimacy for an invitee who doesn't have an account yet.

### Integrity

**A project must always have at least one admin.** Prevent removing or demoting the last admin, otherwise the project becomes orphaned: no one can invite or manage it anymore.

**A task's assignee must be a member of the project.** The foreign key points to `Users`, not to *this* project's members — the schema can't enforce that, the code must check it.

**Role is a security field.** It determines permissions. The enum must be enforced both in TypeScript and as a database constraint. An unexpected value would send the person down an unhandled branch of the code.

### Access

- A `client` views the project and its tasks. They don't create or edit tasks.
- A `contributor` manages the project and its tasks.
- `is_admin` is an **independent** dimension from role: it governs inviting and managing members.

### Ownership & handoff

**The client who commissions a project should be invited as admin (`is_admin = true`) by default**, on top of their `client` role. This does not grant them any content rights — `role` still governs tasks, so an admin client still can't create or edit tasks. It grants them member-management rights only.

**Why:** without this, a project can only ever be managed by the developer who created it. If that developer becomes unresponsive, nobody can invite a replacement — the client is stuck depending on someone who has no obligation to act. Since it's the client's engagement (they're the one paying, and they can already work with several developers over time per the data model), they should be able to unilaterally invite a new developer and remove the old one, without needing the original developer's cooperation. This works purely through the existing `is_admin` flag — no new mechanism needed, it's the reason `is_admin` was made independent of `role` in the first place.

This makes `is_admin` set at invitation time (see `Invitations.is_admin` above), decided by whoever sends the invite. A developer inviting the first client to a brand-new project should default to checking it; subsequent client invitations (e.g. a colleague added later) don't need to.

**Under reconsideration (see Open decisions):** whether this broad "admin manages all members" model is even the right shape, versus a narrower, purpose-built capability — a client can always initiate transferring project ownership to a new developer, who must accept before it takes effect (never unilateral). The rationale above (client shouldn't be stuck if the developer disappears) stays the same either way; what's being reconsidered is whether that's best served by the general `is_admin` flag or a dedicated handoff action.

### Authentication

**Server-side sessions, not JWT.** Both developer and client sign up and log in with email + password (Argon2id hash, `Users.password_hash`). On login, the API creates a row in `Sessions` and sends its id to the browser as an `httpOnly` cookie (`SameSite=Lax`, 30-day fixed expiry, `Secure` in production). Every request looks the session up in Postgres; logout deletes the row.

**Why not JWT:** a bare JWT (no refresh token, what was used on past projects) can't be revoked before it expires — if a client removes a developer's access (see "Ownership & handoff" above), that developer's token would stay valid regardless. A refresh-token setup fixes that but adds real complexity (rotation, replay detection) for a team still building auth fundamentals. Sessions give instant, unconditional revocation for free, at negligible DB cost at this scale.

**Why not an auth library (Better Auth, etc.):** those are built to run inside a JS frontend framework (chiefly Next.js). This project deliberately keeps `apps/api` (NestJS) as the single source of truth for identity and authorization — introducing a frontend-side auth library would split that across two systems. Revisit if the architecture ever collapses into a single Next.js fullstack app.

OAuth (Google/GitHub) as an additional sign-up method is a possible later addition, not MVP.

---

## Reasoning behind the model

Context is useful to avoid "fixing" the schema in the wrong direction.

**Why no `developer_id` on the client?** A client can work with several developers, on different projects. Attaching a client to a single developer would force them to exist as duplicates. The developer ↔ client relationship goes through the project: "my clients" is a query, not a column.

**Why a single `Users` table?** A project can bring together several kinds of participants, not necessarily developers. What distinguishes people is not their nature but their role on a given project. Two separate tables would prevent someone from being a client on one project and a contributor on another.

**Why is role on `ProjectMembers` and not on `Users`?** Same reason: role depends on the project.

**Why `is_admin` on `ProjectMembers` and not an array on `Projects`?** An array carries no foreign key: nothing would prevent it from containing the id of an admin who isn't even a project member. On the pivot table, the flag can't exist without the membership row.

**Why is `assignee_id` nullable?** A roadmap identifies work before it's distributed. Forcing assignment would make that view impossible. "Unassigned" is a state in its own right in the UI, not an empty value.

---

## Open decisions

**Don't decide alone. Ask before implementing.**

- [ ] **`Tasks.status` values**: TBD
- [ ] **`Projects.status` values**: TBD
- [ ] **`progress_percentage`**: entered manually, or computed from tasks?
- [ ] **Can a project exist without a client attached** (preparation phase)?
- [ ] **Can a task have multiple assignees?** (a single `assignee_id` is enough for the MVP; otherwise a join table is needed)
- [ ] **Email delivery**: which service for invitations?
- [ ] **`Users.status`**: what does this field actually represent?
- [ ] **Which board/tracker(s) to support first for the fetch layer** (Jira, Linear, GitHub Issues, Trello...), and how auth/sync would work — full-vision item, not MVP.
- [ ] **Should "developer" vs "client" move fully onto the `User` account, replacing `ProjectMembers.role`?** Surfaced while specifying the account-kind feature (`specs/004-account-kind`): since developer and client are being treated as two non-overlapping audiences (a developer never needs to *be* a client, or vice versa — see Positioning), keeping the distinction in two places (an account-level kind and a per-project role that could in theory diverge) may be redundant. Merging them onto `User` would simplify the model but requires revisiting the already-shipped per-project role gating (`specs/003-rich-project-view`). Not decided.
- [ ] **Are per-project permission roles (`is_admin`) still needed at all, or does only one capability matter — a client-initiated ownership transfer to a new developer, which the new developer must accept (never unilateral)?** This would replace the current broad "admin manages all members" model with a single, narrower handoff mechanism purpose-built for the "developer disappeared" scenario (see "Ownership & handoff" below). Not decided.
- [ ] **What happens to project settings (board connections, uploaded documentation) when project ownership transfers to a new developer?** Working hypothesis, not yet designed: personal credentials (OAuth tokens, board API keys) belong to the developer who connected them and would need to be reconnected by the new developer; project content (uploaded docs, written documentation) belongs to the project and would carry over. Moot until the board-connector/Settings feature (currently a placeholder) is actually designed.

---

## Product Principles

- **Never fabricate.** Everything the client sees traces back to real, existing content — the foundational constraint the product is named for (see "Product principles (locked)" above).
- **Zero added process.** b-mate must not force the developer to adopt a new methodology, board, or tool just to use it — today that means manual entry; the full vision fetches from their existing tool instead of replacing it (see Positioning, Operating Context).
- **Translation, not replacement.** The client-facing view reworks real technical content into plain language; it never invents or tidies up beyond what's true.
- **Escalate rather than guess.** Missing or ambiguous information routes to the developer instead of being improvised.
- **MVP scope guides what's built; full vision guides how it's architected.** Don't build the fetch/AI layer ahead of schedule, but don't foreclose it either.

---

## Working notes

- Full project context, decisions made with the alternatives that were ruled out, and the data model diagrams are documented in Notion.
- This file describes the MVP. AI features are deliberately absent: don't build ahead of them in code, but don't close the door on them architecturally either.
