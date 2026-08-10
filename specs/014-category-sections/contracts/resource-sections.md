# Contract: Resource Section Endpoints

All routes hang off the existing `@Controller('projects/:projectId/resources')`
(`apps/api/src/resources/resources.controller.ts`), guarded by the existing `SessionGuard` plus
the membership checks already in `ResourcesService`. No new controller, no new module.

Shapes and role filtering: [data-model.md](../data-model.md).

---

## Removed

| Route | Replaced by |
|---|---|
| `POST /projects/:projectId/resources/:resourceId/categories/:categoryId/approve` | `.../sections/:sectionId/approve` |
| `POST /projects/:projectId/resources/:resourceId/categories/:categoryId/reject` | `.../sections/:sectionId/reject` |

There is no compatibility window: 013's assignment rows are dropped by the same migration, so
the old routes have nothing to act on.

---

## `POST /projects/:projectId/resources/:resourceId/sections/:sectionId/approve`

Approves one proposed section. Contributor-only.

- **Response**: `204 No Content`. Matches the style the two routes it replaces already use, and
  the caller refetches the resource anyway to re-render the review list.
- **Errors**:
  - `404` if the section doesn't belong to `resourceId`, or `resourceId` doesn't belong to
    `projectId`, or the caller is not a contributor on the project. One indistinguishable
    response for all four cases — never confirms existence to someone who shouldn't know
    (Constitution V).
  - `409` if the section is not `proposed` (already approved or rejected — one-way).
- Approving one section changes nothing about the resource's other sections or its own
  `status` (FR-014).

## `POST /projects/:projectId/resources/:resourceId/sections/:sectionId/reject`

Identical shape; sets `status: rejected`. A rejected section is never visible to a client
(FR-016) and never blocks the resource's other sections or its publication (FR-014).

## `POST /projects/:projectId/resources/:resourceId/sections/:sectionId/move`

Re-files a mis-categorized section. Contributor-only.

- **Body**: `{ "categoryKey": "overview" | "how_it_works" | "planning" | "other" }`, validated
  against the frozen list.
- **Response**: `204 No Content`.
- **Errors**:
  - `400` if `categoryKey` is not one of the four.
  - `404` — same conditions and same rationale as `approve`.
  - `409` if the section is not `proposed` (research.md Decision 4), **or** if the target
    category already holds a section of this same resource (`@@unique(resourceId,
    categoryKey)`). The two cases carry distinct messages; both are legitimately visible to a
    contributor who already has access to the resource.
- Never modifies the section's title or content (FR-015).

## `POST /projects/:projectId/resources/:resourceId/publish` (existing route, new precondition)

Unchanged except for one added guard: refused with `400` when the resource has **no approved
section**. Publishing one would produce a resource that is `published` yet contributes to no
tab — indistinguishable from a bug for both roles (research.md Decision 4). The existing
`ready_for_review`-only precondition still applies.

## `GET /projects/:projectId/resources` (existing route, changed response)

No new route; the response shape changes.

- Each entry loses `vulgarizedTitle`, `vulgarizedContent` and `categories`, and gains
  `sections` — **with full `content`**, which is what lets the client read without navigating
  (FR-019).
- `originalFileUrl` is now populated here too, not only on the single-resource route (FR-020).
- Role filtering as per data-model.md: a client sees `approved` sections of `published`
  resources; a contributor sees everything.

## `GET /projects/:projectId/resources/:resourceId` (existing route, now contributor-only)

Same response shape as the list entry. Two changes:

- Returns `404` for a client-role member, whatever the resource's status — the detail page is
  the contributor's review screen and nothing else (Q2). Same response a non-member gets.
- No longer carries a whole-document rewrite, because none is produced (Q1).

---

## Analysis provider contract (internal, `DocumentVulgarizationClient`)

Not an HTTP surface, but the tool schema is a contract the rest of the feature depends on.
One request per document (research.md Decision 1), forced tool use, `max_tokens: 32000`:

```jsonc
{
  "name": "submit_document_sections",
  "input_schema": {
    "type": "object",
    "properties": {
      "sections": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "categoryKey": {
              "type": "string",
              "enum": ["overview", "how_it_works", "planning", "other"]
            },
            "titleEn":   { "type": "string" },
            "contentEn": { "type": "string" },
            "titleFr":   { "type": "string" },
            "contentFr": { "type": "string" }
          },
          "required": ["categoryKey", "titleEn", "contentEn", "titleFr", "contentFr"]
        }
      }
    },
    "required": ["sections"]
  }
}
```

Parsing rules on the way back in:

- Validate with Zod at the boundary regardless of the tool schema — a third-party boundary is
  narrowed explicitly, not trusted (Constitution II). Existing practice in this client.
- A duplicate `categoryKey` in one response is **not** an error: the later entry is merged into
  the earlier one rather than violating `@@unique` (spec Edge Cases).
- An empty `sections` array, or a malformed/truncated tool call, ends the resource as `failed`
  with a readable reason — never a silent success and never a resource stuck in `processing`
  (FR-012).

Unlike 013, there is no best-effort degradation path: sections *are* the content, so a failed
analysis is a failed resource. 013's "categories are optional, content still ships" logic
disappears with the whole-document rewrite it protected.
