# Research: Fixed Categories & Per-Category Document Sections

Phase 0 output for [spec.md](./spec.md). Each decision below resolves an unknown that the
implementation would otherwise have to guess at.

---

## Decision 1 — One analysis request per document, producing both languages together

**Decision**: Replace the current three-request batch (one per locale for the whole-document
rewrite, plus one locale-agnostic category detection) with **a single request** whose tool
schema returns an array of sections, each carrying `categoryKey` plus `titleEn`/`contentEn`/
`titleFr`/`contentFr`.

**Rationale**: FR-011 requires the two languages to agree on which categories a document is
split into and where each section's content begins and ends. Deciding that once, in one
generation, makes the guarantee structural rather than something to enforce afterwards. It
also delivers SC-008 directly: three requests become one. The pattern is already established
in this codebase — 013's category detection produced `labelEn` and `labelFr` in a single
request for exactly the same reason.

**Alternatives considered**:

- *One request per locale, reconciled afterwards* — rejected. Each locale would independently
  decide which categories apply, so `fr` could yield a section `en` doesn't. Reconciling by
  taking the union leaves a reader seeing content their counterpart doesn't; taking the
  intersection silently drops content, violating FR-007.
- *Two phases: segment once, then translate* — rejected. It needs two sequential batches, and
  the Batch API is fire-and-poll, so the second batch can only be submitted after a sweep
  observes the first completing. That roughly doubles wall-clock latency to save nothing.

**Consequence — output budget**: the union of a document's sections is comparable in length to
one whole-document rewrite, and we now ask for two languages in one response. `max_tokens`
moves from 8192 to **32000**. The Batch API has no HTTP-timeout concern (unlike a synchronous
request, where anything above ~16000 needs streaming), and the model's ceiling is well above
this. Truncation still degrades gracefully: an incomplete tool call fails schema parsing, which
`pollBatch` already converts into a `failed` resource with a readable reason (FR-012).

---

## Decision 2 — Category keys are identifiers, duplicated per app, not a database table

**Decision**: The four categories live as a frozen, ordered constant in **three** places, all
using the same four identifier-safe strings (`overview`, `how_it_works`, `planning`, `other`):

| Where | What | Consumed by |
|---|---|---|
| `packages/schemas/src/resource-category.ts` | ordered array of `{ key, labelEn, labelFr }` + a Zod enum of the keys | `apps/web` |
| `apps/api/src/resources/resource-categories.ts` | the same array, hand-copied | `apps/api` |
| `apps/api/prisma/schema.prisma` | `enum ResourceCategoryKey` | Postgres |

**Rationale**: FR-001 forbids per-project categories, so there is nothing to store — a table
would only hold four rows that are identical in every environment and must never drift.
Removing the table also removes 013's entire upsert-a-category-on-the-fly path. The duplication
into `apps/api` is forced by a documented constraint, not a choice: `packages/schemas` ships as
TypeScript source with no build step, and `apps/api` runs compiled CommonJS, so it cannot
consume the package (AGENTS.md § Gotchas). The codebase already handles this exact situation
the same way — `apps/api/src/task-vulgarization/locale.ts` is a hand-copy of
`apps/web/i18n/routing.ts`, with a comment saying so. Following the established pattern beats
introducing a build step for four constants.

**Why identifier-safe keys rather than kebab-case**: Prisma enum values cannot contain hyphens,
so `how-it-works` would need `@map`, giving the same category two spellings (one in TypeScript,
one on the wire and in the database) and a mapping layer between them. The key is never shown to
a user (FR-002 — only the labels are), so `how_it_works` costs nothing in readability and keeps
one spelling everywhere.

**Alternatives considered**: keeping `ResourceCategory` as a seeded table — rejected; it makes
the fixed list mutable at runtime, which is precisely the failure 013 exhibited, and adds a
join to every read. Adding a build step to `packages/schemas` — rejected as out of proportion,
though it remains the right fix when more of the API surface needs sharing (already logged as
known debt in AGENTS.md).

---

## Decision 3 — `ResourceSection` replaces three tables; the migration is destructive

**Decision**: Drop `ResourceVulgarization`, `ResourceCategory`, `ResourceCategoryAssignment`
and the enum `ResourceCategoryAssignmentStatus`. Add a single `ResourceSection` table (shape in
[data-model.md](./data-model.md)). In the same migration, mark every non-`failed` resource as
`failed` with a plain-language reason.

**Rationale**: Q3 chose a clean slate, and Q1 removed the whole-document rewrite that
`ResourceVulgarization` existed to hold. Leaving surviving resources at `published` would make
them invisible to clients (FR-018 hides categories with no approved section) while still
reading as fine to the contributor — a silent empty state that looks like a bug. Marking them
`failed` with a reason surfaces exactly what happened and what to do, and reuses a state the UI
already renders.

**Alternatives considered**: reprocessing every existing resource automatically — rejected by
Q3, and it would leave every project's client view empty until a human revalidated each one
anyway, at the cost of a batch call per document. Deleting the resource rows outright —
rejected; the contributor loses the original files with no warning.

---

## Decision 4 — Section review: approve, reject, and move-while-proposed

**Decision**: A section's state machine is `proposed → approved | rejected`, one-way (inherited
from 013's assignment model). **Moving** a section to a different category is allowed only while
it is `proposed`, and is refused with `409` when the target category already holds a section
from the same document.

**Rationale**: The contributor's flow is read → file correctly → approve, so move-before-decide
covers the real case. Allowing a move after approval would mean a section can leave a category a
client is already reading, with no notification. The occupied-target refusal implements the
spec's stated assumption (merging two independently written rewrites produces incoherent prose;
the contributor rejects one and moves the other).

**Additional guard**: `publish()` is refused when the resource has **no approved section** — the
resulting resource would be published yet contribute nothing to any tab, which is
indistinguishable from a bug for both roles. This is an implementation-level consequence of
SC-005 and SC-007 rather than a new product rule, but it is a behaviour change worth naming.

---

## Decision 5 — Read shape: sections travel with the list, `includeDetails` disappears

**Decision**: `ResourceResponse` loses `vulgarizedTitle`, `vulgarizedContent` and `categories`,
and gains `sections`. Both the list and the single-resource endpoints return the full section
content, and `originalFileUrl` is populated on both.

**Rationale**: FR-019 requires reading without navigation, and the current
`toResponse(..., includeDetails: false)` in `findAllForProject` is exactly what makes that
impossible today — the list carries titles only. Populating `originalFileUrl` on every list row
costs nothing measurable: presigning is a local HMAC over the request, not a call to R2.

Role filtering stays where it already is: a client receives only `approved` sections belonging
to `published` resources; a contributor receives everything. Same shape as the existing
`status`-based filter in `findAllForProject`.

---

## Decision 6 — Normalize images before analysis, using `sharp`

**Decision**: Add `sharp` to `apps/api`. Before an image is handed to analysis, resize it so its
long edge is at most **2576 px** and re-encode if the result still exceeds a **5 MB** raw
budget, preserving aspect ratio and keeping PNG for PNG input.

**Rationale** — the published input limits of the analysis provider, which the current code
respects none of:

| Limit | Value | Today |
|---|---|---|
| Max image dimensions | 8000 × 8000 px | unchecked |
| Max size per image | 10 MB base64 (≈ 7.5 MB raw) | uploads allowed to 25 MB |
| Max request size | 32 MB | the same image was sent **3×** per request |
| Long edge beyond which the provider downscales anyway | 2576 px | n/a |

An architecture-diagram export breaches the first or second, and rejection happens per-request
at *execution* time, not submission — which is why the resource is created successfully and only
fails minutes later when the sweep reads the result. That matches the reported symptom exactly.
Because the provider downscales past 2576 px regardless, doing it ourselves loses no fidelity and
converts a delayed, opaque rejection into a deterministic local step. Decision 1 independently
removes two of the three copies of the payload.

**Alternatives considered**: passing an R2 presigned URL instead of base64 — rejected; it dodges
the payload limits but not the 8000 px limit, and a short-lived URL is unsafe against a batch
that may run for hours. The provider's Files API — rejected for the same dimension reason, plus
it is a beta surface.

**Risk to verify during implementation**: `sharp` ships platform-specific native binaries as
optional dependencies. Modern versions need no postinstall script, so pnpm's default script
blocking should not bite, and Railway's Nixpacks build runs on Linux x64 like the runtime. Both
assumptions are cheap to check (`pnpm --filter api add sharp` then a local run, and the first
deploy) and there is no viable alternative library if they fail — flag immediately rather than
working around it.

---

## Decision 7 — Frontend: a shadcn accordion, grouping sections rather than resources

**Decision**: Add the shadcn `accordion` primitive (not currently installed). Rewrite
`client-main-tabs.tsx` to group **sections** by `categoryKey` instead of grouping resources by
approved category. Tab order follows the frozen category order, so `other` is always last.
The resource detail page becomes the contributor-only review screen.

**Rationale**: The current grouping is not wrong — it is grouping the wrong unit, which is why
every tab shows the same documents. Grouping sections makes tab content differ by construction,
since a document contributes a *different* section to each category it touches. A frozen tab
order also means tabs don't reshuffle as content accumulates.

For the detail page, Q2 makes it contributor-only. Guarding it in two places: the page redirects
a client-role member back to the project, and `findOne` returns `404` for a client — the same
response a non-member gets, never a distinguishable "exists but forbidden" (Constitution V).

`shared/components/ui/**` is already excluded from the web coverage thresholds, so the generated
accordion needs no test and no config change.

---

## Decision 8 — One prompt, carrying the 011 guardrails plus the routing rule

**Decision**: A single system prompt that keeps 011's vulgarization guarantees verbatim
(rewrite rather than summarize, describe visual content, never fabricate, write in the target
language) and adds: the four categories with what each holds; produce a section only for a
category the document genuinely addresses; everything of substance must land in exactly one
section; anything fitting no specific category goes to `other`.

**Rationale**: FR-007 is the requirement most at risk from an extraction-shaped prompt — asking
for per-category extracts invites summarizing. Stating the coverage obligation in the same
prompt that assigns categories is what keeps the union lossless. The `other` category is what
makes that obligation satisfiable without padding the specific categories (FR-006).

---

## Decision 6 — confirmed against production data (2026-08-09, task T003)

The diagnosis was verified directly rather than inferred. Findings:

- The local database's failing upload is `MDW_SPORTS-ARCHITECTURE-2.png`, **8929 × 7392 px**,
  732 KB. The long edge exceeds the 8000 px ceiling; the byte size does not come close to any
  limit. A flat-colour diagram compresses extremely well, which is why file size was a
  misleading signal here.
- Two batches in the provider's history returned, on **all three** of their requests:

  ```
  invalid_request_error
  messages.0.content.0.image.source.base64.data:
  At least one of the image dimensions exceed max allowed size: 8000 pixels
  ```

- Normalizing that exact file to a 2576 px long edge yields 2576 × 2133 at 366 KB — well inside
  every limit, with the diagram still legible.

So the cause is the **dimension** ceiling specifically, not the payload ceiling. The payload
guard stays in the normalizer anyway (it costs nothing and covers photographic uploads, where
the byte budget is the binding constraint instead), but the dimension branch is what fixes the
reported bug.

**A second, distinct observation, not covered by any requirement in this spec**: the resource
was `processing`, never `failed`. Its batch was still `in_progress` two hours after submission,
so the sweep had correctly done nothing. The provider's batch API is best-effort within 24 hours,
which means a contributor can legitimately watch a document sit in `processing` for hours with no
indication of whether that is normal. Not in scope here — recorded so it is a deliberate omission
rather than an oversight.
