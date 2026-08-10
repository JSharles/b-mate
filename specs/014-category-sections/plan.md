# Implementation Plan: Fixed Categories & Per-Category Document Sections

**Branch**: `feat/document-processing-categories` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-category-sections/spec.md`

## Summary

Replace 013's "AI invents categories, then labels whole documents with them" model with
"categories are four fixed product constants, and the AI extracts what each document says about
each one". The unit of content becomes a **section** — one per (document, category) pair the
document actually addresses — which is what makes each client tab show different text even when
two tabs draw from the same source document.

Technically this is four coordinated changes: a single-request analysis pass producing both
languages of every section at once (replacing three requests), a `ResourceSection` table
replacing three tables, section-level review endpoints replacing category approve/reject, and a
client accordion fed by a list endpoint that finally carries content. A fifth, independent fix
normalizes oversized images before analysis, which is what breaks the reported PNG failure.

## Technical Context

**Language/Version**: TypeScript 5 (strict) on Node — NestJS 11 (`apps/api`, CommonJS), Next.js 16 App Router (`apps/web`)

**Primary Dependencies**: Prisma 7 (`prisma-client-js` generator) + `@prisma/adapter-pg`; `@anthropic-ai/sdk` (Batch API); Zod 4; Tailwind v4 + shadcn/ui; TanStack Query; next-intl. **New**: `sharp` in `apps/api` (image normalization — research.md Decision 6), shadcn `accordion` in `apps/web`.

**Storage**: PostgreSQL (Docker locally, Railway in production). Original files in Cloudflare R2 via the S3-compatible SDK, unchanged by this feature.

**Testing**: Jest + `createPrismaMock()` (`apps/api`); Vitest + React Testing Library (`apps/web`). No test may require Postgres or a real `ANTHROPIC_API_KEY`.

**Target Platform**: Railway (API + Postgres), Vercel-style Node runtime for the web app.

**Project Type**: pnpm/Turborepo monorepo — web frontend + API backend + one shared source-only package.

**Performance Goals**: Analysis cost and latency per document down roughly two thirds (SC-008) — three batch requests become one. Client tab switching stays instantaneous: sections arrive with the existing resource list query, no per-tab fetch.

**Constraints**: Analysis provider input limits — 8000 px max dimension, 10 MB max base64 per image, 32 MB max request (research.md Decision 6). `apps/api` cannot import `packages/schemas` (source-only, no build step — AGENTS.md § Gotchas). 80% coverage gate on both apps.

**Scale/Scope**: 4 fixed categories; a handful of documents per project today. ~15 files touched across three packages, one destructive Prisma migration, one new API dependency.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Verdict | Notes |
|---|---|---|
| **I. Test-First Coverage** | PASS | Each slice ships its tests. Highest-risk areas named in quickstart.md § Automated checks — section role filtering, the two `409` paths on move, publish refusal, normalization bounds, analysis-response parsing. Deleting three tables removes their existing specs too; net coverage must be re-measured, not assumed. |
| **II. Type Safety, No Escape Hatches** | PASS | Analysis output is narrowed with Zod at the boundary regardless of the provider's own tool schema (existing practice in `DocumentVulgarizationClient`). Category keys are a Zod enum on the wire and a Postgres enum at rest. No `tsconfig` changes. |
| **III. Feature Isolation** | PASS | `client-main-tabs.tsx` composes `features/current-task` and `features/resources`, so it stays colocated with the page rather than inside either feature — the existing, already-documented arrangement. The category constant is shared via `packages/schemas`, not imported across features. |
| **IV. Never Resolve Open Decisions Unilaterally** | PASS, with two named judgement calls | Q1–Q3 and the category list were answered by the user (spec.md § Resolved Decisions). Two smaller calls are made here rather than escalated, because both are implementation consequences of already-approved requirements rather than new product rules — flagged below so they are reviewed, not discovered. |
| **V. Security and Privacy by Default** | PASS | A client never receives a `proposed` or `rejected` section (FR-016). The detail route answers `404` to a client — the same answer a non-member gets, never a distinguishable "exists but forbidden". Section endpoints collapse "not found", "wrong resource", "wrong project" and "not a contributor" into one response. |
| **VI. Spec Before Multi-Screen Features** | PASS | spec.md approved; this plan is the `/speckit-plan` step. |

### Judgement calls made here (not escalated)

1. **Move is allowed only while a section is `proposed`.** Moving after approval would take a
   section out of a category a client is already reading, silently. Consequence: a mis-filing
   noticed after approval is fixed by deleting and re-adding the document — the same escape
   hatch the spec already relies on for having no editing.
2. **Publishing is refused when no section is approved.** Such a resource would be `published`
   yet contribute to no tab, which reads as a bug to both roles. This follows from SC-005 and
   SC-007 rather than adding a rule, but it is a behaviour change worth seeing in review.

Both are cheap to reverse if the user disagrees.

## Project Structure

### Documentation (this feature)

```text
specs/014-category-sections/
├── plan.md                            # This file
├── spec.md                            # Approved 2026-08-09
├── research.md                        # Phase 0 — 8 decisions
├── data-model.md                      # Phase 1
├── quickstart.md                      # Phase 1
├── contracts/
│   └── resource-sections.md           # Phase 1
├── checklists/
│   └── requirements.md
└── tasks.md                           # /speckit-tasks — not created here
```

### Source Code (repository root)

```text
packages/schemas/src/
├── resource-category.ts               # NEW — frozen list + ResourceCategoryKeySchema
├── resource.ts                        # CHANGED — sections replace vulgarized*/categories
└── index.ts                           # CHANGED — export the new module

apps/api/
├── prisma/schema.prisma               # CHANGED — +ResourceSection, +2 enums, −3 models, −1 enum
├── prisma/migrations/<ts>_category_sections/   # NEW — destructive, incl. the resource-status UPDATE
└── src/resources/
    ├── resource-categories.ts         # NEW — hand-copy of the frozen list (see Complexity Tracking)
    ├── image-normalizer.ts            # NEW — sharp; long edge ≤ 2576 px, ≤ 5 MB raw
    ├── document-sections-output.schema.ts   # REPLACES document-vulgarization-output.schema.ts
    ├── document-vulgarization.client.ts     # CHANGED — one request, both locales, new tool schema
    ├── resource-batch-sweep.service.ts      # CHANGED — persists sections, drops the category upsert
    ├── resources.service.ts                 # CHANGED — section review, uniform toResponse, publish guard
    ├── resources.controller.ts              # CHANGED — /sections/:id/{approve,reject,move}
    └── dto/move-resource-section.dto.ts     # NEW

apps/web/
├── app/[locale]/(protected)/projects/[id]/
│   ├── client-main-tabs.tsx           # CHANGED — group sections, frozen tab order, accordion
│   └── resources/[resourceId]/page.tsx      # CHANGED — contributor-only, redirects a client
├── features/resources/
│   ├── api.ts, hooks.ts               # CHANGED — section endpoints replace category ones
│   └── components/
│       ├── category-section-accordion.tsx   # NEW — client reading surface
│       ├── section-review-list.tsx          # NEW — contributor review surface
│       ├── resource-detail-page-content.tsx # CHANGED — review screen, canManage removed
│       └── resource-tile.tsx                # UNCHANGED — developer's flat list
├── shared/components/ui/accordion.tsx  # NEW — shadcn add
└── messages/{en,fr}.json               # CHANGED — category labels come from schemas, not here
```

**Structure Decision**: the monorepo's existing three-package split is unchanged. The only
structural novelty is that a piece of *product data* (the category list) now lives in
`packages/schemas` and is mirrored into `apps/api` — see Complexity Tracking.

## Phasing

Ordered so each slice leaves the app working and testable.

1. **Shared constants + schema** — `packages/schemas` category list and revised `Resource`
   shape; the `apps/api` mirror. No behaviour change yet; nothing consumes them.
2. **Data model** — Prisma changes and the destructive migration (data-model.md § Migration).
3. **Analysis** — new tool schema, one request, both locales; new prompt (research.md
   Decision 8); sweep persists sections. This is the slice that makes SC-001 and SC-008 true.
4. **Image normalization** — `sharp` + `image-normalizer.ts`. Independent of 1–3; can ship
   first if the PNG fix is wanted sooner. **Read the failing resource's `failureReason` before
   writing it** (research.md § Open item).
5. **Review API** — section approve/reject/move, publish guard, uniform `toResponse`,
   contributor-only `findOne`.
6. **Contributor UI** — detail page becomes the review screen.
7. **Client UI** — accordion, section grouping, frozen tab order.

Slices 3 and 5 are where the coverage gate is most likely to slip, since they delete existing
specs along with the tables and code paths those specs covered.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| The category list is duplicated in `apps/api/src/resources/resource-categories.ts` instead of being imported from `packages/schemas`, against the Technical Constraint "check whether a type or validation rule belongs there before duplicating it" | `packages/schemas` ships as TypeScript source with no build step; `apps/api` runs compiled CommonJS and cannot `require()` raw `.ts` (AGENTS.md § Gotchas). The codebase already resolves this exact conflict the same way — `apps/api/src/task-vulgarization/locale.ts` is a documented hand-copy of `apps/web/i18n/routing.ts`. | Adding a build step to `packages/schemas` is the correct long-term fix and is already logged as debt in AGENTS.md, but it changes how both apps consume the package and is disproportionate for four constants. Revisit when more of the API surface needs sharing, not here. |
| The same four keys exist a third time as a Prisma enum | Database-level integrity: a bad `category_key` becomes impossible rather than merely unlikely, and the enum is what a future migration renames against. | A plain `String` column with app-level validation only — rejected; it makes the invariant depend entirely on the two code copies staying correct, with no backstop. |
