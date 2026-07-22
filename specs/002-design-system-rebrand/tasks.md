---

description: "Task list for feature implementation"
---

# Tasks: Design System Rebrand

**Input**: Design documents from `/specs/002-design-system-rebrand/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included where there's real logic to test (constitution Principle I). Pure CSS token/color changes have no automated test surface in this codebase — `app/[locale]/layout.tsx` is already excluded from the coverage config for the same reason ("Pure Next.js wiring... no branching logic to test") — so those tasks are verified manually via quickstart.md instead.

**Organization**: Tasks are grouped by user story (spec.md), in priority order (P1 → P2).

**Implementation note (2026-07-22)**: Two adjustments made during `/speckit-implement`, beyond what's listed below:
1. T004's scope was revised before starting (confirmed with the user) — from "update `.landing` token values in place" to "delete `.landing` entirely, migrate its 8 components to the shared root tokens" (see research.md §2 decision log).
2. After T012 removed `app-sidebar.tsx`, its only remaining consumers — the shadcn `ui/sidebar.tsx` primitive and its `shared/hooks/use-mobile.ts` dependency — had zero other references anywhere in the app. Both were deleted rather than left as dead code (this reversed the plan.md Assumption that keeping the unused primitive was fine; deleting it turned out cleaner once `use-mobile.ts`'s coverage would otherwise have needed a special-case exclusion for orphaned code).

**Post-implementation design iteration (2026-07-22)**: After all tasks were marked complete and manually verified, the user requested several rounds of visual refinement based on seeing the real, running result — normal design feedback, not new functional requirements, so handled as direct edits rather than new tasks:
- The accent color went through honey → raspberry → a monochromatic lavender-only palette → finally dropping accent color entirely (near-black `--primary` for emphasis, lavender reserved for background/soft touches only) — see research.md §5.
- The flat gradient background was replaced with a fixed (viewport-pinned, non-scrolling), layered radial+linear "mesh" gradient after the flat version was found to visibly repeat/tile on tall pages and scroll with content.
- Form inputs (`shared/components/ui/input.tsx`) went from `bg-transparent` to `bg-card` — the transparent fill was nearly invisible against the new gradient background.
- `TopNav` lost its opaque white background so the gradient shows through behind it, per explicit feedback that it "shouldn't be white."
- Project cards (`features/projects/components/project-list.tsx`) were enriched with an icon, taller layout, and the project's creation date. A status badge and progress bar render conditionally if `Project.status`/`progressPercentage` are ever populated, but neither is populated by anything today — both fields are explicitly listed as undecided ("TBD") in `docs/PRODUCT.md`'s Open Decisions, so no specific status values or progress-computation logic were invented for this cosmetic pass (Constitution Principle IV).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps the task to a user story (US1–US3) for traceability

## Path Conventions

Frontend-only feature: all paths are under `apps/web/`. No `apps/api` or `packages/schemas` changes.

---

## Phase 1: Setup

- [X] T001 Confirm no new dependency is needed for Urbanist (research.md §1 — uses the existing `next/font/google` mechanism already loading Geist Sans/Mono)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Every user story depends on the new tokens and font being in place first.

- [X] T002 [P] Replace the `:root` palette tokens in `apps/web/app/globals.css` with the new light palette (background, card, popover, foreground, `primary` = a more saturated lavender for emphasis, secondary = pale lavender, muted, border, input, ring)
- [X] T003 [P] Delete the unused `.dark` class block in `apps/web/app/globals.css` (FR-002 — no dark theme exists)
- [X] T004 Delete the `.landing` token scope in `apps/web/app/globals.css` and update the landing page's `<main>` wrapper plus its 8 components (`hero.tsx`, `nav-bar.tsx`, `faq-section.tsx`, `benefit-card.tsx`, `ai-preview.tsx`, `features-section.tsx`, `closing-band.tsx`, `benefits-section.tsx`) to consume the shared root tokens directly (`bg-background`, `text-foreground`, `text-primary`, `bg-primary`, `border-border`, etc.) instead of `landing-*` classes — revised scope, see research.md §2 decision log
- [X] T005 Swap Geist Sans/Mono font loading for Urbanist in `apps/web/app/[locale]/layout.tsx`, updating the `--font-sans` mapping under `@theme inline` in `globals.css` accordingly

**Checkpoint**: New palette and typeface are live everywhere via shared tokens — user story phases can begin.

---

## Phase 3: User Story 1 - Consistent new visual identity everywhere (Priority: P1) 🎯 MVP

**Goal**: Every page — landing, every signed-in page, every auth page — shows the new palette and typeface, with zero dark-theme remnants and no way to switch to a dark mode.

**Independent Test**: Visit the landing page logged out, then log in and browse the home page, a project, and the profile page. All show the new palette/typeface; none show the old dark ink/rust theme.

- [X] T006 [US1] Manually verify `quickstart.md` § US1 across the landing page, every signed-in page, and the auth pages — new palette/typeface present everywhere, no dark-theme styling reachable anywhere (visual check; see Tests note above for why this isn't an automated task)

**Checkpoint**: User Story 1 fully satisfied — the whole app has one consistent, light visual identity.

---

## Phase 4: User Story 2 - Horizontal navigation app-wide, dashboard-style home (Priority: P1)

**Goal**: The sidebar disappears from every signed-in page, replaced everywhere by a horizontal top navigation bar carrying the same actions (profile, logout) it carries today; the home page additionally gets a welcome heading above the existing project list.

**Independent Test**: Log in and visit the home page, a project's detail page, the new-project page, and the profile page. None show a sidebar; all show the same horizontal navigation bar. The home page additionally shows a welcome heading above the project list. Profile and logout remain reachable from the new navigation on every one of those pages.

### Tests for User Story 2

- [X] T007 [P] [US2] Test that `TopNav` renders the brand mark and the user menu (profile link + logout action) in `apps/web/shared/components/top-nav.test.tsx`
- [X] T008 [US2] Update `apps/web/app/[locale]/(protected)/layout.test.tsx` to mock/assert `TopNav` instead of `AppSidebar`, keeping the existing authentication/redirect assertions unchanged
- [X] T009 [P] [US2] Extend `apps/web/app/[locale]/(protected)/home/page.test.tsx` to assert a welcome heading using the signed-in user's first name renders above the project list

### Implementation for User Story 2

- [X] T010 [US2] Create `apps/web/shared/components/top-nav.tsx` — brand mark + the same user dropdown menu (profile link, logout) the sidebar's footer carries today
- [X] T011 [US2] Update `apps/web/app/[locale]/(protected)/layout.tsx` to render `TopNav` in place of `SidebarProvider`/`AppSidebar`/`SidebarInset`
- [X] T012 [US2] Remove `apps/web/app/[locale]/(protected)/_components/app-sidebar.tsx` and `app-sidebar.test.tsx` (superseded by `top-nav.tsx`)
- [X] T013 [US2] Update `apps/web/app/[locale]/(protected)/home/page.tsx` to fetch the current user (`useCurrentUser`) and render a welcome heading above the existing `ProjectList` — no new stat/info cards (FR-006, research.md §4)
- [X] T014 [P] [US2] Update `apps/web/messages/en.json` / `fr.json`: add labels for `TopNav` and the home page's welcome heading; remove the now-unused `Sidebar` namespace keys once fully superseded

**Checkpoint**: User Stories 1–2 (both P1) fully functional — this is the full MVP slice.

---

## Phase 5: User Story 3 - Existing pages keep working, just restyled (Priority: P2)

**Goal**: A project's detail page and the auth pages (login, signup) show the new palette/typeface with zero functional change — every action, form, and piece of information stays exactly where and how it was.

**Independent Test**: Open a project's detail page and an auth page before and after the change. Every action and form field is present and behaves identically; only the colors and typeface differ.

**Note**: The auth pages (login/signup) live outside the protected layout and were never wrapped by the sidebar, so they only depend on Phase 2's tokens. The project detail page is wrapped by the layout changed in Phase 4 (US2), so verify it after US2 lands.

- [X] T015 [P] [US3] Manually verify `quickstart.md` § US3 — a project's detail page (invite, cancel, resend, members list/removal) and the login/signup forms behave identically to before, only restyled
- [X] T016 [US3] Run `pnpm --filter web test` and confirm zero regressions beyond the intentional test updates from Phase 4 (SC-005)

**Checkpoint**: All 3 user stories functional — the rebrand is complete with no functional regression.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T017 [P] Run `pnpm test:cov` — confirm the 80% gate holds on `apps/web`
- [X] T018 [P] Run `pnpm lint` and `pnpm build` on `apps/web`
- [X] T019 Run every scenario in `quickstart.md` manually against a real dev server, including the WCAG AA contrast spot-check (SC-004)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → no dependencies
- **Foundational (Phase 2)** → depends on Setup; BLOCKS every user story phase — the new tokens and font are the substance every story visually depends on
- **User Stories (Phases 3–5)** → all depend on Foundational; US1 and US2 are independent of each other; US3's project-detail-page check additionally depends on US2 (see note in Phase 5)
- **Polish (Phase 6)** → depends on all user stories in scope

### User Story Dependencies

- US1 (Phase 3): depends only on Foundational — a verification pass, no new code
- US2 (Phase 4): depends only on Foundational — the heaviest implementation phase (new component + layout rewiring)
- US3 (Phase 5): depends on Foundational for the auth-pages half of its check; depends on US2 for the project-detail-page half (same shared layout)

### Parallel Opportunities

- Foundational tasks T002/T003/T004 in parallel (different sections of the same file, but non-overlapping token blocks — coordinate if conflicts arise); T005 touches the same file's `@theme inline` block, do it after
- US2 test tasks T007/T009 in parallel; T008 touches a different file, also parallel-safe
- US2 implementation: T010 first (new component), then T011 (wires it in), then T012 (removes the old one) — sequential; T014 (i18n) can run in parallel with any of them
- US1 (T006) and the auth-pages half of US3 (part of T015) can run in parallel with all of US2, since neither touches the protected layout

---

## Implementation Strategy

### MVP First

Phases 1 → 2 → 3 → 4 (Setup, Foundational, US1, US2) deliver the complete
P1 slice: consistent new identity everywhere, sidebar gone app-wide, home
page dashboard shell. Stop and validate here before moving to the P2
regression-verification story (Phase 5).

### Incremental Delivery

Each phase after Foundational is an independently testable increment —
validate with `quickstart.md`'s matching section before moving to the next
phase.
