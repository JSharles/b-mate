# Data Model: Project Settings

No new Prisma models, fields, or migrations. Both entities already exist and are already project-scoped 1:1 (the Notion side was revised to this shape earlier in this session, ahead of this spec). This feature only changes which module owns `NotionConnection`'s Prisma access and which endpoints expose it.

## BoardConnection (existing, unchanged)

`apps/api/prisma/schema.prisma` — 1:1 with `Project`, owned by `apps/api/src/board-connections/`. No changes.

## NotionConnection (existing, unchanged fields — ownership moves)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (uuid) | |
| `projectId` | `String` (fk → Project, unique) | 1:1, already the current shape. |
| `encryptedToken` | `String` | AES-256-GCM, same utility as `BoardConnection.encryptedToken` (distinct credential). |
| `createdAt` / `updatedAt` | `DateTime` | |

**Ownership change**: Prisma access to this model moves from `ResourcesService` to the new `NotionConnectionService` (`apps/api/src/notion-connection/`). `ResourcesService` no longer touches `prisma.notionConnection` directly — it depends on `NotionConnectionService`'s public method to resolve the decrypted token.

## API Surface

No `contracts/` directory, matching this repo's existing convention for internal-only endpoints (specs/005/009/010/011).

### New: Notion Connection endpoints (`apps/api/src/notion-connection/`)

- `GET /projects/:projectId/notion-connection` — contributor-only. Returns `{ connected: boolean }` (never the token itself). Replaces specs/011's `GET /projects/:projectId/resources/notion-connection`, which is removed.
- `POST /projects/:projectId/notion-connection` — contributor-only. Body: `{ token: string }`. Verifies the token via `NotionClient.verifyToken()` (research.md Decision 2) before persisting; upserts on `projectId` (mirrors `BoardConnectionsService.connect()`'s upsert-replaces-existing pattern). Returns `{ connected: true }` on success; a clear 400 if verification fails.
- `DELETE /projects/:projectId/notion-connection` — contributor-only. Idempotent (mirrors `BoardConnectionsService.disconnect()` — disconnecting when nothing is connected is not an error). `204 No Content`.

### Changed: Resource creation from Notion (`apps/api/src/resources/`)

- `POST /projects/:projectId/resources/notion` — body becomes `{ pageUrl: string }` (the `token` field is removed — research.md Decision 3). Resolves the project's stored token via `NotionConnectionService`; returns a clear 400 pointing at Settings if no connection exists yet.

### Unchanged

- `GET /projects/:projectId/board-connection`, `POST /projects/:projectId/board-connection`, `GET /projects/:projectId/board-connection/github/authorize`, `DELETE /projects/:projectId/board-connection` — all unchanged. Only the frontend location of the UI calling them moves.
- `GET/POST /projects/:projectId/resources`, `GET/POST/DELETE /projects/:projectId/resources/:resourceId`, `POST /projects/:projectId/resources/:resourceId/publish` — unchanged.

### Redirect target change (research.md Decision 5)

- `auth.controller.ts`'s GitHub board-connection OAuth callback redirects to `/{locale}/projects/{projectId}/settings` instead of `/{locale}/projects/{projectId}` (both the success `?connectBoard=1` and failure `?boardConnectError=...` cases).
