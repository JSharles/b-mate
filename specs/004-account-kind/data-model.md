# Phase 1 Data Model: Explicit Account Kind (Developer vs Client)

## New: `AccountKind` enum (Prisma)

```prisma
enum AccountKind {
  developer
  client
}
```

## Changed: `User`

| Field | Type | Note |
|---|---|---|
| `accountKind` | `AccountKind` (required) | New. Set once at account creation — explicitly at direct signup, automatically to `client` at invitation acceptance. Durable: never recomputed from `ProjectMember` rows after creation (per FR-007). No default at the Prisma level for new rows — every creation path (signup, invite-accept) must supply it explicitly; only the one-time migration backfill supplies a value for rows that predate this column. |

No other `User` field changes.

## Unchanged: `ProjectMember` (`role`, `isAdmin`)

Explicitly untouched by this feature (FR-006). Continues to govern per-project permissions exactly as shipped in `specs/003-rich-project-view`.

## Migration

One migration, three steps, in order:

1. `ALTER TABLE users ADD COLUMN account_kind "AccountKind"` (nullable at this point).
2. Backfill every existing row:
   ```sql
   UPDATE users u SET account_kind = (
     CASE
       WHEN EXISTS (
         SELECT 1 FROM project_members pm
         WHERE pm.user_id = u.id AND pm.role = 'contributor'
       ) THEN 'developer'
       WHEN EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.user_id = u.id
       ) THEN 'client'
       ELSE 'developer'
     END
   )::"AccountKind";
   ```
3. `ALTER TABLE users ALTER COLUMN account_kind SET NOT NULL`.

This is a single deploy-time migration (runs via `prisma migrate deploy`, per AGENTS.md's existing workflow) — no separate manual backfill script, no follow-up cleanup step.

## API response shape (`packages/schemas`)

- `UserSchema` (`auth.ts`) gains `accountKind: z.enum(["developer", "client"])`. Flows through `toPublicUser()` automatically (it destructures out only `passwordHash`, so any new `User` field is included without a code change there).
- `SignupRequestSchema` gains `accountKind: z.enum(["developer", "client"])` — required, no default, so a request without it fails validation rather than silently picking one.
- `AcceptInvitationRequestSchema` is **unchanged** — the invitee never supplies a kind; the server decides it.

## Validation / business rules carried over unchanged

- Password hashing, session creation, and the existing anti-enumeration signup message are untouched.
- The last-admin-protection and other `ProjectMember` rules are untouched (this feature doesn't touch that table).
