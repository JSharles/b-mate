# Client Portal — Project Tracking & Simplification

> Status: output of a first ideation pass. Nothing is locked in — see "Open decisions". Full project context, decisions made with the alternatives that were ruled out, and the data model diagrams are documented in Notion; this file is the working version used by AI agents on this repo.

## What the product does

A transparency and project-tracking tool for **non-technical clients**, who often pay a lot of money for something opaque. The goal: let them follow, understand, and participate in a digital project without mastering dev tools or vocabulary.

The full vision includes an AI-assisted simplification layer. **It is not part of the MVP** — see "Out of scope" below. It's described here only so that architecture choices don't accidentally rule it out.

### Product principles (locked)

- The content shown is **real**, displayed as-is, under the developer's responsibility. Never generated content.
- The AI's role (post-MVP) is **bounded**: it defines generic technical terms and answers based on content that actually exists. It never makes things up.
- If the information doesn't exist, the AI doesn't improvise: it **escalates the question to the developer**. An answer to the client is always either reliable or routed, never wrong.

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

### Relations

```
USERS  ||--o{  PROJECT_MEMBERS
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

- [ ] **Authentication**: sessions, JWT, external provider? Do the client and developer go through the same flow?
- [ ] **`Tasks.status` values**: TBD
- [ ] **`Projects.status` values**: TBD
- [ ] **`progress_percentage`**: entered manually, or computed from tasks?
- [ ] **Can a project exist without a client attached** (preparation phase)?
- [ ] **Can a client be admin**, or must the admin always be a contributor?
- [ ] **Can a task have multiple assignees?** (a single `assignee_id` is enough for the MVP; otherwise a join table is needed)
- [ ] **Email delivery**: which service for invitations?
- [ ] **`Users.status`**: what does this field actually represent?

---

## Working notes

- Full project context, decisions made with the alternatives that were ruled out, and the data model diagrams are documented in Notion.
- This file describes the MVP. AI features are deliberately absent: don't build ahead of them in code, but don't close the door on them architecturally either.
