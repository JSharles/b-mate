# Implementation Plan: Project Resources

**Branch**: `feat/project-resources` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-project-resources/spec.md`

## Summary

Developers add resources to a project — an uploaded document (PDF/Word/image) or a connected Notion page — which Claude vulgarizes into a plain-language rewrite that preserves important information and describes any diagrams/schemas. Processing runs asynchronously (Anthropic Batch API, polled by a periodic sweep); the developer reviews the result and explicitly publishes it before a client can see it. Replaces the "Documentation" placeholder tile on both the developer and client project views.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js — matches the rest of the monorepo.

**Primary Dependencies**: NestJS 11 (`apps/api`, `@nestjs/platform-express`'s `FileInterceptor`/multer for upload handling — already a dependency, no new package), Next.js 16 App Router (`apps/web`), Prisma 7 (new `Resource`/`NotionConnection` models + migration). New dependencies: `@aws-sdk/client-s3` (R2 access) and `@aws-sdk/s3-request-presigner` (presigned URLs) for `apps/api`; `mammoth` (`.docx` text/image extraction, research.md Decision 2). `@anthropic-ai/sdk` already present, reused for the new `DocumentVulgarizationClient` (research.md Decision 3).

**Storage**: PostgreSQL via Prisma for resource metadata/state and the encrypted Notion token; Cloudflare R2 (S3-compatible object storage) for original uploaded files (research.md Decision 6) — **requires the user to manually provision an R2 account/bucket/credentials before storage-dependent tasks can be implemented** (spec.md Assumptions), same category of manual step as registering the GitHub OAuth App for specs/009.

**Testing**: Jest (`apps/api`), Vitest + RTL (`apps/web`), 80% coverage gate (Constitution I). External calls (Anthropic Batch API, Notion API, R2/S3) are mocked in tests, consistent with how `GithubProjectsClient`/`AnthropicVulgarizationClient` are already tested.

**Target Platform**: Web (existing Diaphane app), Railway-hosted API.

**Project Type**: Web application (existing `apps/web` + `apps/api` split).

**Performance Goals**: N/A beyond existing patterns — this feature is inherently asynchronous (FR-015), so there's no request-latency budget for the AI processing step itself.

**Constraints**: 25 MB max upload size, PDF/DOCX/PNG/JPEG only (FR-013). `.docx` diagram description is disclosed as weaker than PDF's (research.md Decision 2 — a known, accepted v1 asymmetry, not a bug to "fix" during implementation). Notion-sourced resources are text-only, no image/diagram description for v1 (research.md Decision 5).

**Scale/Scope**: New `apps/api/src/resources` module (mirroring `board-connections`' structure: controller, service, DTOs, a document-vulgarization client, a Notion client, an R2 storage client) plus a new periodic sweep service for batch-status polling. New `apps/web/features/resources` feature (list/tile view, add-resource dialog with upload-vs-Notion choice, detail/review page, publish/delete actions). Replaces the "Documentation" `ComingSoonCard` on both roles' views of `apps/web/app/[locale]/(protected)/projects/[id]/page.tsx`. New `packages/schemas/src/resource.ts` for the shared request/response Zod schemas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Coverage Discipline**: Applies — every new service/client/component ships with tests in the same change, keeping the 80% gate green. PASS (enforced during `/speckit-implement`).
- **II. Type Safety, No Escape Hatches**: The new unchecked boundaries (Anthropic Batch API responses, Notion API block responses, R2/S3 SDK responses, uploaded file MIME/size) are each narrowed at their own boundary — mirrors how `github-oauth.client.ts`/`github-projects.client.ts` already narrow their external responses. PASS.
- **III. Feature Isolation**: New `resources` module owns its own Prisma queries (contributor/client membership checks copied locally, per the established pattern in `board-connections.service.ts`/`current-task.service.ts`, not shared via cross-module Prisma access). Reuses `token-encryption.ts` (a stateless utility, not a Prisma reach-in — same reasoning already applied in specs/010) and `AuthModule`'s `SessionGuard`. PASS.
- **IV. Never Resolve Open Product Decisions Unilaterally**: Every genuinely open product decision (AI processing scope, Notion connection mechanism, section naming/replacement, original-document access, file formats/size limit, deletion, sync-vs-async, diagram/image handling, AI provider/model choice, LangChain/LangGraph) was raised to and resolved with the user across `/speckit-specify` and this planning conversation — nothing left to guess at. The one still-open external dependency (provisioning the actual Cloudflare R2 bucket/credentials) is flagged as a manual prerequisite, not something this plan attempts to provision automatically. PASS.
- **V. Security and Privacy by Default**: The Notion integration token is encrypted at rest (FR-012) using the already-audited encryption utility. Original files are served via short-lived presigned URLs, never a public bucket. Publishing gate (FR-010/FR-016) is enforced server-side (a client-role request for an unpublished resource gets the same "not found" response as a nonexistent one, matching this project's existing not-found/not-authorized convention) — never just hidden client-side. PASS.
- **VI. Spec Before Multi-Screen or Multi-Endpoint Features**: This feature spans multiple screens (Resources list, add-resource dialog, detail/review page) and multiple endpoints — spec (`spec.md`, user-approved across two rounds of clarification) already exists; this plan is the required next step before `/speckit-tasks` → `/speckit-implement`. PASS.

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/011-project-resources/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/src/
├── resources/
│   ├── resources.controller.ts          # add/list/get/publish/delete resource endpoints
│   ├── resources.service.ts             # membership checks, state transitions, orchestrates storage+AI+Notion clients
│   ├── resources.module.ts
│   ├── dto/
│   │   ├── create-resource-upload.dto.ts
│   │   └── create-resource-notion.dto.ts
│   ├── document-vulgarization.client.ts # new — whole-document Claude Batch client (research.md Decisions 1, 3, 4)
│   ├── notion.client.ts                 # new — fetch + flatten a Notion page's blocks to text (research.md Decision 5)
│   ├── resource-storage.client.ts       # new — R2 upload/presigned-URL client (research.md Decision 6)
│   ├── resource-batch-sweep.service.ts  # new — @Cron poller, mirrors task-vulgarization's sweep pattern
│   └── token-encryption usage           # reused from ../board-connections/token-encryption.ts (research.md Decision 7)
└── prisma/
    └── schema.prisma                    # extend: Resource, NotionConnection models + enums

apps/web/features/resources/
├── api.ts
├── hooks.ts
├── schemas.ts (or reuse packages/schemas types directly)
└── components/
    ├── resources-list.tsx        # tile grid, replaces ComingSoonCard(documentation)
    ├── add-resource-dialog.tsx   # upload vs. connect-Notion choice
    ├── resource-tile.tsx
    └── resource-detail-page-content.tsx  # vulgarized content + original preview/download + publish/delete (developer) or read-only (client)

apps/web/app/[locale]/(protected)/projects/[id]/
├── page.tsx                                    # extend: replace documentation/clientDocumentation ComingSoonCard with ResourcesList
└── resources/[resourceId]/page.tsx              # new — resource detail route

packages/schemas/src/resource.ts   # new — shared Zod schemas (create-upload/create-notion requests, Resource response shape)
```

**Structure Decision**: Follows the established feature-based layout exactly — a new `apps/api/src/resources` NestJS module (structured like `board-connections`) and a new `apps/web/features/resources` feature, rather than folding this into an existing module; the domain (resources, distinct from board connections or task vulgarization) and its own Prisma entities justify a dedicated module per Constitution III.

## Complexity Tracking

*No Constitution Check violations — table not needed.*
