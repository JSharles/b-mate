# Quickstart: Validating Fixed Categories & Per-Category Sections

How to prove this feature works end to end once implemented. Shapes live in
[data-model.md](./data-model.md) and [contracts/](./contracts/resource-sections.md); this file
is the run guide.

## Prerequisites

```bash
open -a Docker                                   # macOS, if not already running
docker compose up -d postgres                    # from the repo root
pnpm install                                     # root only
pnpm --filter api prisma:migrate                 # applies the destructive 014 migration
pnpm dev                                         # web + api in watch mode
```

`apps/api/.env` must carry `ANTHROPIC_API_KEY` and the R2 credentials
(`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) — without R2 the
upload path fails before analysis is ever reached, which looks like an analysis bug.

Two accounts on the same project are needed: a **contributor** and an invited **client**.

---

## Scenario 1 — A messy document splits into distinct sections (US1)

Prepare a PDF that deliberately mixes three things: a paragraph on what the project is for, a
diagram of how the pieces fit together, and a couple of delivery dates.

1. As the contributor, open the project → **Add resource** → upload the PDF.
2. The resource appears immediately as `processing`.
3. Analysis runs on a cron sweep every 5 minutes. To avoid waiting, either restart the API (the
   sweep fires on the next tick) or temporarily shorten the interval in
   `ResourceBatchSweepService`.

**Expect**: the resource reaches `ready_for_review` carrying **three** sections — one under
`overview`, one under `how_it_works`, one under `planning` — each containing only its own slice
of the source, each with its own title.

**Also check** (this is the requirement most at risk, FR-007): read the three sections together
and confirm nothing of substance in the source is missing. Anything that fitted no specific
category should be present under `other`, not absent.

**Verify both languages agree** (FR-011): switch the interface locale and confirm the *same
three categories* appear, differing only in language — not two in one locale and three in the
other.

## Scenario 2 — Review, re-file, publish (US2)

Still as the contributor, open the resource's detail page — now the review screen.

1. **Approve** one section → the other two are unaffected, and the resource's own status does
   not change.
2. **Reject** another → it is marked rejected and stays out of the client's view forever.
3. **Move** the third to a different category → its category changes, its title and content do
   not.
4. Try to move it to a category that already holds a section of this resource → refused with a
   readable message, not a crash.
5. Try to re-approve an already-approved section → refused (`409`).
6. **Publish**.

**Also check**: on a resource where every section is rejected, publishing is refused with a
plain-language reason rather than producing a published-but-invisible resource.

**Verify the page is contributor-only** (Q2): open the same URL while signed in as the client.
Expect to be sent back to the project, and the underlying API call to answer `404` — the same
answer a non-member gets, not a distinguishable "forbidden".

## Scenario 3 — The client reads inline (US3)

Sign in as the client and open the project.

**Expect**:

- Tabs alongside **Current Task**, one per category that actually has approved published
  content — and **no** tab for a category with none (SC-007).
- Tab order is always the frozen order, `other` last, regardless of what arrived when.
- Opening a tab shows the **first section's full content already visible**, no click required;
  the others are collapsed titles (SC-002).
- Each block offers the original document — preview or download for an upload, a link to the
  page for a Notion source.
- **The decisive check (SC-001)**: switch between two tabs that drew from the *same* source
  document and confirm the text differs. Identical text between tabs is the exact defect this
  feature exists to remove.

## Scenario 4 — An architecture-diagram PNG is read, not rejected (US4)

Use a genuinely large diagram export — wide, e.g. 12000 × 3000 px, ~15 MB — since a small PNG
would pass even with the bug present and prove nothing.

1. Upload it as the contributor.
2. Wait for the sweep.

**Expect**: `ready_for_review`, with a section (typically under `how_it_works`) that **describes
what the diagram shows** — its components and how they relate — rather than noting that a
diagram exists (FR-008).

**Regression signal**: a `failed` resource whose `failureReason` mentions image dimensions or
request size means normalization did not run, or ran with the wrong bounds.

**Before writing the fix**, read the recorded `failureReason` of the currently-failing PNG:

```bash
pnpm --filter api prisma:studio   # table `resources`, column `failure_reason`
```

research.md Decision 6 predicts a dimension or payload rejection. If it says something else, the
normalization work is still correct hygiene but is not the cause, and the real cause is open.

## Scenario 5 — Carried-over resources are visibly stale (Q3)

Requires a database that already held 013-era data.

**Expect**: after the migration, previously published resources appear to the contributor as
`failed`, with a reason explaining they need re-adding — not as healthy resources that silently
show a client nothing.

---

## Automated checks

```bash
pnpm test          # both apps
pnpm test:cov      # the 80% gate CI enforces — run this before opening the PR
```

New code ships with its tests in the same change (Constitution I). The areas worth explicit
coverage, because they are where this feature can fail quietly:

- Section grouping and tab construction — a client must never see a `proposed` or `rejected`
  section, and an empty category must produce no tab.
- The move endpoint's two distinct `409` paths (not `proposed`; target occupied).
- Publish refusal when no section is approved.
- Image normalization bounds — an oversized image is resized, an already-small one is left
  alone.
- Analysis-response parsing: duplicate `categoryKey` merges, empty `sections` fails the
  resource, truncated tool call fails the resource with a reason.

Mock `PrismaService` via `src/test/prisma-mock.ts` — no test in this repo may require Postgres
or a real `ANTHROPIC_API_KEY`.
