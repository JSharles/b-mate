# Implementation Plan: Design System Rebrand

**Branch**: `spec/design-system` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-design-system-rebrand/spec.md`

## Summary

Replace the app's current dark ink/rust visual identity with a single light
theme (light-gray background, white cards, near-black text, a lavender
accent (pale) and a more saturated lavender for emphasis) and the Urbanist typeface, applied
consistently across the marketing landing page and every signed-in/
authentication page — with no dark-theme variant. Remove the persistent
sidebar from the entire signed-in app shell in favor of a horizontal top
navigation bar, and give the signed-in home page a dashboard-style shell
(welcome heading above the existing project list). Everything else keeps
its exact current behavior — this is a token and layout-shell change, not a
functional one.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Next.js 16 App Router, React 19

**Primary Dependencies**: Tailwind v4 (CSS custom-property theme tokens, `@theme inline`), shadcn/ui primitives, `next/font/google` (font loading), next-intl (i18n)

**Storage**: N/A — purely visual/structural front-end change; no Prisma schema, no new API contracts

**Testing**: Vitest + React Testing Library (`apps/web` convention); 80% coverage gate enforced by `pnpm test:cov`

**Target Platform**: Web — Next.js app (`apps/web`) only; `apps/api` and `packages/schemas` are untouched by this feature

**Project Type**: Web application, frontend-only — no backend/frontend split needed since only `apps/web` changes

**Performance Goals**: None new — a font swap and CSS token change carry no performance requirement beyond today's baseline

**Constraints**: WCAG AA text contrast (4.5:1 normal text) under the new palette (SC-004); zero functional regression on any restyled page (FR-008, SC-005) — this is why every existing test suite must still pass unmodified in behavior, only in expected colors/markup where directly relevant

**Scale/Scope**: `apps/web/app/globals.css` (root tokens + removal of the unused `.dark` block + removal of the separate `.landing` token scope), root font loading in `apps/web/app/[locale]/layout.tsx`, the protected app shell (`(protected)/layout.tsx` + a new shared top-nav component replacing `_components/app-sidebar.tsx`), the signed-in home page shell (`(protected)/home/page.tsx`), and the 8 landing components + the landing page's `<main>` wrapper, migrated from `landing-*` classes to the shared root tokens (class rename only, no visual or structural change since both scopes converge on the same values)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-First Coverage Discipline | PASS | Existing test files for the protected layout, the sidebar (replaced), and the home page are updated alongside their implementation; the new shared top-nav component ships with its own test. |
| II. Type Safety, No Escape Hatches | PASS | No new `any`; component props stay strictly typed as today. |
| III. Feature Isolation | PASS | The new navigation component lives in `shared/components/` (not inside a feature) because it's used by the whole protected shell, not one feature — same placement logic already used for `use-current-user` etc. |
| IV. Never Resolve Open Product Decisions Unilaterally | PASS | The spec explicitly defers the exact top-nav items and dashboard card content (FR-006) — this plan does not invent them; the home page shell carries only the welcome heading and the already-existing project list, not new placeholder cards. |
| V. Security and Privacy by Default | PASS | No auth, session, or data-exposure surface is touched. |
| VI. Spec Before Multi-Screen/Multi-Endpoint Features | SATISFIED | This is that process, in progress. |

No violations. Complexity Tracking table intentionally left empty below.

**Post-Phase-1 re-check**: Confirmed after data-model.md and quickstart.md were
drafted. Since this feature introduces no data entities and no new API
surface, `contracts/` is intentionally omitted (see Project Structure below)
— nothing new is exposed for another system or a future spec to depend on,
so there's nothing to contract. No new violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-design-system-rebrand/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output — no new entities (documents why)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

No `contracts/` directory: this feature adds no new API endpoint and changes
no request/response shape — it is a front-end token and layout-shell change
only.

### Source Code (repository root)

```text
apps/web/app/globals.css                                        # existing — replace :root palette tokens, delete unused .dark block, delete the separate .landing token scope
apps/web/app/[locale]/layout.tsx                                 # existing — swap Geist Sans/Mono font loading for Urbanist
apps/web/app/[locale]/(protected)/layout.tsx                     # existing — replace SidebarProvider/AppSidebar/SidebarInset with the new shared TopNav
apps/web/app/[locale]/(protected)/layout.test.tsx                # existing — update for the new layout shell
apps/web/app/[locale]/(protected)/_components/app-sidebar.tsx    # existing — removed (superseded by shared/components/top-nav.tsx)
apps/web/app/[locale]/(protected)/_components/app-sidebar.test.tsx # existing — removed alongside it
apps/web/app/[locale]/(protected)/home/page.tsx                  # existing — add a welcome heading above the existing ProjectList (dashboard shell; no new cards invented)
apps/web/app/[locale]/(protected)/home/page.test.tsx             # existing — extend for the welcome heading
apps/web/shared/components/top-nav.tsx                           # new — brand mark + user menu (profile/logout), replaces the sidebar's role app-wide
apps/web/shared/components/top-nav.test.tsx                      # new
apps/web/features/landing/components/hero.tsx                    # existing — replace landing-* classes with shared root tokens
apps/web/features/landing/components/nav-bar.tsx                 # existing — same (class rename)
apps/web/features/landing/components/faq-section.tsx              # existing — same (class rename)
apps/web/features/landing/components/benefit-card.tsx             # existing — same (class rename)
apps/web/features/landing/components/ai-preview.tsx               # existing — same (class rename)
apps/web/features/landing/components/features-section.tsx         # existing — same (class rename)
apps/web/features/landing/components/closing-band.tsx             # existing — same (class rename)
apps/web/features/landing/components/benefits-section.tsx         # existing — same (class rename)
apps/web/app/[locale]/(public)/page.tsx                          # existing — landing page's <main> wrapper, replace landing-* classes with shared root tokens
apps/web/messages/en.json                                        # existing — extend: top-nav labels; remove now-unused Sidebar-only keys if fully superseded
apps/web/messages/fr.json                                        # existing — same
```

Every other signed-in/public page (project detail, project creation, login,
signup, profile) needs **no file changes of its own** — they inherit the new
palette and font automatically through the shared CSS tokens and root font,
per FR-008. They're covered by the Independent Test in spec.md User Story 3
(manual/visual regression check), not by dedicated new tasks.

**Structure Decision**: Single web application structure (existing
`apps/web/`) — no backend/frontend split is relevant since `apps/api` and
`packages/schemas` are untouched. The new top-nav component goes in
`shared/components/` rather than inside any single feature, since it's
consumed by the entire protected app shell, matching this repo's existing
rule that cross-feature code belongs in `shared/`.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
