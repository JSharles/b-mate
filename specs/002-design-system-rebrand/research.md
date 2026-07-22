# Phase 0 Research: Design System Rebrand

No items in Technical Context were marked `NEEDS CLARIFICATION` — the stack
and testing approach are already fixed by the existing codebase, and the
sidebar-removal scope was already resolved in spec.md's Clarifications
section. This document instead records the key implementation decisions
needed to turn the clarified spec into a concrete design.

## 1. Font loading (Urbanist)

**Decision**: Load Urbanist via `next/font/google`, the same mechanism
currently used for Geist Sans/Geist Mono in
`apps/web/app/[locale]/layout.tsx`, mapped to a single `--font-sans`
CSS variable consumed by `@theme inline` in `globals.css`.

**Rationale**: Zero new tooling or dependency; keeps fonts self-hosted
(Next.js bundles the font files at build time — no external font CDN
request at runtime), matching the spec's own Assumption. Geist Mono's
`--font-mono` mapping can stay as-is since no monospace-specific
requirement was raised — this feature is about the primary UI typeface.

**Alternatives considered**: A `<link>` tag to Google Fonts' CDN — rejected,
introduces an external network dependency and a cross-origin request the
app doesn't currently make anywhere, for no benefit over the built-in
Next.js mechanism already in place.

## 2. Palette token strategy (consolidate landing tokens into the shared root tokens)

**Decision**: Replace the color values inside the existing `:root` block in
`globals.css` with the new light palette (background, card, foreground,
primary/lavender, a new raspberry accent token, etc.), delete the entire `.dark`
class block (FR-002 — no dark theme), **and delete the separate `.landing`
token scope entirely**, updating the landing page's `<main>` and its 8
components to consume the shared root tokens directly (`bg-background`,
`text-foreground`, `text-primary`, `bg-primary`, `border-border`, etc.)
instead of `landing-*` classes.

**Rationale**: The `.landing` scope only ever existed because the landing
page and the app happened to share the same dark ink/paper/rust values by
coincidence, not by design (see the comment removed from `globals.css`).
Now that the two are being unified on purpose, keeping two token sets that
must be kept in sync forever is needless duplication — and worse, a
same-values-only swap would leave `--landing-ink` holding a *light* color and
`--landing-paper` holding a *dark* one, which is actively misleading to a
future reader. Consolidating onto one token set removes that trap and the
duplication, for a one-time, purely mechanical class-rename cost (revised
after implementation began — see the decision log below).

**Alternatives considered**: Keeping `.landing` as its own scope and only
updating its values in place — this was the original plan; rejected once
the actual `landing-*` usage was inspected during implementation and the
inverted-naming problem became concrete rather than theoretical.

**Decision log**: This revises the original Phase 0 research decision.
Confirmed with the user during `/speckit-implement` (2026-07-22) before
proceeding, since it expands the touched-file set from "1 CSS file" to
"1 CSS file + 8 component files" versus what plan.md originally scoped —
worth a check-in even though the visual outcome is identical either way.

## 3. Sidebar → horizontal top navigation

**Decision**: Introduce one new component, `shared/components/top-nav.tsx`,
carrying exactly what the current sidebar carries today — the brand mark
and the user menu (profile link + logout) — and render it from
`(protected)/layout.tsx` in place of `SidebarProvider`/`AppSidebar`/
`SidebarInset`. No new navigation links are added.

**Rationale**: Directly implements FR-005/FR-007 (sidebar removed
app-wide, every previously-reachable action stays reachable) without
inventing the navigation categories the spec explicitly defers (FR-006).
Placed in `shared/components/` rather than a feature directory because the
whole protected shell depends on it — same placement logic as
`shared/hooks/use-current-user`.

**Alternatives considered**: Re-skinning the existing shadcn `Sidebar`
primitive to render horizontally — rejected; that primitive's collapse/
trigger behavior is built around a vertical rail, and fighting that grain
for a top bar would produce more code than a small purpose-built
component. The underlying `shared/components/ui/sidebar.tsx` primitive is
left in place, unused, per spec.md's own Assumption that deleting it is an
implementation detail out of this feature's scope.

## 4. Home page dashboard shell

**Decision**: Add a welcome heading (e.g. addressing the signed-in user by
first name) directly above the existing `ProjectList` component on the home
page. No new stat/info cards are added.

**Rationale**: Satisfies FR-006's structural requirement (a dashboard-style
opener replacing the plain list-only page) while respecting the spec's
explicit deferral of exact card content — inventing placeholder cards now
would mean silently deciding something Constitution Principle IV requires
raising to the user first. The existing project list stands in as the
dashboard's one real content section for this iteration.

**Alternatives considered**: Building mock/placeholder stat cards (matching
the visual reference images from the design conversation) — rejected for
this feature; that's real product-content design work the user explicitly
asked to defer to a later step, not a rebrand detail.

## 5. Final accent palette (single-hue lavender, gradient background)

**Decision**: After implementation, the accent color went through two more
iterations — a honey/ochre tone (rejected as dull, inconsistent with the
rest of the palette's "clean" feel) and a raspberry/pink tone (rejected as
still not fitting once seen in context) — before landing on dropping the
second accent hue entirely. Final palette: lavender only, at two
saturations (`--secondary` pale, `--primary` a more saturated "emphasis"
tone `#6c5ce7`), plus neutral gray and near-black. The page background
became a `135deg` diagonal gradient (`--gradient-from` pale lavender to
`--gradient-to` light gray) applied via `background-image` on `body`, not
via the `--background` token itself — `--background` stays a flat neutral
fallback for any component that reads it as a solid color (e.g. `bg-background`
utility usages), while the gradient is layered on top at the page-canvas level.

**Rationale**: A single-hue palette (lavender + neutrals) reads as more
"clean and controlled" than a two-hue palette once an earthy or unrelated
second hue is introduced — matching the user's explicit feedback. Keeping
the gradient off the `--background` token (rather than trying to make a
CSS variable hold a gradient function) avoids breaking every other
component that expects `--background` to be a plain color for
`background-color`.

**Alternatives considered**: A second accent hue in the orange/pink family
(tangerine, coral, raspberry) — tried and rejected per user feedback each
time. Putting the gradient directly on `--background` — rejected, `<color>`
custom properties can't hold a `linear-gradient()` value for
`background-color` without silently breaking every other consumer of that
token.
