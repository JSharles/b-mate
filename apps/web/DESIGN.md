---
name: Diaphane
description: Track your project's progress with total transparency.
colors:
  void: "#000000"
  periwinkle: "#dae1ff"
  off-white: "#eff0f6"
  card: "#0c0d17"
  muted-surface: "#04050a"
  secondary-surface: "#181a25"
  accent-surface: "#141622"
  muted-foreground: "#898b99"
  border: "#20222d"
  input-border: "#2d2f3e"
  periwinkle-glow: "#5c71e7"
  midnight-blue: "#1c2245"
  gradient-from: "#000000"
  gradient-via: "#000002"
  gradient-to: "#010206"
  destructive: "oklch(0.65 0.22 27.325)"
  success: "#16a34a"
  iris-pink: "#f6c9de"
  iris-yellow: "#f5e6a8"
  iris-blue: "#b8d4f5"
typography:
  display:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "normal"
  headline:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "0.2em"
  caption:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.025em"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.periwinkle}"
    textColor: "{colors.void}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 1rem"
  button-primary-hover:
    backgroundColor: "rgba(218, 225, 255, 0.9)"
    textColor: "{colors.void}"
  button-secondary:
    backgroundColor: "{colors.secondary-surface}"
    textColor: "{colors.off-white}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 1rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.off-white}"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.off-white}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0.25rem 0.75rem"
---

# Design System: Diaphane

## Overview

**Creative North Star: "The Glass Report"**

Diaphane exists to make a client's project legible without dressing it up — the product principle is that nothing shown is ever generated or invented, only real, existing content, reworded plainly. The visual system follows the same discipline: quiet, high-contrast, and unornamented. Now that reads as pale periwinkle text and interface elements on a near-void black field, rather than the reverse — nothing fights for attention, because the point is that the client can see through to what's actually happening, not be impressed by the interface doing it.

There is exactly one interactive color (periwinkle) and one atmospheric ground (void black). This is a deliberate reversal of the system's own prior "single light theme, no dark mode" commitment (see Rebrand note below) — not a toggle, still a single committed theme, just inverted.

**Key Characteristics:**
- Single dark theme, no light mode — the calm, legible surface is still the whole point, now read against black instead of paper.
- One interactive color (periwinkle), one void ground (black) — never both fighting for emphasis.
- Flat surfaces with a fixed, non-scrolling gradient mesh behind everything; on black, "elevation" reads as a soft periwinkle glow rather than a shadow (shadows don't render against a black ground).
- Urbanist throughout, leaning on weight contrast (400 body vs. 900 display) rather than multiple families.

## Colors

The palette reads as periwinkle ink on a void ground: one pale accent for everything actionable, near-black for atmosphere and surfaces, a soft off-white for body text.

### The Signature Four
Confirmed as a product-truth-level brand commitment (`docs/PRODUCT.md` § Brand Commitments, 2026-08-07) — every token below exists in service of these four:

| Color | Role | Value |
|---|---|---|
| **Black** | The void — base page background | `#000000` |
| **Midnight Blue** | Atmosphere — the background mesh's soft glow, never a flat fill | `#1c2245` (composited: `--gradient-glow` `#5c71e7` blended into the black ground) |
| **Pale Mauve** ("Periwinkle" below) | The one interactive/emphasis color | `#dae1ff` |
| **White** | Body text and bright surfaces (as an off-white, not pure white) | `#eff0f6` |

Everything from here down — card/muted/accent surfaces, borders, the destructive/success exceptions — is the same four colors worked into a full token system, not a departure from them.

### Primary
- **Periwinkle** (`#dae1ff`): the only color used for buttons, links, focus rings, and emphasis of any kind. Promoted from its prior purely-atmospheric role (see Rebrand note) — never diluted into a second "brand color," see the One Voice Rule below.

### Neutral
- **Void** (`#000000`): base page background — the exact black of the brand-logo asset's own chip, so the logo blends into the page with no visible seam.
- **Off-White** (`#eff0f6`): default body text — a barely periwinkle-tinted near-white, not pure `#ffffff`.
- **Card** (`#0c0d17`): card, popover, and input surfaces — the same periwinkle hue family as the accent, recomputed at low lightness so elevation reads as "the same world, lighter," not a flat gray.
- **Muted Surface** (`#04050a`) / **Muted Foreground** (`#898b99`): secondary backgrounds and de-emphasized text (badges, hints, timestamps) — tinted from the periwinkle hue, never plain gray.
- **Secondary Surface** (`#181a25`) / **Accent Surface** (`#141622`): supporting-button fill and hover-state backgrounds, one step up from Card.
- **Border** (`#20222d`) / **Input Border** (`#2d2f3e`): hairline dividers and form-field strokes — light enough to read against Void and Card without becoming a second accent.

### Gradient Family (background only)
- **Periwinkle Glow** (`#5c71e7`): the radial "glow" pool in the fixed background mesh, mixed at low opacity — never used as a solid fill anywhere else.
- **Gradient From / Via / To** (`#000000` → `#000002` → `#010206`): the diagonal wash behind the whole app, from pure void at the top-left corner to a barely-lighter near-void tone — deliberately subtle, so the mesh reads as atmosphere, not a visible light source.

### Semantic / Status
- **Success** (`#16a34a`): reserved exclusively for a small "this is live/active right now" indicator (e.g. a pulsing status dot on a core-feature card). This is a *status* color, not a brand accent — it never appears on a button, link, badge of emphasis, or anywhere meaning "act on this." Added deliberately (2026-07-24) after clarifying that the No Second Accent Rule targets decorative/brand accents, not functional status semantics — see the Named Rules below.
- **Destructive** (`oklch(0.65 0.22 27.325)`): lightened from the light-theme value (`oklch(0.577 0.245 27.325)`) specifically for the dark ground — the original measured 4.4:1 against pure black, just under the 4.5:1 body-text contrast floor; this variant clears 5.9:1.

### Iridescent Glass (Signature Card only)
- **Iris Pink** (`#f6c9de`) / **Iris Yellow** (`#f5e6a8`) / **Iris Blue** (`#b8d4f5`): a soft, pastel trio used exclusively as blurred decorative background blobs behind a frosted glass panel on the Signature Card (see Components → Cards). Unchanged hues — against the new dark frosted panel they read as glowing light sources rather than pastel washes, which suits "Glass Report" even more literally than the light version did. Never used for text, icons, borders, or anything read as emphasis — purely atmospheric texture, scoped to the one or two most differentiated surfaces in the product. Not a general accent palette.

### Named Rules
**The One Voice Rule.** Periwinkle is the only color allowed to mean "act on this" or "this is emphasized." Everything else is void, near-void surface, or off-white body text — no second color is ever promoted to a button, a link, or a focus ring.

**The No Second Accent Rule.** Honey/ochre and raspberry were both explicitly tried (in the original light system) as a second *decorative brand accent* and rejected — don't reintroduce a warm or saturated color to "liven up" the palette as a stand-in second brand color. This rule targets accent proliferation, not functional status semantics: a narrowly-scoped status color (Success) used only for a literal "active/live" indicator is a different category and is allowed — see Semantic / Status above. The calm, near-monochrome void-and-periwinkle system remains the deliberate choice for everything actionable and decorative.

*Rebrand note (2026-08-07, dark):* the new brand-logo asset is a lockup baked onto a pure-black chip, its wordmark set in the brand's own periwinkle — sampled directly from the asset (not eyeballed) and confirmed to be the exact existing `#dae1ff`. That pairing replaces the system's prior "single light theme, no dark mode" commitment as the one and only theme. Periwinkle's role inverts from purely atmospheric (backgrounds/secondary surfaces, in the light system) to the one interactive color — the same single-accent discipline the old "ink" role had, just carried by periwinkle now that near-black has become the page itself and has no contrast left to give. Every neutral tone (card/muted/accent/border/input) is the same periwinkle hue (~278° in OKLCH) recomputed at low lightness, preserving the "one hue family, many lightness steps" structure the light system already used for its own neutrals (paper/muted-surface/border were never plain gray either).

*Prior rebrand note (2026-08-07, hue):* the atmospheric color earlier that same day shifted from violet/lavender to periwinkle (`#dae1ff`, the new logo's own background at the time) — a hue rotation of the light palette structure. Superseded within hours by the dark rebrand above once a second, black-ground logo asset arrived; kept here because the hue itself (periwinkle, ~278°) carried forward unchanged into the dark system.

## Typography

**Display Font:** Urbanist (with system-ui, sans-serif fallback)
**Body Font:** Urbanist (same family — weight and size carry the hierarchy, not a second typeface)
**Label/Mono Font:** Geist Mono — defined as a token (`--font-geist-mono`) but not yet used anywhere visible in the UI; reserve it for genuinely tabular/code content if that need arises.

**Character:** One typeface stretched across the whole weight range — 900 for the rare hero moment, 400 for everything you actually read — so the system stays quiet without going flat.

### Hierarchy
- **Display** (900, `clamp(2.25rem, 5vw, 3.75rem)`, 1.05 line-height): the landing hero headline only. The single loud typographic moment in the whole system.
- **Headline** (600, 1.5rem/`text-2xl`, 1.2): page-level titles (e.g. "Your projects").
- **Title** (600, 1.125rem/`text-lg`, 1.2): card and section titles.
- **Body** (400, 0.875rem–1rem, 1.5): everything else — forms, descriptions, list content.
- **Label** (600, 0.875rem, 0.2em letter-spacing, uppercase): eyebrow/kicker text above headlines (landing sections).
- **Caption** (600, 0.75rem/`text-xs`, uppercase): small pill badges and tags (status chips, "coming soon" markers) — smaller than Label because it sits inside a compact pill rather than introducing a section.

### Named Rules
**The Eyebrow Rule.** Any uppercase, letter-spaced label is a *label*, never a heading — it introduces the headline that follows, it doesn't replace one.

## Layout

No custom spacing scale is defined — the project relies directly on Tailwind's default spacing utilities (`gap-2/4/6`, `px-4/6`, `py-6`). Cards lay out in a responsive grid: one column on mobile, two on `sm`, three on `lg`. Marketing content on the landing page is constrained to a narrow reading measure (`max-w-3xl` for the hero, `max-w-xl` for its subhead) even though the product surfaces themselves are full-width dashboards. Container padding is consistently `px-4` on mobile, `px-6` from `sm` up.

## Elevation & Depth

Flat by default. Surfaces carry no shadow at rest; a single soft `shadow-sm` appears only on cards and inputs as a state marker, not as a layering system, and cards lift slightly (`-translate-y-0.5` + `hover:shadow-md`) on hover as the one motion-based depth cue. The real source of depth in this system isn't shadows at all — it's the fixed background gradient mesh sitting behind every page, which reads as atmosphere rather than elevation. A dark `shadow-*` still renders (browsers don't skip it), it's just visually near-invisible against a void ground — kept rather than replaced with a bespoke glow system, because the primary elevation cue was always the Card/Muted/Void lightness step, not the shadow itself; the shadow utilities stay as the same "state marker, not a layering system" they were in the light theme.

### Shadow Vocabulary
- **Resting surface** (`box-shadow: none`): default state for every surface.
- **Card / input** (`shadow-sm`): the one ambient shadow the system uses, present at rest on cards and form inputs — a fainter cue on black than it was on paper, secondary to the Card/Void lightness contrast that now carries most of the elevation signal.
- **Card hover** (`shadow-md` + `-translate-y-0.5`): the only elevation *change* in the system, reserved for interactive project cards.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow only ever appears as a fixed, low-intensity marker (cards, inputs) or as a direct response to hover — never as a multi-level elevation system.

## Shapes

Corners are gently rounded, never sharp and never pill-shaped by default: `0.625rem` (10px) is the base radius, scaled down to `0.375rem`/`0.5rem` for smaller controls and up to `0.875rem` for larger containers. The one exception is `rounded-full`, reserved for the landing page's hero CTA and for circular elements (avatars) — see the Pill CTA note in Do's and Don'ts.

## Components

### Buttons
- **Shape:** `rounded-md` (8px) for every in-app button, regardless of variant.
- **Primary:** Periwinkle background, void text, `h-9 px-4` at default size — the only button variant that reads as "the main action."
- **Secondary:** Secondary Surface background, off-white text — used for a supporting action next to a primary one, never alone as the main call-to-action.
- **Outline / Ghost:** transparent or void background, off-white text, border only on `outline` — used for low-emphasis or destructive-adjacent actions.
- **Hover / Focus:** primary lightens toward `rgba(218,225,255,0.9)`; every variant gets a 3px `ring/50` focus ring in Periwinkle on keyboard focus.
- **Marketing exception:** the landing hero CTA is `rounded-full` (a pill), not `rounded-md` — a deliberate, scoped exception for the one marketing call-to-action, not a pattern to carry into the product UI.

### Cards
- **Corner Style:** `rounded-xl` (14px).
- **Background:** Card on Void — the card is always the (slightly) brighter surface against the page, the same relative relationship the light theme had (White on Paper), inverted in absolute lightness.
- **Shadow Strategy:** `shadow-sm` at rest, `shadow-md` + slight lift on hover for interactive (clickable) cards only — see Elevation & Depth; on black the Card/Void lightness step does more of the visual work than the shadow itself.
- **Internal Padding:** `py-6`, with `px-6` on header/content sub-sections.

#### Signature Card (scoped exception)
A card representing a core, load-bearing value proposition (today: the Current Task card only) may take a deliberately richer treatment than an ordinary card — reserved for the one or two surfaces that actually carry the product's differentiation, not a general pattern:
- **Iridescent glass background:** soft, blurred pink/yellow/blue blobs (Iris Pink/Yellow/Blue — see Colors) behind a frosted *dark* panel (`backdrop-blur` + `bg-white/[0.06]` + `border-white/15`, not translucent white), evoking the "Glass Report" name literally rather than metaphorically — the blobs now glow through the glass like light sources rather than sitting behind a bright wash. The blobs are decorative texture only — all text sits on the frosted panel, never directly on a blob, so contrast is governed by the panel, not the gradient underneath.
- A soft ambient glow behind its lead icon, using Periwinkle Glow at low opacity — the same token the background mesh already uses.
- A continuously-rotating conic-gradient progress ring (Off-White arc on a Muted-Foreground track) around a lead icon, signaling "actively in progress."
- A small pulsing Success-green status dot (see Semantic / Status) directly on that same icon — "this is live right now."
- Bolder, larger title typography than an ordinary card's content — this card's title is the closest thing product UI has to a headline moment.
- Marginally deeper shadow and padding than sibling cards, so it physically sits forward on the page even when it isn't first in reading order.
This is an intentional, named exception — not license to add shine to every card, and Iris Pink/Yellow/Blue are not general-purpose accent colors (don't use them anywhere else). Reserve the whole treatment for surfaces that are genuinely core to the product's promise.

### Inputs / Fields
- **Style:** Card background, `input-border` stroke, `rounded-md`, `shadow-sm` — deliberately given a visible fill and border after early feedback (in the light theme) that a fully transparent input wasn't legible enough; the same reasoning holds against a void ground.
- **Focus:** border shifts to Periwinkle, 3px `ring/50` glow.
- **Error:** border and ring shift to the destructive color; disabled state drops to 50% opacity.

### Navigation
- **Style:** the top nav is transparent — no background fill, no bottom border — so the fixed gradient mesh shows through behind it, and the icon-only logo chip disappears seamlessly into the void page background. This was a deliberate correction after an earlier version rendered it as an opaque white bar (light theme); the same transparency now doubles as what makes the logo blend in.
- **Content:** `logo-square.png` (the emblem only, no baked-in text) plus a real `Diaphane` text label in Periwinkle (`text-primary`) on the left, avatar + name in a dropdown on the right; dropdown items are plain off-white text on Card, no icons. The full lockup asset (`brand-logo.png`, emblem + wordmark baked into one image) was tried first but dropped — see the 2026-08-07 (logo) rebrand note below.
- **Mobile:** the user's name collapses to just the avatar below `sm`.

*Rebrand note (2026-08-07, logo):* the full-lockup PNG (emblem + wordmark baked in, on a solid black chip) was the first attempt at carrying the new logo into the nav, but at nav scale it read as a small, low-contrast black box rather than a legible wordmark, and its opaque chip meant it never truly blended into the page (no transparent-background export was available). Replaced with the square emblem-only mark plus a real CSS text label — crisp at any size, exactly reproduces the mark's own periwinkle wordmark color, and lets the icon (not a wordmark baked into a raster image) do the "blends into the void" work instead.

## Do's and Don'ts

### Do:
- **Do** keep Periwinkle (`#dae1ff`) as the only color for anything actionable — buttons, links, focus rings, active states.
- **Do** let the fixed background gradient mesh show through wherever a surface isn't explicitly a card (e.g. the top nav stays transparent) — it's also what lets the logo's black chip disappear into the page.
- **Do** use `shadow-sm` + hover lift as the only elevation vocabulary; don't add a second shadow scale, even though the Card/Void lightness step now carries more of the visual weight than the shadow does.
- **Do** give form inputs a visible fill and border — a fully transparent input was tried and rejected as illegible in the original light theme, and the same reasoning holds here.

### Don't:
- **Don't** reintroduce a light theme — the product is single-theme, dark-only, by deliberate decision (this reverses this same file's own prior "single light theme, no dark mode" commitment; see the 2026-08-07 dark Rebrand note above for why — `docs/PRODUCT.md` never locked in a theme choice at the product-truth level, only DESIGN.md did).
- **Don't** add a second *decorative brand* accent color (honey/ochre and raspberry were both tried and rejected in the original light system) — periwinkle is the one interactive color, nothing else gets promoted to it. This does not forbid Success (see Semantic / Status) — that's a status color, not a brand accent.
- **Don't** use Success (green) for anything actionable or emphasized — it means "live/active" only, never a button, link, or badge of importance.
- **Don't** apply the Signature Card treatment (iridescent glass, glow, progress ring, status dot) to an ordinary card — it's reserved for the handful of surfaces carrying the product's core differentiation.
- **Don't** use Iris Pink/Yellow/Blue for text, icons, or borders, or anywhere outside the Signature Card's decorative background blobs.
- **Don't** give the top nav a background fill or border — it was explicitly de-opaqued after user feedback, and it now does double duty letting the logo blend into the page.
- **Don't** carry the landing hero's `rounded-full` pill button into product UI — it's a scoped marketing exception, not the button standard.
- **Don't** set the wordmark text to anything but Periwinkle (`text-primary`) — it mirrors the exact color baked into the logo mark's own wordmark, keeping the two in sync.
- **Don't** reach for the full-lockup PNG (`brand-logo.png`, emblem + wordmark baked into one raster image) in the app — it was tried and dropped (see the 2026-08-07 logo rebrand note under Navigation) for reading as a low-contrast black box at nav scale, with no transparent-background export available to fix it. Use `logo-square.png` (emblem only) plus a real text label instead.
