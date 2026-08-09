# Data Model: Project Resources

## Resource (new)

One row per resource added to a project — the central entity of this feature.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (uuid) | |
| `projectId` | `String` (fk → Project) | A project has many resources (unlike `BoardConnection`, which is 1:1 with a project). |
| `source` | `ResourceSource` enum: `upload` \| `notion` | Set once at creation, never changes. |
| `status` | `ResourceStatus` enum: `processing` \| `ready_for_review` \| `published` \| `failed` | See State Transitions below. |
| `title` | `String` | Uploaded file's name (minus extension) for `upload`; the Notion page's title for `notion`. Shown on the tile before/regardless of processing completing. |
| `originalFileKey` | `String?` | R2 object key for the original file. Set only for `source: upload`. |
| `originalFileName` | `String?` | Original uploaded filename, for download (`Content-Disposition`). `upload` only. |
| `originalFileMimeType` | `String?` | One of the accepted types (FR-013). `upload` only — drives whether the frontend offers an in-browser preview (PDF/image) or download-only (`.docx`). |
| `originalFileSizeBytes` | `Int?` | `upload` only, informational (display, and a defense-in-depth re-check against the 25 MB limit). |
| `notionPageUrl` | `String?` | The page URL the developer provided, kept for the "original" link (FR-007/FR-008's Notion equivalent, spec.md Assumptions). `notion` only. |
| `failureReason` | `String?` | Set only when `status: failed` — a short, developer-facing (never client-facing) note on what went wrong (extraction error, AI error, batch error). Not a substitute for logs; just enough to show in the UI per FR-011. |
| `anthropicBatchId` | `String?` | The Claude Batch API request ID this resource's processing was submitted under (research.md Decision 4) — **one batch holding two requests, one per supported locale** (see `ResourceVulgarization` below) — read by `ResourceBatchSweepService` to poll status. Cleared once terminal (`ready_for_review`/`failed`). |
| `addedByUserId` | `String` (fk → User) | The contributor who added it. |
| `publishedAt` | `DateTime?` | Set when a developer publishes it (FR-016); null while `processing`/`ready_for_review`/`failed`. |
| `publishedByUserId` | `String?` (fk → User) | Who published it — informational, not access-control (FR-009 already restricts publishing to contributors generally). |
| `createdAt` / `updatedAt` | `DateTime` | Standard. |

**Validation rules**:
- `originalFile*` fields are required together and only for `source: upload`; `notionPageUrl` is required only for `source: notion` — enforced at the service layer (Prisma doesn't natively express "these columns are required based on that enum," so `ResourcesService` validates this explicitly before insert, the same way `BoardConnectionsService` validates PAT/OAuth-cookie token presence today).
- A resource's `ResourceVulgarization` rows are only ever read by a client once `status: published` — enforced by the API response shape (`toClientDetails()`-style mapping, mirroring `BoardConnectionsService.toDetails()`), never by trusting the frontend to hide them.

## ResourceVulgarization (new)

One row per (resource, app locale) — mirrors `VulgarizedTask`'s own shape (specs/007) for the same reason: the app is bilingual (en/fr), so a client reads a resource in their own interface locale, not whichever language happened to be active when the developer added it. Both locales are submitted as two requests within the *same* Claude Batch (`Resource.anthropicBatchId` — one batch id per resource, not per locale), so they complete together.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (uuid) | |
| `resourceId` | `String` (fk → Resource) | |
| `locale` | `String` | `'en'` \| `'fr'` — matches `SUPPORTED_LOCALES` (task-vulgarization/locale.ts), reused rather than redefined. |
| `title` | `String` | |
| `content` | `String` | The plain-language rewrite (FR-003) in this locale. |
| `createdAt` | `DateTime` | |

Unique on `(resourceId, locale)` — at most one row per resource per locale, matching `VulgarizedTask`'s `(projectId, githubItemId, locale)` constraint shape.

**API resolution**: the list/detail endpoints take a `?locale=` query param (parsed via the existing `parseLocale` helper, `task-vulgarization/locale.ts`) and resolve `vulgarizedTitle`/`vulgarizedContent` in the response from the matching `ResourceVulgarization` row — mirrors `CurrentTaskController`'s existing `?locale=` handling exactly.

## NotionConnection (new)

Per-resource, 1:1, present only when `Resource.source === 'notion'`.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (uuid) | |
| `resourceId` | `String` (fk → Resource, unique) | 1:1. |
| `encryptedToken` | `String` | The pasted Notion integration token, encrypted with the same AES-256-GCM utility as the GitHub board-connection token (research.md Decision 7) — a distinct stored credential, not shared with `BoardConnection.encryptedToken`. |
| `notionPageId` | `String` | Extracted from the page URL/ID the developer provided — the ID actually used for Notion API calls. |
| `createdAt` | `DateTime` | |

**Why a separate table, not columns on `Resource` directly**: keeps the credential physically distinct from the resource's own display/content data (spec.md's Key Entities section models it as its own entity), and mirrors `BoardConnection`'s existing shape (a connection's credential lives with the connection, not scattered across the entity it feeds).

## Enums (new)

```prisma
enum ResourceSource {
  upload
  notion
}

enum ResourceStatus {
  processing
  ready_for_review
  published
  failed
}
```

## State Transitions

```
                    ┌─────────────┐
   add (upload/     │ processing  │
   Notion connect)  └──────┬──────┘
        │                  │
        ▼                  │ batch completes successfully
  (row created,             ▼
   status: processing) ┌──────────────────┐        developer deletes it
                        │ ready_for_review │ ───────────────────────────┐
                        └────────┬─────────┘                            │
                                 │ developer publishes (FR-016)         │
                                 ▼                                      │
                          ┌────────────┐   developer deletes it         │
                          │ published  │ ───────────────────────────────┤
                          └────────────┘                                │
                                                                         ▼
   batch/extraction fails ──────────────────────────────────────► (row removed,
        │                                                          FR-014)
        ▼
  ┌──────────┐   developer deletes it (only action available)
  │  failed  │ ─────────────────────────────────────────────────► (row removed)
  └──────────┘
```

- `processing → ready_for_review`: `ResourceBatchSweepService` (research.md Decision 4), on a successful batch result.
- `processing → failed`: same sweep, on a batch error, extraction failure, or an unprocessable document (spec.md Edge Cases, FR-011).
- `ready_for_review → published`: `ResourcesService.publish()`, a developer-only action (FR-016). One-way — there is no "unpublish," only delete (FR-014's "no edit/replace" scope also covers this: a developer who wants to pull back a published resource deletes it).
- Any state `→` (row removed): `ResourcesService.delete()`, developer-only (FR-014), always allowed regardless of current state.

## Relationship to existing entities

- **Project**: 1-to-many with `Resource` (unlike the existing 1-to-1 `Project`–`BoardConnection`).
- **User**: `addedByUserId`/`publishedByUserId` reference the acting developer — informational, matching how `BoardConnection` doesn't currently track who connected it either (a new, slightly richer pattern here since FR asks who added/published, not just that something happened).
- **BoardConnection**: no direct relationship — a genuinely separate concern, deliberately not reusing its table or its token column (research.md Decision 7).
