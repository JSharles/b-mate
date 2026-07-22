# Feature Specification: Design System Rebrand

**Feature Branch**: `spec/design-system`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Je veux refaire l'identité visuelle de toute l'app (produit + landing page), et retirer la sidebar de la home connectée.

Nouvelle identité visuelle : fond gris très clair, cartes blanches, texte quasi-noir (pas de noir pur), un accent froid lavande et un accent chaud miel/ocre, police Urbanist. On abandonne complètement le thème sombre actuel (ink/rust) — un seul thème, clair.

Sur la home connectée, la sidebar actuelle disparaît au profit d'une navigation horizontale en haut de page, dans un esprit dashboard (grand titre de bienvenue, cartes d'information) plutôt qu'une simple liste de projets. Les catégories de navigation et le contenu exact des cartes ne sont pas encore décidés à ce stade — seule la direction générale (nav horizontale + mise en page dashboard) est actée.

Le reste des pages (page projet, pages d'authentification, etc.) doit adopter la nouvelle palette et la nouvelle police, sans changement de comportement ou de structure fonctionnelle."

## Clarifications

### Session 2026-07-22

- Q: The sidebar is rendered by one shared layout wrapping every signed-in page (home, project detail, new project, profile) — does removal apply to that entire shared layout, or only to the home page? → A: The entire signed-in app shell — every signed-in page switches to the horizontal top navigation; the sidebar is removed everywhere, not just on home.
- Q: The accent color went through two iterations during implementation (a honey/ochre tone, then a raspberry/pink tone) that the user found dull and then inconsistent with the rest of the palette respectively — what should the final palette be? → A: Drop the second accent hue entirely. Single-hue palette: lavender (a pale tone and a more saturated "emphasis" tone) plus neutral gray and near-black, no separate accent color. The page background is a diagonal gradient (top-left to bottom-right) from pale lavender to light gray, rather than a flat color.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent new visual identity everywhere (Priority: P1)

Anyone using b-mate — a developer managing projects or a client viewing progress — sees one consistent, light visual identity across every page: the marketing landing page, every signed-in page, and every authentication page. The previous dark palette is gone entirely.

**Why this priority**: This is the foundation every other part of the rebrand builds on — without it, the app would look inconsistent regardless of any layout changes.

**Independent Test**: Visit the landing page while logged out, then log in and browse any page (home, a project, the profile page). Every page uses the new palette (a diagonal pale-lavender-to-light-gray gradient background, white cards, near-black text, a more saturated lavender for emphasis elements) and the new typeface, with no trace of the previous dark ink/rust theme.

**Acceptance Scenarios**:

1. **Given** a visitor on the marketing landing page, **When** the page loads, **Then** it displays the new color palette and typeface.
2. **Given** a signed-in user on any protected page, **When** the page loads, **Then** it displays the new color palette and typeface.
3. **Given** any page in the application, **When** it is rendered, **Then** no dark-theme styling is present or reachable.

---

### User Story 2 - Horizontal navigation app-wide, dashboard-style home (Priority: P1)

The sidebar disappears from every signed-in page — home, a project's detail page, the new-project page, the profile page — replaced everywhere by a horizontal navigation bar at the top. On top of that shared change, the home page specifically is redesigned as a dashboard: a welcoming heading and a set of information cards, instead of today's plain project list.

**Why this priority**: The sidebar was added out of habit rather than an actual need, and its removal is the most visible structural change the user wants; it directly reshapes how every signed-in page is navigated, not just the home page.

**Independent Test**: Log in and visit several signed-in pages (home, a project, the profile page). None of them show a sidebar; all show the same horizontal navigation bar at the top. The home page additionally shows a welcome heading and information cards rather than a plain project list.

**Acceptance Scenarios**:

1. **Given** a signed-in user on any signed-in page, **When** the page loads, **Then** no sidebar is displayed and the same horizontal navigation bar is shown instead.
2. **Given** a signed-in user on the home page specifically, **When** they view it, **Then** they see a welcome heading and a dashboard-style set of information cards rather than a plain project list.
3. **Given** a signed-in user, **When** they need to do anything previously reachable only from the sidebar (view projects, start a new project, view their profile, log out), **Then** each of those actions remains reachable from the new navigation, from any signed-in page.

---

### User Story 3 - Existing pages keep working, just restyled (Priority: P2)

A developer viewing a project's detail page, or anyone on an authentication page (login, signup), sees the new palette and typeface applied, but every existing behavior, action, and piece of information stays exactly where and how it was.

**Why this priority**: Lower risk than the home-page redesign, but still needs verifying — a visual-only change that accidentally breaks or hides functionality would be a regression, not a rebrand.

**Independent Test**: Open a project's detail page and an authentication page before and after the change. All the same actions and information are present in the same places, only the colors and typeface differ.

**Acceptance Scenarios**:

1. **Given** a project detail page, **When** it is restyled, **Then** every action and piece of information previously available (invite, cancel, resend, members list, etc.) remains available and functionally unchanged.
2. **Given** an authentication page (login or signup), **When** it is restyled, **Then** the form fields, validation, and submission behavior are unchanged.

### Edge Cases

- What happens to actions that currently live only in the sidebar (e.g. logging out, starting a new project) once the sidebar is gone? They MUST be relocated to the new top navigation so nothing becomes unreachable.
- What happens to existing shared UI components (buttons, cards, forms) styled against the old palette's contrast assumptions? They MUST be re-verified for readable contrast under the new light palette, not just re-colored blindly.
- What happens on narrow/mobile screens where a horizontal navigation bar has less room than a sidebar did? Navigation MUST remain fully usable at common mobile widths (existing responsive conventions apply).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST use a single new color palette everywhere: a diagonal gradient background (pale lavender to light gray, top-left to bottom-right), white cards, near-black (not pure black) text, and a single accent hue family (lavender) — a pale tone for soft/secondary elements and a more saturated tone for elements that need emphasis (e.g. primary actions). No separate second accent color.
- **FR-002**: The application MUST NOT offer or expose a dark theme — the new light palette is the only visual theme.
- **FR-003**: The application MUST use the Urbanist typeface everywhere text is rendered, replacing the current typeface.
- **FR-004**: The marketing landing page MUST use the same new color palette and typeface as the rest of the application.
- **FR-005**: The persistent sidebar currently shown on every signed-in page MUST be removed and replaced by a horizontal navigation bar at the top of the page, applied to the entire signed-in app shell (every signed-in page — home, project detail, new project, profile — switches to the horizontal top nav, not just home).
- **FR-006**: The signed-in home page MUST be redesigned as a dashboard: a prominent welcome heading plus a set of information cards, replacing the current plain project-list layout. The specific navigation items and the specific cards/content shown are explicitly out of scope for this feature and will be defined separately.
- **FR-007**: Every action previously reachable only via the sidebar (viewing the project list, starting a new project, viewing the user's profile, logging out) MUST remain reachable via the new navigation.
- **FR-008**: Every other existing page (project detail, login, signup, etc.) MUST adopt the new palette and typeface without any change to its existing functional behavior, available actions, or information displayed.
- **FR-009**: Every page MUST maintain readable text-to-background contrast under the new palette.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of pages in the application (landing page and every signed-in/authentication page) display the new palette and typeface — none display the previous dark theme.
- **SC-002**: A signed-in user can reach every action previously available from the sidebar (projects, new project, profile, logout) in 2 clicks or fewer from any signed-in page.
- **SC-003**: A signed-in user sees an overview of their activity on the home page within the first viewport on a standard desktop screen, without scrolling.
- **SC-004**: All body text meets a minimum readable contrast ratio (WCAG AA, 4.5:1 for normal text) against its background under the new palette.
- **SC-005**: No functional regression is introduced on any restyled page — every action available before this change remains available and behaves the same way after it.

## Assumptions

- Urbanist is self-hosted/bundled with the application rather than loaded from an external font CDN, consistent with how fonts are currently loaded.
- The existing shadcn/ui component primitives (button, card, form, sidebar, etc.) are re-themed via the existing CSS custom-property token system, not replaced with a different component library.
- Removing the dark theme means removing the current unused `.dark` class token overrides, not repurposing them into the new palette.
- The exact horizontal navigation items and the exact set/content of the home page's dashboard cards are intentionally undecided at this stage (per the feature description) and will be defined in a later planning step or a follow-up spec — this feature commits only to the structural change (sidebar removed, horizontal top nav, dashboard-style home layout).
- No new pages are introduced by this feature — only existing pages are restyled and, for the home page, relaid-out.
- The sidebar component itself (`shared/components/ui/sidebar.tsx`) may become unused after this change; removing vs. keeping the underlying shadcn primitive for potential future reuse is an implementation detail, not a product decision.
- The gradient background applies to the page canvas only (`body`), not to individual surfaces — cards, the top navigation bar, and other solid UI chrome stay flat white so content remains crisply legible against the gradient behind it.
