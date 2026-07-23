# Phase 1 Data Model: GitHub Projects Board Connection

## New: `BoardProvider` enum (Prisma)

```prisma
enum BoardProvider {
  github
}
```

Single value today (research.md Decision 6) — sized so a future provider adds a value, not a schema reshape.

## New: `BoardConnection`

```prisma
model BoardConnection {
  id        String        @id @default(uuid()) @db.Uuid
  projectId String        @unique @map("project_id") @db.Uuid
  project   Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)

  provider  BoardProvider

  // GitHub Projects v2 identity — enough to display the board and to query
  // it again (owner type differs at the GraphQL schema level: user vs org).
  boardOwnerLogin String  @map("board_owner_login")
  boardOwnerType  String  @map("board_owner_type") // "User" | "Organization" (GitHub's own discriminator)
  boardNumber     Int     @map("board_number")
  boardTitle      String  @map("board_title")
  boardUrl        String  @map("board_url")

  // Encrypted (AES-256-GCM, research.md Decision 4) — never the raw PAT at
  // rest, never returned in any API response after connect (FR-012).
  encryptedToken String @map("encrypted_token")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("board_connections")
}
```

- `projectId` is `@unique` — the database itself enforces "at most one connection per project" (research.md Decision 5), not just application logic.
- `onDelete: Cascade` on the `project` relation — deleting a project removes its connection; no orphaned rows.
- No soft-delete/history columns — disconnecting is a hard delete (spec Assumptions: "no historical record of past connections/disconnections is kept").

## Changed: `Project`

Gains the inverse relation:

```prisma
boardConnection BoardConnection?
```

No other `Project` field changes.

## Unchanged: `ProjectMember` (`role`, `isAdmin`)

Explicitly untouched. Who can manage a board connection is derived from existing membership (`role === 'contributor'`), not a new field (spec Assumptions).

## Migration

One migration, additive only — no backfill needed (this is a brand-new table, not a new column on an existing populated table):

1. `CREATE TYPE "BoardProvider" AS ENUM ('github')`.
2. `CREATE TABLE "board_connections" (...)` with a unique constraint on `project_id` and a foreign key to `projects(id)` with `ON DELETE CASCADE`.

Applied via `prisma migrate deploy` in prod, `prisma migrate dev` locally — the standard path (AGENTS.md), no hand-edited SQL required this time since there's no existing data to reconcile.

## API contract

No `/contracts` directory — this repo documents REST endpoints inline (matching `specs/003-rich-project-view` and `specs/004-account-kind`), backed by Zod schemas in `packages/schemas`.

### `packages/schemas/src/board-connection.ts` (new)

```ts
export const AvailableBoardSchema = z.object({
  ownerLogin: z.string(),
  ownerType: z.enum(["User", "Organization"]),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
});

export const PreviewBoardConnectionRequestSchema = z.object({
  token: z.string().min(1),
});

export const CreateBoardConnectionRequestSchema = z.object({
  token: z.string().min(1),
  ownerLogin: z.string(),
  ownerType: z.enum(["User", "Organization"]),
  number: z.number().int().positive(),
});

// Response shape — deliberately excludes the token entirely (FR-012).
export const BoardConnectionSchema = z.object({
  provider: z.literal("github"),
  boardOwnerLogin: z.string(),
  boardOwnerType: z.enum(["User", "Organization"]),
  boardNumber: z.number(),
  boardTitle: z.string(),
  boardUrl: z.string().url(),
});
```

### Endpoints (`apps/api/src/board-connections`)

All four require the caller to be a **contributor** on the project (any role/isAdmin value is irrelevant beyond that — FR-009); a non-contributor (client-role member, or non-member) gets the same `NotFoundException` as a project that doesn't exist, matching the existing anti-enumeration pattern.

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/projects/:id/board-connection` | — | `BoardConnectionSchema \| null` | `null` when nothing is connected (FR-004) — not a 404. |
| `POST` | `/projects/:id/board-connection/preview` | `PreviewBoardConnectionRequestSchema` | `AvailableBoardSchema[]` | Calls GitHub, stores nothing (research.md Decision 2). Empty array if the token is valid but sees no boards; a GitHub auth failure (bad token) surfaces as a sanitized 4xx, never the raw GitHub error body (may contain the token echoed back in some failure modes). |
| `POST` | `/projects/:id/board-connection` | `CreateBoardConnectionRequestSchema` | `BoardConnectionSchema` | Re-validates access (FR-002, research.md Decision 3) before upserting on `projectId` (FR-006). |
| `DELETE` | `/projects/:id/board-connection` | — | `204 No Content` | Hard-deletes the row (FR-005). No-op-safe: deleting when nothing is connected also returns `204`, not a 404 — disconnecting is idempotent from the caller's point of view. |

## Validation / business rules carried over unchanged

- Session auth (`SessionGuard`, `@CurrentUser()`), anti-enumeration response shape, and the existing project-membership model are untouched by this feature.
- The last-admin-protection rule on `ProjectMember` is unrelated and untouched.
