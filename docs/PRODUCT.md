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

**Full vision, not yet implemented — see "Out of scope" in MVP scope below for what exists today.** The mechanism that a neighboring "client portal" or generic status-report tool could not truthfully copy: Diaphane connects to the developer's **existing** task board (whatever tool they already use day to day — Jira, Linear, GitHub Issues, Trello, etc.) and automatically translates its real content into plain language for the client, across two views: the task currently in progress, and the roadmap. The client is never asked to learn the developer's tool, and never reads a summary the developer had to write by hand — they read the real board, worded for them.

This is the product's ultimate differentiator; it is deliberately **not** part of the MVP (see "Out of scope" — no external integrations, no AI layer yet), but architecture should not accidentally rule it out.

## Operating Context

The developer's real workflow already lives inside whatever task tracker they use for their own work — Diaphane is not meant to replace that tool. The full vision has Diaphane fetch from that existing board rather than require re-entry, then vulgarize the fetched content for the client across two client-facing surfaces: current task status and roadmap.

Today (MVP), this fetch/translate layer does not exist: tasks are entered directly in Diaphane (see "Out of scope" — no Jira/Linear/GitHub/Notion integration, no AI layer), and this gap is deliberate rather than an oversight — see Positioning above.

## Evidence on Hand

**Pre-launch. No paying customers, no case studies, no testimonials on hand.** The landing page FAQ says as much directly: "Diaphane est en phase de lancement — la tarification sera communiquée prochainement." Future work (landing copy, onboarding, marketing surfaces) must not fabricate customer quotes, usage numbers, logos, or case studies until real ones exist.

## Brand Commitments

Product name: **Diaphane**. Tagline (from app metadata): "Track your project's progress with total transparency."

**Visual identity — confirmed binding at the product-truth level** (2026-08-07): a single dark theme built from four signature colors, no light mode.

| Color             | Role                                                                                      | Value                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Black**         | The void — page background, the ground everything else sits on                            | `#000000`                                                                                           |
| **Midnight Blue** | Atmosphere — a soft glow in the fixed background mesh, never a flat fill                  | `#1c2245` (the brand's periwinkle-blue glow token, `#5c71e7`, blended into the black ground)        |
| **Pale Mauve**    | The one interactive/emphasis color — buttons, links, focus rings, the logo's own wordmark | `#dae1ff` (documented in the design system as "Periwinkle" — same color, read as a pale mauve-blue) |
| **White**         | Body text and bright surfaces — a barely-tinted off-white, not pure white                 | `#eff0f6`                                                                                           |

Full token-level detail (elevation, borders, semantic/status colors, component treatments) lives in `apps/web/DESIGN.md` — this table is the confirmed brand-truth summary; DESIGN.md is where it's implemented.

---

## MVP scope

**Task tracking, with AI-assisted simplification.** An interface that mirrors the real state of ongoing work, translated into plain language rather than the raw ticket. (Originally scoped as "no AI layer" — see "Out of scope" below for what's shipped since and what's genuinely still absent: the client-facing AI chat surface and automatic escalation logic.)

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
- Client view: viewing a project's progress
- Developer view: managing the project, connecting external tools, providing resources
- AI vulgarization of tasks and uploaded/linked resources
- AI-driven topic categorization of resources, developer-approved, displayed as tabs on the client view (decided 2026-08-09, not yet specced)

### Out of scope (explicitly)

- Interactive AI chat with clients, and automatic escalation of ambiguous questions to the developer — the two AI capabilities named in "Product principles (locked)" above that have not been built yet.
- External integrations beyond GitHub Projects and Notion (Jira, Linear, Trello, etc.)
- Billing, payments, quotes
- Notifications other than the invitation email
- Roadmap, milestones, Gantt charts

**No longer out of scope, already shipped** (this list previously said "Any AI feature" and "File or attachment management" were both excluded — both are stale as of 2026-08-09):

- **AI-assisted simplification (vulgarization)** — task vulgarization (`apps/api/src/task-vulgarization/`, specs/007-current-task-vulgarization) and document/resource vulgarization (`apps/api/src/resources/document-vulgarization.client.ts`, specs/011-project-resources) both call Claude (Anthropic) directly and are live. "Never fabricate" is enforced in the prompts (explicit instruction not to invent facts/figures), not by withholding the feature.
- **File/attachment management** — specs/011-project-resources shipped uploads (PDF/Word/PNG/JPEG) and Notion-page resources, each going through `processing → ready_for_review → published`, with an explicit developer `publish()` action gating client visibility (`ResourcesService.publish`, FR-016). This is the precedent the AI resource categorization item below builds on.
- **AI-driven resource categorization** (decided 2026-08-09, real implementation, not exploratory): resources are automatically analyzed for topic/theme as part of the same AI processing pass that already produces their vulgarized content — including images, via Claude's native vision (no separate OCR step needed, it already reads PDFs/images/docx today). The AI proposes categories per project; a contributor must review and approve them (same `ready_for_review`-gate philosophy as `publish()`, extended to cover the category alongside the content) before a category becomes visible to the client. On the client-facing view, published resources are grouped and displayed as tabs by their approved category. Not yet specced — see Open decisions below for what's still undetermined.

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

| Field         | Type             | Note                                                                                                                                                                 |
| ------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id            | uuid             | PK                                                                                                                                                                   |
| first_name    | string           |                                                                                                                                                                      |
| last_name     | string           |                                                                                                                                                                      |
| email         | string           | unique — used as the invitation identifier                                                                                                                           |
| password_hash | string, nullable | Argon2id hash. Clients authenticate with email + password; developers authenticate via GitHub OAuth only (see "Authentication" below) and have no password — `null`. |
| company       | string           |                                                                                                                                                                      |
| address       | string           |                                                                                                                                                                      |
| phone         | string           |                                                                                                                                                                      |
| image         | string           |                                                                                                                                                                      |
| bio           | string           |                                                                                                                                                                      |
| github        | string           | Free-text, declarative profile field ("here's my GitHub"). Unrelated to authentication — not to be confused with `github_id` below.                                  |
| github_id     | string, nullable | GitHub's stable numeric account id, set on first GitHub OAuth login (developers only).                                                                               |
| socials       | string           |                                                                                                                                                                      |
| role_title    | string           | Job title, **free text**, purely declarative. No effect on permissions. Not to be confused with `ProjectMembers.role`.                                               |
| status        | string           |                                                                                                                                                                      |

### Projects

| Field               | Type   | Note       |
| ------------------- | ------ | ---------- |
| id                  | uuid   | PK         |
| title               | string |            |
| status              | string | values TBD |
| progress_percentage | int    |            |

### ProjectMembers

Pivot table. This is where access is decided: who is on which project, and in what capacity.

| Field      | Type    | Note                                 |
| ---------- | ------- | ------------------------------------ |
| id         | uuid    | PK                                   |
| project_id | uuid    | FK → Projects                        |
| user_id    | uuid    | FK → Users, **non-nullable**         |
| role       | enum    | `client` \| `contributor`            |
| is_admin   | boolean | Multiple admins possible per project |

### Invitations

Separate table: what's invited is an **email**, which doesn't necessarily have an account yet.

| Field      | Type     | Note                                                                                        |
| ---------- | -------- | ------------------------------------------------------------------------------------------- |
| id         | uuid     | PK                                                                                          |
| project_id | uuid     | FK → Projects                                                                               |
| email      | string   | no user_id                                                                                  |
| role       | enum     | role to be granted on acceptance                                                            |
| is_admin   | boolean  | whether the invitee becomes a project admin on acceptance — see "Ownership & handoff" below |
| token      | string   | random string, unguessable                                                                  |
| status     | string   | invited / accepted / expired                                                                |
| expires_at | datetime |                                                                                             |

### Tasks

| Field       | Type   | Note                     |
| ----------- | ------ | ------------------------ |
| id          | uuid   | PK                       |
| project_id  | uuid   | FK → Projects            |
| assignee_id | uuid   | FK → Users, **nullable** |
| title       | string |                          |
| description | string |                          |
| status      | string | values TBD               |
| duration    | int    | estimated time           |

### Sessions

Server-side sessions (decided over JWT — see "Authentication" below). The row's `id` is itself the bearer secret sent to the browser in an `httpOnly` cookie; deleting the row logs the session out instantly, everywhere.

| Field      | Type     | Note                                                        |
| ---------- | -------- | ----------------------------------------------------------- |
| id         | uuid     | PK, cryptographically random — doubles as the session token |
| user_id    | uuid     | FK → Users                                                  |
| expires_at | datetime | fixed at creation (30 days), not sliding                    |

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

**A task's assignee must be a member of the project.** The foreign key points to `Users`, not to _this_ project's members — the schema can't enforce that, the code must check it.

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

**Server-side sessions, not JWT**, for both account kinds. On successful authentication (however it happened — see below), the API creates a row in `Sessions` and sends its id to the browser as an `httpOnly` cookie (`SameSite=Lax`, 30-day fixed expiry, `Secure` in production). Every request looks the session up in Postgres; logout deletes the row.

**Developers authenticate via GitHub OAuth exclusively** (specs/009-developer-github-oauth) — a "Continue with GitHub" action creates or logs into a developer account from their GitHub identity; `Users.password_hash` is `null` for every GitHub-authenticated developer. This is a deliberate reversal of the original MVP decision (below) to also offer email/password to developers — kept exclusively GitHub for this first version, not offered alongside it.

**Clients still sign up and log in with email + password** (Argon2id hash, `Users.password_hash`), unchanged. `/login` and `/signup` each show a Developer/Client toggle (`AuthGateway`, defaulting to Developer): choosing "Client" reveals the same email/password form clients have always used, in place, on the same page — no separate route to remember. A client's actual first-time entry is still the invitation-acceptance flow (`/invite/[token]`), untouched by this feature; the toggle only matters for a _returning_ client logging back in.

**Why not JWT:** a bare JWT (no refresh token, what was used on past projects) can't be revoked before it expires — if a client removes a developer's access (see "Ownership & handoff" above), that developer's token would stay valid regardless. A refresh-token setup fixes that but adds real complexity (rotation, replay detection) for a team still building auth fundamentals. Sessions give instant, unconditional revocation for free, at negligible DB cost at this scale.

**Why not an auth library (Better Auth, etc.):** those are built to run inside a JS frontend framework (chiefly Next.js). This project deliberately keeps `apps/api` (NestJS) as the single source of truth for identity and authorization — introducing a frontend-side auth library would split that across two systems. Revisit if the architecture ever collapses into a single Next.js fullstack app. The GitHub OAuth exchange itself is two plain HTTP calls made directly from `apps/api`, not a frontend-side OAuth library, for the same reason.

Google OAuth (or any provider beyond GitHub) remains a possible later addition, not decided.

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
- [ ] **`Projects.status` values**: TBD — still free-text/unset in the DB column itself; the status pill now shown on the dashboard project card is a separate, computed label (see below), not this field.
- [x] **`progress_percentage`**: resolved 2026-08-09 — computed, not manual. A solo freelancer rarely fills in per-task time estimates, so progress is derived from the connected GitHub board's own Status column instead: `done` / `total` triaged items (an item with no Status set yet doesn't count toward `total`), refreshed on the same 5-minute sweep as the current-task feature (`TaskVulgarizationService`). Null (not 0%) when nothing has been triaged. The dashboard card's status pill ("Not started"/"In progress"/"Complete") is a frontend-only label derived from this same percentage, not its own stored field.
- [ ] **Can a project exist without a client attached** (preparation phase)?
- [ ] **Can a task have multiple assignees?** (a single `assignee_id` is enough for the MVP; otherwise a join table is needed)
- [ ] **Email delivery**: which service for invitations?
- [ ] **`Users.status`**: what does this field actually represent?
- [ ] **Which board/tracker(s) to support first for the fetch layer** (Jira, Linear, GitHub Issues, Trello...), and how auth/sync would work — full-vision item, not MVP.
- [ ] **Should "developer" vs "client" move fully onto the `User` account, replacing `ProjectMembers.role`?** Surfaced while specifying the account-kind feature (`specs/004-account-kind`): since developer and client are being treated as two non-overlapping audiences (a developer never needs to _be_ a client, or vice versa — see Positioning), keeping the distinction in two places (an account-level kind and a per-project role that could in theory diverge) may be redundant. Merging them onto `User` would simplify the model but requires revisiting the already-shipped per-project role gating (`specs/003-rich-project-view`). Not decided.
- [ ] **Are per-project permission roles (`is_admin`) still needed at all, or does only one capability matter — a client-initiated ownership transfer to a new developer, which the new developer must accept (never unilateral)?** This would replace the current broad "admin manages all members" model with a single, narrower handoff mechanism purpose-built for the "developer disappeared" scenario (see "Ownership & handoff" below). Not decided.
- [ ] **What happens to project settings (board connections, uploaded documentation) when project ownership transfers to a new developer?** Working hypothesis, not yet designed: personal credentials (OAuth tokens, board API keys) belong to the developer who connected them and would need to be reconnected by the new developer; project content (uploaded docs, written documentation) belongs to the project and would carry over. The Project Settings screen itself now exists (`specs/012-project-settings` — GitHub board connection and Notion connection management, at `/projects/[id]/settings`), but this specific question (behavior on ownership transfer) is still undecided.
- [ ] **AI resource categorization — category lifecycle and data model**: decided (2026-08-09) that resources get AI-detected categories, developer-approved, shown as client-facing tabs (see MVP scope / Out of scope above). Not yet decided: whether categories are freeform per-resource (the AI may propose near-duplicate names across resources) or the AI must be shown a project's existing categories and asked to reuse/merge into them; whether an approved resource's category can be revisited later as more resources are added; and whether category approval is folded into the existing `publish()` action or is a separate review step (so content and category could be approved independently). To be resolved when this feature is specced.

---

## Product Principles

- **Never fabricate.** Everything the client sees traces back to real, existing content — the foundational constraint the product is named for (see "Product principles (locked)" above).
- **Zero added process.** Diaphane must not force the developer to adopt a new methodology, board, or tool just to use it — today that means manual entry; the full vision fetches from their existing tool instead of replacing it (see Positioning, Operating Context).
- **Translation, not replacement.** The client-facing view reworks real technical content into plain language; it never invents or tidies up beyond what's true.
- **Escalate rather than guess.** Missing or ambiguous information routes to the developer instead of being improvised.
- **MVP scope guides what's built; full vision guides how it's architected.** Don't build the fetch/AI layer ahead of schedule, but don't foreclose it either.

---

## Working notes

- Full project context, decisions made with the alternatives that were ruled out, and the data model diagrams are documented in Notion.
- This file describes the MVP. AI features are deliberately absent: don't build ahead of them in code, but don't close the door on them architecturally either.
- **Idea, not yet scoped**: a meeting/discussion-summary feature — a permanent, clickable Gmeet link on the project page, with each meeting summarized and viewable from within Diaphane. Surfaced while discussing `specs/007-current-task-vulgarization`'s future context needs, as a natural future source of context (alongside docs, audit findings, tech stack) for the eventual document-vulgarization/RAG layer described in Positioning. Not designed, not decided — captured here so it isn't lost.
- **Idea, not yet scoped**: a richer, structured client-facing "Current Task" card (`specs/007-current-task-vulgarization`/`specs/008-current-task-progress`'s `CurrentTaskCard`) — instead of just a vulgarized title/status, break the task down into named sections a non-technical client can scan: what's being done, why it's necessary (the risk/motivation), the impact for them (usually "nothing changes day to day"), and the current state in plain language (e.g. "a first version was built, it's under review"). Example sketched by the user for a "refonte de l'authentification" task:
  - **En cours** — Refonte de l'authentification
  - **Pourquoi c'est nécessaire** — le système actuel présente un risque : certains accès peuvent rester valides pendant un certain temps après leur suppression.
  - **Impact pour vous** — aucun changement visible prévu dans l'utilisation quotidienne ; ça concerne surtout la sécurité du produit.
  - **État** — une première version a été développée, elle est actuellement en validation.
  Ideally each section stays traceable to real source material (e.g. "Source : issue #42 + PR #47 + documentation Authentication") rather than reading as an unsourced AI paraphrase — consistent with the "Never fabricate" principle above. Would need: (1) the vulgarization prompt/output schema restructured into these named fields instead of one free-text blob, (2) a way to resolve which issue/PR/doc a task's write-up actually traces back to (not obviously available from the board data `specs/006-current-task-fetch` fetches today). Not designed, not decided — captured here so it isn't lost.
