# Implementation Plan: Canonical Document Workflow

**Branch**: `codex/016-canonical-document-workflow` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-canonical-document-workflow/spec.md`

## Summary

Replace the document-by-document extract/reference pipeline with one contributor-readable, revisioned project source. Originals remain in R2 or at their connected-page URL; PostgreSQL stores atomic document observations, complete immutable source snapshots, information identities, provenance, and material clarifications. Only categories changed by a source revision receive factual drafts. Accepted factual references feed immutable client-release snapshots, so normal category updates remain independent while an editorial-profile change switches every published category atomically.

All model work moves behind a durable provider-neutral generation module. A versioned environment policy chooses ordered Anthropic/OpenAI routes by stage, permits a single provider or configurable cross-provider fallback, freezes inputs/policy per operation, and applies common schema/business validation before any human review or publication. Contributors use a dedicated documentary workspace with adaptive polling; provider names, diagnostics, provenance, source documents, and drafts never enter the client contract.

## Technical Context

**Language/Version**: TypeScript 5.7+ in strict mode; Node.js runtime supported by Next.js 16.2 and NestJS 11  
**Primary Dependencies**: Next.js 16 App Router, React 19, TanStack Query 5, next-intl 4, Tailwind CSS 4, shadcn/Radix UI; NestJS 11, Prisma 7, Zod 4, `@anthropic-ai/sdk`, new official `openai` SDK, AWS S3 SDK for R2, Mammoth and Sharp  
**Storage**: PostgreSQL via Prisma for authoritative source/revision/provenance/job/release data; Cloudflare R2 for unchanged uploaded originals; connected Notion page retained as its URL plus the immutable fetched snapshot/observations  
**Testing**: Jest 30 with `createPrismaMock()` and no `DATABASE_URL`/PostgreSQL dependency for API tests; Vitest 4 + React Testing Library for web; explicit manual quickstart validation against local Docker PostgreSQL for migrations, SQL constraints, reset, and concurrency smoke checks; root `pnpm test:cov` with 80% global gates  
**Target Platform**: Railway-hosted Linux API/PostgreSQL and modern browsers served by Next.js; responsive contributor and client web UI  
**Project Type**: pnpm/Turborepo monorepo web application with a Next.js frontend, NestJS API, and shared Zod schema package  
**Performance Goals**: acknowledge a stored document without waiting for AI; worker and active UI polling at 5-second cadence; visible background changes within 15 seconds of application state change; pure workspace transformation over a 100-document fixture stays below 100 ms p95 with fake adapters/Prisma mocks; local-Docker PostgreSQL workspace and paginated-source reads stay below 750 ms p95 over 30 measured requests after 5 warm-ups; prompts scale with touched observations/categories rather than the complete corpus; atomic release pointer swaps occur in one database transaction  
**Constraints**: fixed four-category taxonomy under documentation-domain names (legacy `Resource*` names are transitional only and must be removed at cleanup); existing 25 MB PDF/DOCX/PNG/JPEG limit plus one-time Notion snapshots; no free-form source editing; every current item has supporting provenance; old validated content survives every pending/failed operation; no cross-provider send when current operator policy forbids it; client endpoints expose only the published release  
**Scale/Scope**: early learning phase, tens of active projects and up to hundreds of observations per project; long inputs/corpora must be chunked and processed by impacted category rather than assumed to fit one context window; six generation stages, two initial provider adapters, one contributor workspace, one settings screen, and the existing client surface

## Constitution Check

*GATE: evaluated before Phase 0 research and re-evaluated after Phase 1 design.*

| Principle | Pre-design gate | Post-design evidence |
|---|---|---|
| I. Test-First Coverage Discipline | PASS — every API/UI slice will be paired with tests and the 80% gate is unchanged. | PASS — [quickstart.md](./quickstart.md) defines mocked unit/contract/UI suites plus separate manual migration, concurrency, reset, fallback, and end-to-end checks; no automated test requires PostgreSQL/`DATABASE_URL`, and no framework wiring is added to coverage targets merely to inflate coverage. |
| II. Type Safety, No Escape Hatches | PASS — provider payloads are untrusted boundaries, not reasons to weaken strict TypeScript. | PASS — canonical contracts live in `packages/schemas`; adapters return `unknown` only at their boundary and Zod-narrow before domain application. JSONB fields have versioned schemas. |
| III. Feature Isolation | PASS — design uses a documentation domain module plus a separate provider-neutral generation module; web moves the complete workflow into one feature. | PASS — `features/documentation` imports only shared code; routes compose features. API documentation services use public `ProjectsService`, `NotionConnectionService`, and `GenerationService` APIs rather than querying other modules’ tables. |
| IV. Never Resolve Open Product Decisions Unilaterally | PASS — the relevant behavior was clarified with the user; current PRODUCT open decisions concern role/handoff, not this workflow. | PASS — ownership transfer behavior, custom taxonomy, pricing, and continuous Notion sync remain untouched/out of scope. Exact model IDs are operator configuration, not a product decision. |
| V. Security and Privacy by Default | PASS — source/provenance/originals are contributor-only and client reads are release-scoped. | PASS — contributor checks collapse missing/unauthorized to the same 404 shape; provider secrets never persist in policy snapshots; presigned URLs remain short-lived; client services do not join internal documentary tables. |
| VI. Spec Before Multi-Screen or Multi-Endpoint Features | PASS — approved `spec.md` exists and this command is the required plan phase. | PASS — Phase 0/1 artifacts are complete; implementation must proceed through `/speckit-tasks` and `/speckit-implement`. |

No constitutional violation requires a complexity exception.

## Architectural Approach

### 1. Transition safely before retiring legacy tables

Deliver the reset as a narrow preparatory release, then keep every intermediate code slice compilable until the final guarded retirement:

1. add durable `DocumentaryTransitionState`, `DocumentaryResetRun`, and `DocumentaryResetItem` records plus a dry-run-first CLI; seed exactly one fixed `documentary-transition` row in `legacy` mode and fail closed if it is ever absent;
2. deploy guards on every legacy mutation and scheduled sweep before any reset, so `resetting|canonical` rejects uploads, Notion additions, deletion/review mutations, and legacy background advancement;
3. let dry-run remain read-only; after explicit approval, atomically acquire the reset/mutation lock, verify the approved inventory digest has not drifted, switch `legacy → resetting`, wait for guarded in-flight mutations to finish, and abort for a new dry-run if the inventory changed;
4. delete R2 originals idempotently, persist/report every outcome, transactionally purge legacy documentary rows in dependency order, and refuse to mark the run clean while an item failed or any legacy row remains;
5. switch `resetting → canonical` only after storage and database invariants pass, then add the replacement documentary domain while retaining empty legacy Prisma models/tables solely as a temporary compile-compatible shell;
6. migrate every route and frontend consumer, remove the legacy runtime/code in one release while leaving the empty tables/models, drain all older Railway instances, and only in a later separately approved production release apply the final guarded migration that drops them;
7. keep projects, accounts, memberships, invitations, board/Notion connections, and task vulgarization untouched throughout.

The reset is never placed in the normal application start command. Development and deployment instructions must state the guard release → approved reset → additive replacement → route cutover → legacy-runtime removal → instance drain → final legacy drop ordering explicitly. Retaining empty legacy tables temporarily is not data conversion or dual-write: it exists only so each reviewable delivery slice typechecks and builds. The final migration rechecks `canonical`, a clean reset, zero pending/failed manifest items, and zero legacy rows; the cleanup gate forbids completing the feature with the compatibility shell.

### 2. Commit canonical source revisions, not generated prose blobs

The source pipeline stores the original first and creates `SourceDocument` plus `GenerationOperation` in one database transaction. Extraction produces immutable, located observations. Consolidation compares only touched categories with the current source snapshot, returns a complete disposition for every input observation, and creates a full immutable next snapshot.

The source commit locks the `ProjectSource` aggregate and verifies the operation’s base revision. A stale output is never applied; it is superseded and re-enqueued from the current head. The same transaction records revision changes/impacts, items, provenance, clarifications, document state, and category target revisions. This is at-least-once processing with idempotent application, not an impossible exactly-once promise across PostgreSQL and remote APIs.

### 3. Keep human review independent while guaranteeing catch-up

Each fixed category has a mutable `CategoryProjectionState` that points to its validated reference, active draft, and newest target source revision. A pending draft is preserved until accepted/discarded. Closing it immediately compares its pinned revision with the target and schedules the newest catch-up draft when necessary. Provider failures are typed workflow states and never inserted into accept-able content.

Factual correction stays pinned to the same source revision and cannot remove supported facts. If the contributor is actually asking for shorter, more pedagogical, less technical, or differently toned client prose, the API returns a localized `EDITORIAL_INSTRUCTION_REQUIRED` code and the UI sends them to the profile workflow.

### 4. Publish through immutable release manifests

An accepted factual draft creates an immutable accepted reference and queues a client derivation. When validated, a new client release reuses unchanged category content from the current release and swaps the project publication pointer atomically. A confirmed editorial proposal freezes a new profile revision, queues all currently published categories, and cannot swap until the complete set has passed common validation. Release sequencing rebases later category updates so concurrent preparation never loses a publication.

The client endpoint resolves only `currentClientReleaseId`. Contributor preview endpoints may expose current and pending releases but strip generation diagnostics and clearly label pending output as not client-visible.

### 5. Orchestrate generation independently of provider SDKs

`GenerationOperation` is the durable business intention; `GenerationAttempt` is one real provider/model call. A five-second worker lease prevents duplicate execution across API instances. It uses a creation-time policy snapshot for reproducibility and current policy as a deny gate before sending new data. Provider jobs already accepted remain in polling with backoff until terminal/expired; fallback does not immediately duplicate an unknown in-flight job.

Thin Anthropic/OpenAI adapters build provider-native PDF/image/text and structured-output requests, but both return the same untrusted result contracts. SDK retries are disabled so every retry is explicit and audited. Zod plus deterministic provenance/coverage/open-point/length checks run before an optional semantic evaluator. A technically successful but invalid output is a failed attempt and cannot become draft content.

The policy schema owns an independently configurable route list for all six operation types: document extraction, source consolidation, factual drafting, editorial preview, client derivation, and output validation. Tests must prove that changing one stage does not silently alter another. Cancellation is a durable terminal transition: queued work is never submitted, submitted remote work remains auditable/pollable where it cannot be unsent, and no late result from a cancelled or superseded attempt may mutate domain pointers.

### 6. Make the workflow observable without a realtime transport

For contributors, `/projects/[id]` becomes `DocumentationWorkspace`; the client keeps the existing read-only route behavior. Contributor navigation separates Documentation, Team, and Settings. Settings receives working-language and editorial-profile controls alongside the current low-frequency configuration.

One compact workspace endpoint drives the overview and adaptive TanStack Query polling. Poll every five seconds while active work exists, invalidate details when revision/release tokens change, slow/stop when stable or hidden, and refetch on focus. Detailed source, provenance, clarification, draft, and client-preview endpoints remain paginated/specific. During transient refresh errors, retain the last state and announce delayed updating rather than showing empty content.

## Project Structure

### Documentation (this feature)

```text
specs/016-canonical-document-workflow/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── workspace-state.md
└── tasks.md                 # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── src/
    ├── documentation/
    │   ├── controllers/
    │   ├── dto/
    │   ├── source/
    │   ├── review/
    │   ├── editorial/
    │   ├── publication/
    │   ├── reset/
    │   └── documentation.module.ts
    ├── generation/
    │   ├── adapters/
    │   ├── policy/
    │   ├── schemas/
    │   ├── generation-worker.service.ts
    │   └── generation.module.ts
    ├── projects/             # expose membership/access through public service API
    ├── notion-connection/    # existing public page-fetch/credential API
    └── resources/            # empty-domain compatibility only; removed at final guarded cleanup

apps/web/
├── app/[locale]/(protected)/projects/[id]/
│   ├── page.tsx
│   ├── settings/page.tsx
│   └── documents/[documentId]/page.tsx
├── features/
│   ├── documentation/
│   │   ├── api.ts
│   │   ├── hooks.ts
│   │   └── components/
│   ├── projects/
│   └── resources/            # retired after route/component replacement
└── shared/components/
    └── client-category-view.tsx

packages/schemas/src/
├── documentation-category.ts
├── documentation-common.ts
├── documentation-source.ts
├── documentation-review.ts
├── documentation-workspace.ts
├── generation.ts
├── editorial-profile.ts
├── client-release.ts
└── index.ts
```

**Structure Decision**: Keep the existing monorepo and thin App Router pages. The API treats documentation as one domain concern with internal source/review/editorial/publication services and imports the separate cross-domain generation service. The frontend replaces `features/resources` with one `features/documentation` owner so no documentation component needs to import another feature. A pure shared client-category renderer is reused by client and contributor preview routes without sharing role-specific hooks.

## Delivery Boundaries

Because the constitution requires one reviewable concern per branch/PR, the task list is delivered through the following PR boundaries. Several PRs may form one product release, but substantial API, UI, and end-to-end convergence work use distinct boundaries:

1. reset state/write guards/manifest/CLI (`T003–T006`);
2. additive schema, shared contracts, and access foundation (`T007–T015`);
3. durable generation core and fake adapter (`T016–T020`);
4. canonical source backend and Anthropic adapter (`T021–T036`);
5. canonical source frontend (`T037–T040`);
6. canonical source integration/convergence (`T041`), after backend and frontend regardless of its numeric adjacency;
7. clarification/review/publication backend and client-route cutover (`T042–T062`);
8. factual-review/client-preview frontend (`T063–T064`);
9. factual publication integration/convergence (`T065`), after both preceding PRs;
10. editorial backend (`T066–T073`);
11. editorial frontend (`T074–T075`);
12. editorial integration/convergence (`T076`), after both preceding PRs;
13. OpenAI/resilience/policy hardening (`T077–T090`);
14. workspace aggregate API (`T091–T096`);
15. workspace frontend (`T097–T105`);
16. document-removal backend (`T106–T113`);
17. document-removal frontend (`T114–T115`);
18. document-removal integration/convergence (`T116`), after both preceding PRs;
19. legacy runtime/code removal with empty tables retained (`T117`);
20. post-drain guarded legacy-table drop (`T118`);
21. documentation, audits, evaluations, and final residue gate (`T119–T127`).

Each slice must run the full relevant typecheck, lint, coverage, and build gates; keep the monorepo green; and preserve the old published client content until the client-release read path is ready. Feature flags or release ordering may be used for incomplete intermediate slices; no intermediate route may expose source data to clients.

The client content route changes owner atomically: the new documentation controller registers `/projects/:projectId/categories/content` in the same change that unregisters the legacy `CategoriesController`. A later runtime-removal release deletes the entire legacy resources module, frontend feature, compatibility category exports, and obsolete route/service tests while retaining empty legacy Prisma models/tables. Only after Railway confirms every older instance is drained may the next release drop those models/tables. The cleanup gate uses repository-wide searches plus typecheck/build to prove that no documentary `Resource*` import, duplicate route, orphan module registration, compatibility shim, or dead generated-content service remains.

The transition also establishes a deployment compatibility floor. Before any reset, the guard release must be healthy everywhere. Once the state enters `resetting`, rollback to an earlier unguarded build is forbidden and recovery is roll-forward-only. After `canonical`, rollback is limited to builds that understand `DocumentaryTransitionState` and permanently reject legacy writes. After the final T118 schema drop, only builds with no legacy Prisma model, query, route, worker, or generated-client assumption are deployable. Production reset, drain, and destructive-drop commands are operator actions outside `speckit-implement` and require separate explicit approval against the runbook.
