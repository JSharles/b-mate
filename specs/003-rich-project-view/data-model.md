# Phase 1 Data Model: Rich Project Content & Client View

No new tables, columns, or migrations. Every field this feature reads already exists in the schema (`docs/PRODUCT.md` § Data model); the change is in which endpoints expose which already-existing fields to whom.

## Entities touched

### ProjectMember (existing — no schema change)

| Field | Type | Note |
|---|---|---|
| `role` | enum `client` \| `contributor` | Already exists. Newly *read back to the viewer themselves* via the extended project-detail response (see below) — previously never returned to the frontend at all. |
| `isAdmin` | boolean | Already exists and already returned per-member in `GET /projects/:id/members`. Newly also read back for the *viewer's own* row via the project-detail response. |

No new field is added to `ProjectMember` or its Prisma model.

### Project Detail Response (extended — `packages/schemas`)

The response shape for `GET /projects/:id` gains two fields, both derived from the caller's own `ProjectMember` row for that project (not stored on `Project` itself):

```ts
export const ProjectDetailSchema = ProjectSchema.extend({
  role: ProjectMemberRoleSchema,   // "client" | "contributor" — the viewer's own role
  isAdmin: z.boolean(),            // the viewer's own admin status
});
```

`GET /projects` (the list endpoint, used by the Home dashboard grid) is **not** changed — it continues to return the plain `Project` shape unchanged, since the list view has no per-project role-gated UI to decide.

### Project Content placeholders (User Story 2 — explicitly no entity)

Project overview, discovery/audit findings, technical decisions, roadmap, documentation, and current-task-in-progress are **not** modeled by this feature. Per the spec's Assumptions, no manual-entry data model is introduced now or planned for later — their eventual real implementation depends on a separately-scoped tool-connector/document-upload/AI pipeline. The six cartouches this feature adds are static, content-free markup.

## Validation / business rules carried over unchanged

- A project must always keep at least one admin (existing `removeMember` rule) — untouched by this feature.
- A non-member gets `NotFoundException` from any project-scoped endpoint, never a distinct "forbidden" — extended to the loosened members-read path, not just kept on the endpoints that still require admin.
