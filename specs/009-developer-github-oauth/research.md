# Phase 0 Research: Developer GitHub OAuth Login

## Decision 1: A GitHub OAuth App, not a GitHub App

**Decision**: Register a plain GitHub OAuth App (Settings → Developer settings → OAuth Apps) for this feature, requesting scopes `read:user user:email`.

**Rationale**: OAuth Apps are GitHub's mechanism specifically for "sign in with GitHub" identity use cases — exactly this feature. GitHub Apps are the heavier mechanism, scoped to repository/organization installation and permissions, which is what the *existing, unrelated* board-connection feature's manually-entered Personal Access Token stands in for today (FR-007 — deliberately not touched here). Conflating the two would blur a boundary the spec explicitly draws.

**Alternatives considered**:
- **A GitHub App**: rejected — designed for installation-scoped repo access, not identity; would also invite exactly the confusion with board-connections the spec rules out.
- **Reusing/extending the board-connection PAT mechanism for login**: rejected outright by FR-007 — a manually-pasted PAT is a fundamentally different trust model (developer-supplied, repo-scoped) from an OAuth identity handshake, and conflating them would make revoking one accidentally affect the other.

## Decision 2: Scope — `read:user user:email`, nothing else

**Decision**: Request exactly `read:user` (profile: name, avatar, login) and `user:email` (email addresses, including verified-private ones via `/user/emails`). No `repo` scope.

**Rationale**: This feature only needs to confirm identity and get a display name/avatar/verified email — never repository data. Requesting `repo` would both violate least-privilege and visually alarm developers on GitHub's consent screen with a permission the product doesn't use.

## Decision 3: The `state` parameter lives in a short-lived signed cookie, not a database table

**Decision**: `GET /auth/github` generates a cryptographically random `state` value, sets it in a short-lived (5–10 minute), `httpOnly`, `sameSite=lax` cookie (a sibling to the existing session cookie, not the session cookie itself), and includes the same value in GitHub's authorize URL. `GET /auth/github/callback` MUST reject the request (no account created, no session issued) if the `state` query param doesn't match the cookie's value, or the cookie is missing/expired.

**Rationale**: `state` only needs to survive one browser round-trip (Diaphane → GitHub → Diaphane) and is inherently scoped to one browser by nature — a cookie is the simplest correct mechanism, with no new table and no risk of orphaned rows to clean up. This mirrors the project's existing bias toward simple, stateless-where-possible mechanisms (AGENTS.md: hand-rolled auth, no unnecessary machinery) while still providing real CSRF protection, which the constitution's Security principle requires explicitly for this flow.

**Alternatives considered**: a server-side `OAuthState` table keyed by a token — rejected as unneeded complexity for a value with a multi-minute lifetime and single use.

## Decision 4: The GitHub access token is used once and discarded

**Decision**: The callback handler exchanges the authorization `code` for a GitHub access token (server-to-server, using the OAuth App's client secret — never sent to the browser), uses that token exactly once to call `GET /user` and `GET /user/emails`, then discards it. No GitHub access token is persisted to the database.

**Rationale**: Matches spec.md's Assumptions — this feature only needs to *confirm identity* once per login, not maintain ongoing GitHub API access as the developer (that's the separate, PAT-based board-connection feature). Storing an unused token would be a needless secret to protect and rotate for zero benefit.

## Decision 5: Verified email comes from `/user/emails`, never trusted from `/user` alone

**Decision**: After exchanging the code, call `GET /user/emails` (requires `user:email`) and select the entry where `primary === true && verified === true`. If no such entry exists, treat this as "no verified email" per FR-006 — block account creation, redirect back to the login/signup page with an error state the frontend renders as a plain-language message ("make an email public and verified on GitHub, then try again").

**Rationale**: `GET /user`'s own `email` field is only populated when the developer has chosen to make an email public, and carries no verification signal either way. `/user/emails` is GitHub's authoritative source for both "is this really the developer's" (verified) and "which one do they mean by default" (primary) — using anything else risks silently trusting an unverified address.

## Decision 6: Find-or-create keys on a new `github_id`, never on email or username

**Decision**: Add a nullable, unique `github_id` column to `users` (GitHub's stable numeric account id). On callback, look up `User` by `githubId`. If found, log in. If not found, create a new `User` (`accountKind: "developer"`, `passwordHash: null`, `githubId` set, `email`/`firstName`/`lastName`/`image` populated from the GitHub profile) and log in.

**Rationale**: GitHub usernames (`login`) can change; the numeric id cannot, so it's the only safe stable key. Per spec FR-008/Assumptions, this feature does not attempt to match or merge with any pre-existing password-based account by email — every GitHub identity not already linked gets a fresh account, full stop. This keeps the find-or-create logic a pure, easily-tested two-branch function with no fuzzy matching.

**A real implementation edge this decision surfaces**: `users.email` is `@unique`. If a GitHub developer's verified email happens to already exist on some other row (a leftover test/seed account, or even a client's row), a naive `create` throws a raw Prisma unique-constraint error. Resolution: catch that specific constraint violation on the create path and return a clear, generic conflict response ("An account already exists with this email") rather than a raw 500 — this is baseline robustness, not a new product decision (the spec already ruled out any linking/merging behavior here; this only decides *how the doomed case fails*, not what it should do instead).

## Decision 7: Login and sign-up stay two routes, both rendering `AuthGateway`

**Decision**: `/login` and `/signup` remain two separate pages (many existing links across the landing page point at each specifically — nav, hero, closing band), each keeping its own page heading ("Log in" vs. "Sign up"). Both render the same `AuthGateway` component (see Decision 10, revised) — not the bare `GitHubAuthCard` originally planned here. `GitHubAuthCard` itself is unchanged: a styled link to `${NEXT_PUBLIC_API_URL}/auth/github?locale=<current-locale>` (Decision 9), not a form or client-side mutation. It no longer takes a `mode` prop — that idea (varying its own copy by login vs. signup) turned out to be unnecessary once each page kept its own external heading, and is fully superseded by `AuthGateway` wrapping it.

**Rationale**: Satisfies spec.md's resolved decision (a single functional entry point — the backend never distinguishes new vs. returning) without the churn and risk of consolidating two long-standing routes and rewriting every internal link that points at `/login` or `/signup` today. Simpler, smaller blast radius, same user-facing outcome.

**Alternatives considered**: collapsing to one literal shared route (e.g. redirecting `/signup` → `/login`) — rejected as unnecessary churn across the landing page and marketing copy for no behavioral gain.

## Decision 8: The "Continue with GitHub" action is a plain link, not a client-side mutation

**Decision**: The button/link that starts the flow is a real anchor (`<a href="...">` / a plain, non-JS navigation), not a `fetch()`-driven form submission like the existing `login-form.tsx`/`signup-form.tsx`.

**Rationale**: The browser must perform a real top-level navigation to GitHub's consent screen and back — this cannot go through `fetch`/XHR (no top-level redirect capability, and GitHub's login/consent UI must render as the actual page, not inside an app shell). This is a structurally different component pattern from the forms it replaces (no `react-hook-form`, no mutation hook, no client-side validation) — tests for the new component verify the rendered `href`, not a submit handler.

## Decision 9: The post-login redirect is locale-aware via a query param, not guessed server-side

**Decision**: The initiating link includes the developer's current locale as a query param: `${NEXT_PUBLIC_API_URL}/auth/github?locale=fr`. The API stores that locale alongside `state` in the same short-lived cookie from Decision 3, and on successful callback redirects to `${WEB_ORIGIN}/<locale>/home` using the stored value (falling back to the app's own default locale, `fr`, if it's ever missing/invalid).

**Rationale**: `apps/web`'s `next-intl` routing uses `localePrefix: "always"` with no bare, un-prefixed route (confirmed — no `middleware.ts` auto-redirects a bare path), so the API cannot redirect to a locale-less URL and rely on the frontend to sort it out; it has to know which locale to send the developer back to, and the only place that knowledge already exists is the page they clicked "Continue with GitHub" from.

**Alternatives considered**: reading the `Accept-Language` header server-side — rejected as a weaker, indirect signal when the frontend already knows its own locale exactly.

## Decision 10 (revised 2026-08-07): `AuthGateway` — a Developer/Client toggle on `/login` and `/signup`, no separate route

**Original decision (superseded, kept below for the record):** a new, separate `/client-login` page, unlinked from any nav, reusing `LoginForm` verbatim — reasoned that clients "essentially never navigate here directly" since they arrive via an emailed invitation link.

**What was wrong with it**: that reasoning only covers a client's *first* visit (invitation acceptance). It said nothing about a *returning* client whose session expired or who logged out — that person lands back on the marketing site with no discoverable way to log in at all, since the site's only "Log in"/"Sign up" links now point at a GitHub-only page. An unlinked, bookmark-only route is not "familiar and frictionless" for a non-technical client — it's a dead end. Caught only because the user asked "how do clients log in now?" after implementation — a real gap, not a hypothetical.

**Revised decision**: no separate route. `/login` and `/signup` each render a new `AuthGateway` component (`apps/web/features/auth/components/auth-gateway.tsx`): a two-button Developer/Client toggle — visually and interactionally the same pattern the old self-serve `SignupForm` already used for account-kind — directly above the relevant content. "Developer" (selected by default) shows `GitHubAuthCard`; "Client" shows the unchanged `LoginForm` in place. One page, one obvious choice, zero hidden URLs, zero extra clicks for whichever audience arrives. `/client-login` is deleted.

**Rationale**: Matches a pattern the product already had and the user already found good, rather than inventing a new one. Keeps `GitHubAuthCard` and `LoginForm` themselves completely unchanged (composition only) — `AuthGateway` is the only new piece. Every existing link to `/login`/`/signup` keeps working with no rewiring, and clients need to remember nothing beyond "go to the site and log in," exactly like before this feature shipped.

**Alternatives considered** (this round):
- **A small "Client? Log in here" link tucked under the GitHub button on `/login`**: rejected — still routes clients through developer-flavored content first (GitHub branding, OAuth concepts) before they find their own path, which cuts against the product's core principle of never making a non-technical client engage with developer tooling.
- **A "Client area" link in the marketing nav**: rejected — adds a permanent, always-visible nav item for a page most visitors (prospective developers) never need, and still doesn't match the familiar single-entry-point mental model as closely as a toggle on the page they already land on.

## Decision 11 (2026-08-07): No default toggle selection; both panels always mounted, stacked in one grid cell

**Decision**: `AuthGateway`'s `kind` state starts `null` — neither "Developer" nor "Client" is pre-selected, and no panel is shown until one is explicitly chosen. Once revealed, both `GitHubAuthCard` and `LoginForm` stay mounted permanently, positioned in the same CSS Grid cell (`col-start-1 row-start-1`) so the cell's height is always the *taller* of the two regardless of which is opacity-visible; switching between them cross-fades opacity instead of resizing the card. The one real height change — nothing chosen → a panel appearing — animates via the `grid-template-rows: 0fr → 1fr` technique (the only CSS-only way to transition to/from `auto` height). The inactive panel is marked `inert` so it's never focusable or announced to assistive tech while hidden.

**Rationale**: A first pass defaulted to "developer" selected and showed the GitHub button immediately — direct user feedback: this puts developer/GitHub content in front of every visitor, including non-technical clients, before they've done anything, reintroducing exactly the technical friction this product exists to remove for clients. It also swapped the mounted component outright on toggle, which visibly jumped the card's height given how different `GitHubAuthCard` (one button) and `LoginForm` (two fields + button) are in size. Neither issue was acceptable for a production-quality auth surface. The stacked-grid technique is fully CSS-driven — no measured/hardcoded pixel heights, so it stays correct across translations, error states, and any future change to either panel's content.

**Alternatives considered**:
- **A hardcoded `min-height` on the swap container**: rejected — a magic number that silently breaks the moment either panel's content changes (a longer French translation, an error message appearing).
- **Swap the mounted component with a fade only (no height reservation)**: rejected — still resizes the container abruptly; a fade on top of a jump reads as more broken, not less.
- **Defaulting to "client" instead of "developer"**: rejected — trades one unjustified assumption for another; the fix is not presuming *either* audience, not picking the other one.
