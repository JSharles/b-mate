# Implementation Plan: Author-Defined Client Sections

**Branch**: `017-documentation-review-journey` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-documentation-review-journey/spec.md`

## Summary

Remove the fixed list of four documentation categories and replace it with sections a
contributor creates: a name, a tone, and instructions describing what the system should
look for in the project's canonical source. Ingestion stops classifying entirely —
processing a document records what it says and nothing about where it belongs.
Selection moves to composition, per section, driven by the section's own instructions
and by the exclusions the contributor has accumulated against it.

The approach separates the two jobs feature 016 tangled together. Accumulating truth
keeps its whole machinery unchanged: provenance, duplicate merging, contradiction
surfacing, attributable correction, atomic publication. Composing something to read
becomes an author-driven loop — describe, receive a proposal with its unresolved
questions, correct on facts or on relevance, approve, publish.

Two corrections exist because the contributor named two acts. A factual correction
revises the canonical source and reaches every section. A relevance correction binds
one statement to one section and is enforced by filtering the composition input, not
by asking the model to remember it — a direct application of what this codebase learned
on 2026-08-11/12, where every invariant delegated to a prompt was eventually broken.

## Technical Context

**Language/Version**: TypeScript 5, strict mode, Node 22

**Primary Dependencies**: NestJS 11 + Prisma 7 (`prisma-client-js`) on `apps/api`;
Next.js 16 App Router + Tailwind v4 + shadcn/ui + TanStack Query + next-intl on
`apps/web`; Zod in `packages/schemas`

**Storage**: PostgreSQL. Original documents in R2; everything else in Postgres

**Testing**: Jest on `apps/api`, Vitest + React Testing Library on `apps/web`, Vitest
on `packages/schemas`. 80% coverage gate on both apps

**Target Platform**: Web, deployed to Railway

**Project Type**: pnpm + Turborepo monorepo, two apps and one shared package

**Performance Goals**: Composition is asynchronous and contributor-triggered; no
latency budget beyond "a contributor should not wonder whether it is running". The
generation policy runs the document stages synchronously today, with a one-hour remote
deadline and remote cancellation on abandonment

**Constraints**: Composition input is the whole canonical source minus the section's
exclusions — measured at ~2 000 tokens for 59 statements, comfortable to roughly 5 000
statements before it stops being trivial (research Decision 3)

**Scale/Scope**: Roughly 12 Prisma models touched, 4 removed outright as pre-existing
dead weight, one generation stage retired and one reshaped, ~49 source files that
currently know a category key

## Constitution Check

*GATE: passed before Phase 0. Re-checked after Phase 1 design — still passing.*

| Principle | Assessment |
|---|---|
| **I. Test-first coverage** | No exemption sought. The removals are as testable as the additions: an excluded statement must be absent from composition input, a factual correction must reach a second section, a published set must never be partial. |
| **II. Type safety** | The category enum becomes a foreign key, which is the direction that *gains* safety at the database level and loses it in TypeScript — an enum member is checked, a section id is a string. Contracts in `packages/schemas` must carry the section shape so both apps agree; no `any` at the boundary. |
| **III. Feature isolation** | Web work stays in `features/documentation`; anything the client's project page also needs (section rendering) goes to `shared/`, as `ClientCategoryView` already does. API work stays in the `documentation` module. |
| **IV. Never resolve open product decisions** | Three questions were raised and answered by the contributor before this plan (spec, Clarifications). Two consequential assumptions — tone moving onto the section, and existing projects migrating to four ordinary sections — are recorded in the spec and flagged in the checklist for confirmation before implementation begins. |
| **V. Security and privacy** | Section names and instructions are contributor-authored text later rendered to a client. Two obligations: they must never cross a project boundary, and a client must not be able to read a section that is archived or unpublished. Access checks follow the existing contributor/client split; responses stay indistinguishable between "not found" and "not authorised". |
| **VI. Spec before multi-screen** | Being followed. This is the plan phase of that workflow. |

No violations. Complexity Tracking is therefore omitted.

## Project Structure

### Documentation (this feature)

```text
specs/017-documentation-review-journey/
├── plan.md              # This file
├── spec.md              # Approved feature specification
├── research.md          # Phase 0 — ten decisions, each measured against the running system
├── data-model.md        # Phase 1 — what is new, changed, removed
├── contracts/
│   └── sections-api.md  # Phase 1 — the contributor and client surface
├── quickstart.md        # Phase 1 — how to prove it works
├── checklists/
│   └── requirements.md  # Specification quality gate
└── tasks.md             # Phase 2 — created by /speckit-tasks, not by this command
```

### Source code

```text
apps/api/src/documentation/
├── sections/                    # NEW — the section, its exclusions, its lifecycle
│   ├── client-section.service.ts
│   ├── section-exclusion.service.ts
│   └── prompts/composition.prompt.ts
├── composition/                 # RESHAPED from review/ — proposal generation and approval
│   ├── section-composition.handler.ts
│   ├── composition-output.schema.ts
│   └── section-proposal.service.ts
├── source/                      # UNCHANGED in substance; loses category assignment
│   ├── document-extraction.handler.ts
│   ├── source-consolidation.handler.ts
│   └── source-revision.service.ts
├── publication/                 # UNCHANGED; keyed by section instead of category
├── editorial/                   # REMOVED — tone moves onto the section
├── review/                      # REMOVED — replaced by composition/
└── controllers/

apps/web/features/documentation/
├── components/
│   ├── section-list.tsx             # NEW — the contributor's sections and their state
│   ├── section-editor-dialog.tsx    # NEW — name, tone, instructions; suggestions prefill it
│   ├── section-suggestions.ts       # NEW — the starting points, as translated copy only
│   ├── section-proposal-review.tsx  # NEW — proposal, questions, both corrections
│   ├── client-preview-tabs.tsx      # RESHAPED — the client's own tabs
│   ├── canonical-source-view.tsx    # KEPT — now a consultable history, not a step
│   ├── category-review-list.tsx     # REMOVED
│   └── editorial-profile-settings.tsx  # REMOVED
└── hooks.ts

apps/web/shared/components/
└── client-section-view.tsx      # RESHAPED from client-category-view.tsx

packages/schemas/src/
└── documentation-sections.ts    # NEW — section, proposal, exclusion contracts
```

**Structure Decision**: The monorepo's existing shape is kept. Inside the API's
`documentation` module the change is a rename of concerns rather than a new
architecture: `review/` becomes `composition/`, a `sections/` concern appears,
`editorial/` disappears. On the web side the documentation feature keeps its
boundary; only the client-facing section renderer lives in `shared/`, because the
client's project page needs it too — the same reason `client-category-view.tsx` is
already there.

## Implementation Sequence

**Revised 2026-08-13.** The original sequence added sections beside the four
categories and removed nothing until a final migration slice, so that no client would
lose what they could read. The product has never been deployed and has no clients, so
that ordering protected nobody while obliging every layer in between to work two ways
at once. The removal moves into the change that replaces what it removes.

**Slice 1 — the section exists and composes (US1).** `ClientSection` and
`SectionProposal`, and the composition stage reading the whole canonical source.
*Shipped.*

**Slice 2 — the replacement completes (US1, US4, FR-024).** Publication is re-keyed on
sections, and everything the four categories existed to serve is deleted in the same
change: the enum, the classification tables, the per-category projection and draft
models, the editorial profile machinery, their routes, their screens, their translated
strings, their tests — and the four models from features 013 and 014 that already had
no reader. Verified by `pnpm knip`, `pnpm i18n:orphans`, and a schema pass for models
with no reader in `apps/api/src`.

**Slice 3 — corrections (US2).** `SectionExclusion`, and the factual correction path
wired through from the proposal review. Both corrections available where the
contributor reads.

**Slice 4 — refresh (US3).** Mark sections when the canonical head moves; let the
contributor trigger. Retire `SourceRevisionImpact`.

The risk that concentrated in the old Slice 4 is gone with the migration. What remains
is ordinary: a schema change in a database whose contents nobody depends on.

## Risks

**Composition quality is unproven at this shape.** Feature 016 drafted against four
headings baked into the prompt. Composition now works against instructions a
contributor writes freely, whose quality the system cannot control. Partly mitigated by
the suggested starting points (research Decision 10), whose worked descriptions are the
only place the product gets to show what a usable instruction looks like — and otherwise
by shipping Slice 1 early and learning from real sections rather than designing further
in advance.

~~**The migration touches published client content.**~~ **Retired 2026-08-13**: there
is no published client content and no migration. See research Decision 9.

**Removing the editorial profile removes a built feature.** Four models, one generation
stage, one screen. It is the right call — a project-wide register stops meaning
anything once each section chooses its own — but it is a deletion of working code, and
it should be a deliberate, reviewed step rather than a side effect of the migration.
