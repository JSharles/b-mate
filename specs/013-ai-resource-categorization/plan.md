# Implementation Plan: AI Resource Categorization

**Branch**: `013-ai-resource-categorization` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-ai-resource-categorization/spec.md`

## Summary

Extend the existing resources pipeline (specs/011-project-resources) so that, in the same AI processing pass that already produces a resource's vulgarized content, the system also proposes one or more **categories** — labels describing the *type of information* the resource contains (e.g. "Architecture," "Audit findings"), not its technical subject. A resource can carry several categories at once; each is approved or rejected individually by a contributor, independent of the resource's own `publish()` action. The AI is shown a project's existing approved categories so it reuses them instead of minting near-duplicates. On the client-facing view, published resources are grouped into tabs by their approved categories (a resource with multiple approved categories appears under each of its tabs); a single approved category already switches the layout from a flat list to tabs.

## Technical Context

**Language/Version**: TypeScript (monorepo-wide) — NestJS 11 (`apps/api`), Next.js 16 App Router (`apps/web`)

**Primary Dependencies**: `@anthropic-ai/sdk` (existing — extends `DocumentVulgarizationClient`'s Claude Batch usage), Prisma 7 (`@prisma/adapter-pg`), Zod (`packages/schemas` + an internal output schema, mirroring `DocumentVulgarizationOutputSchema`), Radix UI primitives via the `radix-ui` package (existing pattern for shadcn-style components — `Tabs` has no local wrapper yet and needs one, matching `alert-dialog.tsx`/`avatar.tsx`'s hand-built style)

**Storage**: PostgreSQL via Prisma — two new tables (`resource_categories`, `resource_category_assignments`); no change to existing `resources`/`resource_vulgarizations` tables

**Testing**: Jest (`apps/api`), Vitest + React Testing Library (`apps/web`), 80% coverage gate on both (`pnpm test:cov`) — existing convention, no change

**Target Platform**: Web (existing — no new platform)

**Project Type**: Web application (existing monorepo structure: `apps/web` + `apps/api` + `packages/schemas`) — this feature adds no new top-level app or package

**Performance Goals**: No new latency requirement beyond today's — category detection stays inside the existing async, sweep-based pipeline (`ResourceBatchSweepService`, 5-minute cadence); no synchronous user-facing wait introduced

**Constraints**: Must not modify the existing vulgarization prompts or output already in production (spec.md FR-010); category detection must be part of the *same* Claude Batch submission already made for vulgarization, not a second independent LLM call per resource (decision already made with the user, spec.md Assumptions)

**Scale/Scope**: 2 new Prisma models, ~4 new/changed API endpoints on the existing `resources` module, one new shared UI primitive (`Tabs`), and additions to the existing `features/resources` web feature (no new top-level feature folder — Constitution III)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage Discipline**: New Prisma models, service methods, controller endpoints, and web components all ship with tests in the same change; 80% gate applies as usual. No exemption needed.
- **II. Type Safety, No Escape Hatches**: The category-detection LLM output is a third-party boundary — narrowed explicitly via a new Zod schema (mirroring `DocumentVulgarizationOutputSchema`), not trusted as `any`. Category key/label types flow through `packages/schemas` for the API↔web boundary.
- **III. Feature Isolation**: All new backend code lives inside the existing `apps/api/src/resources/` module (extends `ResourcesService`/`ResourcesController`, no new module) — `ResourceBatchSweepService` already owns polling Claude, extended in place. Web-side, all new components live inside the existing `features/resources/` feature folder; the new shared `Tabs` primitive goes in `shared/components/ui/` (cross-feature by definition, matches where `alert-dialog.tsx`/`avatar.tsx` already live). No feature reaches into another feature.
- **IV. Never Resolve Open Product Decisions Unilaterally**: The three open decisions this feature raised (category reuse/lifecycle, per-category approval granularity, client tab threshold) were already surfaced to and resolved by the user during `/speckit-specify` — none remain open. `docs/PRODUCT.md` was updated first, before this spec was written.
- **V. Security and Privacy by Default**: No new tokens/secrets. Category visibility follows the exact same role/publish-status gating already enforced for resource content (`ResourcesService.findAllForProject` already filters to `status: 'published'` for clients) — category assignments are additive metadata on that same, already-guarded query path, not a new access surface.
- **VI. Spec Before Multi-Screen or Multi-Endpoint Features**: This feature spans multiple endpoints and screens (developer review UI + client tabbed view) — already routed through the full `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement` workflow per this constitution clause; spec was reviewed and clarified with the user before this plan was written.

No violations. Complexity Tracking is not needed.

### Post-Design Re-check (after Phase 0/1)

Confirmed against the concrete design in `research.md`/`data-model.md`/`contracts/`: both new models (`ResourceCategory`, `ResourceCategoryAssignment`) and all new endpoints stay inside the existing `resources` module and its existing `SessionGuard`/membership/role checks — no new module, no new auth surface, no new cross-feature import introduced. Client-facing category visibility is filtered through the same `findAllForProject`/`findOne` code path already gating `resource.status`, not a separate access-control mechanism. No violations surfaced by the design phase; gate still passes.

## Project Structure

### Documentation (this feature)

```text
specs/013-ai-resource-categorization/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── resource-categories.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   └── schema.prisma                              # + ResourceCategory, ResourceCategoryAssignment models
├── src/resources/                                  # existing module, extended in place
│   ├── document-vulgarization-output.schema.ts     # + category sub-schema (key, labelEn, labelFr)
│   ├── document-vulgarization.client.ts            # + 3rd batch request: category detection (locale-agnostic)
│   ├── resource-batch-sweep.service.ts             # + persists proposed categories on batch success
│   ├── resources.service.ts                        # + approveCategory/rejectCategory, existing-categories lookup for reuse prompt, findAllForProject/findOne return category assignments
│   ├── resources.controller.ts                     # + POST :resourceId/categories/:categoryId/approve|reject
│   └── resources.service.spec.ts / resources.controller.spec.ts / document-vulgarization.client.spec.ts / resource-batch-sweep.service.spec.ts   # extended, not replaced

packages/schemas/
└── src/resource.ts (or resource-category.ts)       # + ResourceCategorySchema, category assignment shape on the existing Resource response type

apps/web/
├── shared/components/ui/
│   └── tabs.tsx                                     # new — hand-built shadcn-style Radix Tabs wrapper (no existing local component)
└── features/resources/                              # existing feature, extended in place
    ├── components/
    │   ├── resource-tile.tsx                         # + category chips with approve/reject controls (developer view)
    │   └── resources-list.tsx                        # client branch: groups published resources into category tabs instead of a flat list; developer branch unchanged (flat, per spec.md FR-006)
    └── hooks.ts / api.ts                              # + category approve/reject mutations
```

**Structure Decision**: Existing monorepo web-application layout (`apps/web` + `apps/api` + `packages/schemas`) is reused as-is. This feature extends the existing `resources` module/feature on both sides rather than introducing a new module, package, or top-level feature folder — consistent with Constitution III and with how specs/011 and specs/012 both extended existing structure rather than branching out.
