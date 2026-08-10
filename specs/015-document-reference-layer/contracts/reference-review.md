# Contract: Reference Review & Category Content

Routes hang off the existing `@Controller('projects/:projectId/resources')` and a new
`@Controller('projects/:projectId/categories')`, both guarded by the existing `SessionGuard`
plus the membership checks already in place. Shapes: [data-model.md](../data-model.md).

---

## Removed

| Route | Why |
|---|---|
| `POST /projects/:p/resources/:r/sections/:s/approve` | Review moves to the category layer |
| `POST /projects/:p/resources/:r/sections/:s/reject` | Same |
| `POST /projects/:p/resources/:r/sections/:s/move` | Nothing left to move (FR-024) |
| `POST /projects/:p/resources/:r/publish` | Q3 — no per-document publication |

No deprecation window: the migration drops the rows these acted on.

---

## `GET /projects/:projectId/categories/drafts`

The contributor's review queue. Contributor-only.

- **Response** `200`: an array of pending drafts, each carrying its `categoryKey`, `content`,
  `status`, `attempt`, `trigger` and the name of the document that triggered it. Ordered oldest
  first — the queue is worked through, not browsed.
- FR-014a: these are **independent items**, not grouped by triggering document. One document
  touching three categories appears here three times, and each is disposed of on its own.
- **Errors**: `404` for a client-role member or a non-member — one indistinguishable response
  (Constitution V).

## `POST /projects/:projectId/categories/:categoryKey/draft/accept`

Promotes the pending draft to live reference content, deletes the draft row, and enqueues
derivation of that category's client content.

- **Response** `204`.
- **Errors**: `404` — no pending draft for this category, or the caller is not a contributor.
- Accepting one category MUST NOT touch any other category's draft or content (FR-014a).

## `POST /projects/:projectId/categories/:categoryKey/draft/discard`

Drops the pending draft. The previously validated reference content and the client content
derived from it are untouched (FR-018).

- **Response** `204`.
- **Errors**: `404` — same conditions as accept.

## `POST /projects/:projectId/categories/:categoryKey/draft/regenerate`

Asks for another attempt, in the contributor's own words.

- **Body**: `{ "instruction": string }` — non-empty, length-bounded.
- **Response** `202`: the work is asynchronous; a new draft replaces the current one when the
  analysis returns.
- **Errors**:
  - `400` — empty or oversized instruction.
  - `404` — no pending draft, or not a contributor.
  - `409` — the attempt cap is reached (research.md Decision 4). The message says so plainly;
    only accept and discard remain.

## `GET /projects/:projectId/categories/content`

What a client reads. Available to both roles.

- **Response** `200`: an array of `{ categoryKey, content }`, `content` already resolved to the
  caller's locale, ordered by the frozen category list so tabs never reshuffle (FR-012).
- A category with no `CategoryContent` is **absent** from the array — that is what produces "no
  empty tab" (FR-012), and it is the only mechanism doing so.
- A client never receives draft or reference content through any route.

## `DELETE /projects/:projectId/resources/:resourceId` (existing route, new consequence)

Still deletes the document and its stored original. Now also removes its extracts and enqueues
regeneration of every category it fed, whose drafts enter the same review queue (FR-019).

- **Response** `204`, unchanged. Regeneration is asynchronous and does not block the delete.

---

## Analysis contract (internal)

Two distinct request shapes, both single-request per unit of work (research.md Decisions 2 and 5).

### Ingestion — one request per document

Input: the document, plus the current reference content of all four categories.
Output, via forced tool use:

```jsonc
{
  "name": "submit_reference_update",
  "input_schema": {
    "type": "object",
    "properties": {
      "categories": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "categoryKey": { "type": "string", "enum": ["overview", "how_it_works", "planning", "other"] },
            "extract":   { "type": "string" },  // what THIS document contributes
            "reference": { "type": "string" }   // existing content + extract, integrated
          },
          "required": ["categoryKey", "extract", "reference"]
        }
      }
    },
    "required": ["categories"]
  }
}
```

Rules on the way back in:

- Zod-validate at the boundary regardless of the tool schema — a third-party boundary is
  narrowed explicitly, not trusted (Constitution II).
- A category absent from the array is a category this document does not address: it is **not**
  regenerated (FR-005).
- An empty `categories` array means the document contributed nothing. The resource ends `failed`
  with a reason the contributor can read (spec Edge Cases) — never a silent no-op.
- A truncated or malformed tool call ends the resource `failed`. Categories keep their existing
  live content; the failure is recorded against the document, not the category (Edge Cases).

### Rebuild — one request per category

Used for deletion (FR-019) and for regeneration-with-instruction (FR-016). Input: the surviving
extracts for that category, plus the instruction when there is one. Output: a single `reference`
string. No `extract` field — nothing new is being contributed.

Deletion leaving zero extracts skips the request entirely: the reference and its client content
are removed outright (FR-020).

### Derivation — one request per category, both locales

Input: validated reference content. Output `{ contentEn, contentFr }`. Both locales in one
request is what structurally guarantees they say the same thing (research.md Decision 5), and
the reference content is the only content input — which is what makes FR-010 true by
construction rather than by discipline.
