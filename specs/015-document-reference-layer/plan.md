# Implementation Plan: Reference Documentation Layer & Derived Client Content

**Branch**: `feat/document-reference-layer` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-document-reference-layer/spec.md`

## Summary

Replace 014's per-document sections with two layers. A **reference layer** — one organised,
exhaustive body per category, built by merging each new document into what is already there,
validated once by the contributor. And a **client layer** derived from it, always regenerated
from the reference and never from a previous client version, which is what stops detail eroding
across successive ingestions.

Three pieces make the model work: a stored **extract** per (document, category), which is what
makes deletion possible without re-reading originals or asking a model to unmix prose; a
**draft** row separate from live content, which is what lets a client keep reading while a
regeneration awaits review; and **three explicit lifecycles** replacing the single status column
that 014 overloaded.

The user asked for this change specifically not to leave waste behind, so removal is a
first-class requirement (FR-024/FR-025) with a check that fails rather than a review checklist.

## Technical Context

**Language/Version**: TypeScript 5 (strict) — NestJS 11 (`apps/api`, CommonJS), Next.js 16 App Router (`apps/web`)

**Primary Dependencies**: Prisma 7 + `@prisma/adapter-pg`; `@anthropic-ai/sdk` (Batch API); Zod 4; `sharp`; Tailwind v4 + shadcn/ui; TanStack Query; next-intl. **New**: `knip` (dev-only, FR-025).

**Storage**: PostgreSQL. Original uploads stay in Cloudflare R2; all generated content — extracts, reference, client — lives in Postgres (spec I).

**Testing**: Jest + `createPrismaMock()` (api); Vitest + RTL (web). No test may require Postgres or a real `ANTHROPIC_API_KEY`.

**Target Platform**: Railway (API + Postgres), Node runtime for the web app.

**Project Type**: pnpm/Turborepo monorepo — web + API + one shared source-only package.

**Performance Goals**: one analysis request per ingestion, unchanged from 014 — no chained batches, because each link costs a full sweep cycle. Derivation is one request per accepted category.

**Constraints**: Batch API is fire-and-poll (best effort within 24h); the sweep is the only poller. `apps/api` cannot import `packages/schemas` (source-only, no build step). 80% coverage gate on both apps.

**Scale/Scope**: 4 fixed categories; a handful of documents per project. Five new tables, three removed surfaces, one destructive migration, one new dev dependency.

## Constitution Check

*Evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Verdict | Notes |
|---|---|---|
| **I. Test-First Coverage** | PASS | Each slice ships its tests. The quiet-failure areas are named in quickstart.md § Automated checks. This change deletes more than it adds in places, so coverage must be re-measured rather than assumed — same trap as 014. |
| **II. Type Safety, No Escape Hatches** | PASS | Analysis output is Zod-narrowed at the boundary regardless of the provider's tool schema. Category keys stay a Zod enum on the wire and a Postgres enum at rest. No `tsconfig` changes. |
| **III. Feature Isolation** | PASS | Reference review is contributor-facing and belongs in `features/resources`; the client reading surface composes with `features/current-task`, so it stays colocated with the page as today. Shared category constants keep coming from `packages/schemas`. |
| **IV. Never Resolve Open Decisions Unilaterally** | PASS | Q1–Q3 answered by the user (spec § Resolved Decisions). Two smaller calls are made here and named below rather than left to be discovered. |
| **V. Security and Privacy by Default** | PASS | A client can reach no route returning draft or reference content. Contributor-only routes collapse "not found", "wrong project" and "not a contributor" into one response. |
| **VI. Spec Before Multi-Screen Features** | PASS | spec.md approved; this is the plan step. |

### Judgement calls made here

1. **The attempt cap is three, and it lives on the draft.** Counting per draft rather than per
   category is what makes "three attempts at *this* correction" meaningful; accepting or
   discarding ends the loop by deleting the row. Three because a model that has missed the same
   correction three times will not get it on the fourth.
2. **Orphaned R2 objects are accepted** after the wipe migration rather than deleted from it. A
   migration is the wrong place for network calls, and in a development-only environment the
   cleanup buys nothing. Named so it is a decision, not an oversight.

## Project Structure

### Documentation (this feature)

```text
specs/015-document-reference-layer/
├── plan.md                          # This file
├── spec.md                          # Approved 2026-08-10
├── research.md                      # Phase 0 — 10 decisions
├── data-model.md                    # Phase 1
├── quickstart.md                    # Phase 1
├── contracts/
│   └── reference-review.md          # Phase 1
├── checklists/requirements.md
└── tasks.md                         # /speckit-tasks — not created here
```

### Source Code (repository root)

```text
packages/schemas/src/
├── category-content.ts              # NEW — draft, reference and client read shapes
├── resource.ts                      # CHANGED — sections out, status enum narrowed
└── resource-category.ts             # UNCHANGED — the frozen four

apps/api/
├── prisma/schema.prisma             # +5 models, +2 enums, −ResourceSection, ResourceStatus rewritten
├── prisma/migrations/<ts>_reference_layer/    # NEW — destructive (data-model.md § Migration)
└── src/resources/
    ├── reference-analysis.client.ts        # NEW — ingest / rebuild / derive request shapes
    ├── reference-output.schema.ts          # NEW — replaces document-sections-output.schema.ts
    ├── category-reference.service.ts       # NEW — merge, accept, discard, regenerate, rebuild
    ├── category-content.service.ts         # NEW — derivation from validated reference
    ├── categories.controller.ts            # NEW — the review queue + client read routes
    ├── resource-batch-sweep.service.ts     # CHANGED — persists extracts + drafts
    ├── resources.service.ts                # CHANGED — publish gone, delete triggers rebuild
    ├── resources.controller.ts             # CHANGED — section + publish routes removed
    ├── document-vulgarization.client.ts    # REMOVED — superseded by reference-analysis.client
    ├── document-sections-output.schema.ts  # REMOVED
    ├── dto/move-resource-section.dto.ts    # REMOVED
    ├── image-normalizer.ts                 # UNCHANGED — must survive (research.md Decision 10)
    └── resource-storage.client.ts          # UNCHANGED

apps/web/
├── app/[locale]/(protected)/projects/[id]/
│   ├── client-main-tabs.tsx                # CHANGED — one text per tab, no accordion
│   └── resources/[resourceId]/page.tsx     # CHANGED or REMOVED — see below
├── features/resources/
│   ├── api.ts, hooks.ts                    # CHANGED — draft queue replaces section calls
│   └── components/
│       ├── reference-draft-queue.tsx       # NEW — the contributor's review surface
│       ├── regenerate-draft-dialog.tsx     # NEW — refusal popup (discard / instruct)
│       ├── section-review-list.tsx         # REMOVED
│       ├── category-section-accordion.tsx  # REMOVED
│       └── resource-detail-page-content.tsx # CHANGED — no publish, no section review
├── shared/components/ui/accordion.tsx      # REMOVED — no consumer left
└── messages/{en,fr}.json                   # CHANGED — section/publish keys out, draft keys in

knip.json                                   # NEW — FR-025
scripts/check-i18n-orphans.mjs              # NEW — FR-025's blind spot
```

**Structure Decision**: unchanged three-package split. The one structural novelty is that
generated content moves from being attached to a resource to being attached to a project and a
category, which is why a `categories` controller appears alongside the existing `resources` one.

**An open shape question for `/speckit-tasks`**: with per-document publish and per-document
section review both gone, the resource detail page may have nothing left to justify a dedicated
route — the draft queue is project-level. Deciding between "keep it as a document detail view"
and "remove it and fold document management into the project page" is a UI call better made when
the queue exists to look at. Flagged rather than pre-empted.

## Phasing

Ordered so each slice leaves something verifiable, and so the layer everything reads from exists
before anything reads from it.

1. **Shared shapes + data model** — `packages/schemas` read shapes, Prisma models, the wipe
   migration. Nothing consumes them yet; the repo will not build until slice 2.
2. **Ingestion → extracts + drafts** — the analysis request, its Zod boundary, the sweep writing
   `CategoryExtract` and `CategoryReferenceDraft`. Verifiable in the database before any UI
   exists. This is where FR-003's exhaustiveness guarantee is won or lost.
3. **Review API** — the draft queue, accept, discard, regenerate with its cap; deletion
   triggering rebuild. Publish and the section routes go here.
4. **Derivation** — accepted reference produces client content in both locales.
5. **Contributor UI** — the draft queue and the refusal dialog.
6. **Client UI** — one text per tab; the accordion and its shadcn primitive go.
7. **Removal + verification** — knip and the i18n orphan check wired in, findings triaged,
   coverage re-measured.
8. **Questions to the contributor (US5)** — last, as specified.

Slices 2 and 3 are where the coverage gate is most at risk, since they delete existing specs
along with the code those specs covered.

**Slice 7 is not a cleanup phase.** Removals belong in the slice that orphans them — the section
routes die in slice 3, the accordion in slice 6. Slice 7 only proves nothing was missed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A stored `CategoryExtract` per (document, category), duplicating material that also lives merged inside `CategoryReference` | FR-019 requires deleting a document to regenerate its categories as if it had never been added. Extracts make that one merge request over surviving material. | Re-reading every remaining original from storage on each deletion — several requests, re-parsing PDFs, re-running vision, every time. Asking the model to subtract one document's contribution from merged prose — it cannot know which sentence came from where. |
| A new dev dependency (`knip`) purely for verification | FR-025 makes "nothing survives without a consumer" a requirement, and the user asked for it to be enforced rather than asserted. knip fails with a non-zero exit code, which is the property that matters. | A grep checklist in tasks.md — rejected, this requirement exists precisely because checklists get skipped under a large diff. ESLint's unused-vars — works within a file, and every symbol here is exported, so it sees nothing. |
| Five new tables where 014 had one | Three things now progress independently (document, reference, client content) and the previous single status column is what made 014 hard to reason about. Drafts are separate from live content so FR-017 is structural rather than a filter everyone must remember. | Columns on a single row (`liveContent`/`draftContent`) — every read has to remember which column it wants, and the review-loop fields pollute validated records. |
