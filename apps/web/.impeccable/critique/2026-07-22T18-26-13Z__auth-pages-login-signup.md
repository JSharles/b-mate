---
target: auth pages (login + signup)
total_score: 17
max_score: 36
na_heuristics: 7
p0_count: 1
p1_count: 2
timestamp: 2026-07-22T18-26-13Z
slug: auth-pages-login-signup
---
Method: dual-agent (A: a8c65dc5c9d855419 · B: a656eae8a4eb2d609)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Submit button swaps to a pending label — fine, but no proactive password-rule hint before failure. |
| 2 | Match System / Real World | 1 | Raw Zod internals shown verbatim: "Too small: expected string to have >=1 characters". |
| 3 | User Control and Freedom | 2 | No forgot-password path anywhere; a locked-out user has no way forward. |
| 4 | Consistency and Standards | 3 | Login/signup share components/tokens correctly. |
| 5 | Error Prevention | 1 | Password minimum never shown proactively; every field validates only on submit. |
| 6 | Recognition Rather Than Recall | 2 | Labels persist above fields (good), but requirements must be recalled/guessed. |
| 7 | Flexibility and Efficiency | n/a | Two/five-field Operate-mode form, no shortcuts expected. |
| 8 | Aesthetic and Minimalist Design | 3 | On-tone with DESIGN.md's restraint, arguably under-designed (no card, no logo). |
| 9 | Error Recovery | 1 | Same jargon leak as #2, plus every field fails at once. |
| 10 | Help and Documentation | 1 | Zero help text or support/recovery link anywhere. |
| **Total** | | **17/36** | **Poor (47%)** |

## Design Specificity Verdict

Generic auth-form template with the brand's tokens painted on top — nothing acknowledges that a real share of visitors are non-technical clients landing here cold from an invite email. Verified live (not guessed): submitting bad input surfaces Zod's own internal message text, not product copy.

## Overall Impression

The plumbing is solid — correct `autocomplete`, correct `type=`, correct label/input association, real-time confirm-password matching, focus/error rings exactly matching DESIGN.md's Input spec. But the one screen carrying this product's highest first-impression stakes currently: (1) talks to the user in Zod's internal English, (2) has zero brand presence, and (3) welcomes a brand-new signup with "Welcome back."

## What's Working

- Focus and error states wired correctly to DESIGN.md's documented Input tokens (ink focus ring, destructive border/ring on invalid).
- Real-time confirm-password check and correct `autocomplete` values (`new-password`/`current-password`/`given-name`/`family-name`) — password managers will behave correctly.
- Login and signup share the exact same structure/components — no visual drift between the two.

## Priority Issues

**[P0] Raw Zod validation strings shown as user-facing copy** — confirmed live on both forms: empty/short fields render literally as "Too small: expected string to have >=1 characters" / ">=8 characters" (`packages/schemas/src/auth.ts`'s bare `.min(1)`/`.min(8)`, no custom message — only `confirmPassword`'s mismatch check has one, in `apps/web/features/auth/schemas.ts`). This is developer jargon on the screen where a non-technical client forms their first impression.

**[P1] Auth pages have zero brand presence** — `login/page.tsx` and `signup/page.tsx` render a bare form floating directly on the gradient background: no logo, no Card surface (DESIGN.md's own Card component is used everywhere else in the app but skipped here). Nothing confirms to a cold-arriving client that this is really b-mate.

**[P1] No forgot-password path anywhere** — a non-technical client who forgets a password they set once, months ago, via an invite link, has no way forward from the login form.

**[P2] No password show/hide toggle** on either password field.

**[Flag, not a design call] "Welcome back" shown to brand-new signups** — `Home.welcome` ("Welcome back, {firstName}") is used identically after both login and signup redirects, so a person ten seconds into their first-ever session is told "back."

**[Flag, needs your call — touches security/product policy, not just design] Signup's duplicate-email error text** — the signup form surfaces "An account with this email already exists," which is normal, expected UX for a person signing up with their own email, but does mean anyone can probe arbitrary addresses against `/signup` to learn who already has an account. `docs/PRODUCT.md` already states an anti-enumeration rule, but explicitly for the *invitation* flow (blocking a developer from probing a third party's email) — this is a different, more generic account-enumeration question for the *signup* form itself. Not resolving this unilaterally; flagging it as an explicit open decision.

## Persona Red Flags

**Jordan** (cold from an invite link): hits every P0/P1 above — jargon errors, no trust anchor, no recovery path, then "Welcome back" on arrival.
**Riley** (stress tester): bad/empty input is exactly what surfaced the raw Zod strings and the enumeration-revealing duplicate-email message.
**Sam** (keyboard/screen-reader): fares comparatively well — correct focus rings, correct label/input association via the shared Form primitives — but 5 errors landing at once with no summary is harder to triage by tab-through alone.

## Minor Observations

- Signed-in users can still reach `/signup` with no redirect to `/home` (not checked on `/login`).
- A thin amber/gold bar visible at the very top of both screenshots doesn't match any DESIGN.md token — most likely Next.js dev-toolbar chrome, not app UI; not confirmed either way.
- Detector found `flat-type-hierarchy` (14/16/24px, 1.7:1 ratio) and `layout-transition` (`transition: height` on `body`) on both pages — both trace to the shared root layout, not anything auth-specific, so out of scope for this pass.
- True narrow-viewport (~390–520px) rendering could not be verified this session (`resize_window` doesn't actually change the rendered viewport in this environment, confirmed again via `window.innerWidth`).

## Questions to Consider

- What if login/signup used the same Card + logo treatment as the rest of the product, instead of being the one screen with zero b-mate identity?
- What if every validation string reachable by a non-technical client was rewritten before this ever reaches a real client invite?
- What if the first thing a brand-new signer-upper saw wasn't "Welcome back," but something that's actually true?
