# Quickstart: Validating the Reference Layer

How to prove this works end to end. Shapes: [data-model.md](./data-model.md) and
[contracts/](./contracts/reference-review.md). This file is the run guide.

## Prerequisites

```bash
open -a Docker
docker compose up -d postgres
pnpm install
pnpm --filter api prisma:migrate     # applies the wipe migration (Q1)
pnpm dev
```

`apps/api/.env` needs `ANTHROPIC_API_KEY` and the R2 credentials. A contributor and an invited
client account on the same project.

> **Timing.** Analysis runs on the Batch API — best effort within 24 hours, and the sweep polls
> every five minutes. Every scenario below has a real wait between the action and the assertion.
> Shorten the sweep interval locally rather than sitting on it.

Prepare four documents up front, because the interesting behaviour only appears from the second:

| # | Content | Why |
|---|---|---|
| 1 | Project brief: goals, scope, a delivery date | Seeds two categories |
| 2 | Meeting notes **revising that date** and adding a risk | The merge, and a contradiction |
| 3 | A wide architecture diagram (PNG, > 8000 px) | Vision + the 014 normalization still works |
| 4 | Anything covering only planning | Proves untouched categories stay untouched |

---

## Scenario 1 — A first document seeds the reference layer (US1)

Upload document 1 as the contributor, wait for the sweep.

**Expect**: drafts appear in the review queue for the categories the brief genuinely addresses,
and for no others. Each reads as organised professional prose — **not** vulgarized, this is your
working document. The resource shows as `absorbed`.

**Also check** — the guarantee most likely to fail silently (FR-003): pick five facts from the
brief at random (a figure, a date, a name, a constraint, a decision) and find each one in the
draft. Any one missing means the prompt is compressing, and that loss is permanent once
validated.

## Scenario 2 — A second document merges rather than appends (US1)

Accept the drafts from Scenario 1, then upload document 2.

**Expect**: a new draft for the category holding the date. Read it: the **revised** date is
present, the stale one is not, and there is no second block appended under the first — one
integrated text. The risk added by document 2 is present.

**Also check**: categories document 2 does not address have no new draft (FR-005).

## Scenario 3 — The review queue, and the client during it (US2)

With a draft pending:

1. As the client, open the project. **Expect**: the previously validated content, not an empty
   tab and not the pending draft (FR-017).
2. As the contributor, **discard** the draft. Confirm the live content and what the client sees
   are both unchanged.
3. Re-trigger it (re-upload document 2), then **regenerate with an instruction** in plain words
   — e.g. *"the client doesn't need the retry mechanism, drop it"*. Confirm the new draft
   reflects it.
4. Regenerate twice more on the same draft. **Expect** the third refusal: the cap is reached,
   only accept and discard remain.
5. **Accept**. Confirm the client-facing text for that category updates without any further
   action from you (FR-014).

**Verify independence** (FR-014a): upload a document touching three categories. Three separate
drafts appear. Accept one, leave two pending. The accepted category goes live on its own; the
other two sit in the queue indefinitely and block nothing.

## Scenario 4 — The client reads one text (US3)

As the client, with three documents ingested and validated.

**Expect**: one tab per category with content, each holding a single continuous text. Nothing
reveals how many documents fed it — no blocks, no seams, no document titles. No accordion. No
link to a source document (out of scope this iteration).

**Expect no tab** for a category nothing has fed (FR-012).

## Scenario 5 — Deleting a document removes its claims (US4)

Delete document 2, whose only unique contribution was the revised date and the risk.

**Expect**: a draft for the affected category, triggered by the deletion. Read it: the risk is
gone and the date is back to document 1's version. Accept, and confirm the client-facing text
follows.

**Also check**: delete the last document feeding a category. Its content disappears and its tab
vanishes from the client view (FR-020).

## Scenario 6 — The diagram still works (regression on 014)

Upload document 3, the oversized PNG.

**Expect**: absorbed, with what the diagram shows described in the reference content. A `failed`
resource mentioning image dimensions means 014's normalization was collaterally removed — check
`image-normalizer.ts` survived (research.md Decision 10).

## Scenario 7 — Questions before guessing (US5, last slice)

Only once US5 ships. Ingest two documents contradicting each other on a client-visible fact.

**Expect**: the contradiction raised as a question rather than arbitrated. At most five
questions, most consequential first. Skip them all and validate anyway: validation succeeds, and
each skipped point is explicitly marked in the reference content rather than silently resolved.

---

## The one-off check that has no automated form

**SC-003 — no erosion after six ingestions.** Verified once, by hand, not in CI (research.md
Decision 7): ingest six documents one at a time, then the same six into a fresh project in a
single pass. Compare the two reference layers. They will not be identical — the question is
whether the incremental one has lost facts the single-pass one kept. If it has, the merge prompt
is compressing on each pass and the two-layer design is not doing its job.

Worth doing once before this is considered done, and again if the merge prompt changes.

---

## Automated checks

```bash
pnpm test:cov     # the 80% gate CI enforces
pnpm knip         # FR-025 — fails on anything left without a consumer
pnpm i18n:orphans # translation keys with no call site
```

Areas worth explicit coverage, because they fail quietly:

- A client never receives draft or reference content, by any route.
- Accepting one category does not touch another's draft or content.
- The attempt cap refuses a fourth regeneration.
- Deleting a document removes its extracts and regenerates exactly the categories it fed.
- Deleting the last contributing document removes the reference and its client content.
- Two simultaneous ingestions touching one category do not produce two drafts.
- An empty `categories` array from analysis fails the resource rather than silently doing
  nothing.

Mock `PrismaService` via `src/test/prisma-mock.ts` — no test may need Postgres or a real API key.
