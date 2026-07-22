---
name: b-mate
description: Track your project's progress with total transparency.
colors:
  ink: "#242424"
  white: "#ffffff"
  paper: "#f1eff7"
  soft-lavender: "#d0ccff"
  lavender-accent: "#ece9ff"
  muted-surface: "#efeef6"
  muted-ink: "#6b6874"
  border: "#e7e5f2"
  input-border: "#d6d1ec"
  violet-glow: "#6c5ce7"
  gradient-from: "#d9d0fb"
  gradient-via: "#eee9fa"
  gradient-to: "#f0eff2"
  destructive: "oklch(0.577 0.245 27.325)"
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
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 1rem"
  button-primary-hover:
    backgroundColor: "rgba(36, 36, 36, 0.9)"
    textColor: "{colors.white}"
  button-secondary:
    backgroundColor: "{colors.soft-lavender}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 1rem"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0.25rem 0.75rem"
---

# Design System: b-mate

## Overview

**Creative North Star: "The Glass Report"**

b-mate exists to make a client's project legible without dressing it up — the product principle is that nothing shown is ever generated or invented, only real, existing content, reworded plainly. The visual system follows the same discipline: quiet, high-contrast, and unornamented. Ink-dark text and interface elements sit on a pale, barely-there lavender field; nothing fights for attention, because the point is that the client can see through to what's actually happening, not be impressed by the interface doing it.

There is exactly one interactive color (near-black ink) and one atmospheric color (soft lavender). This was arrived at after explicitly rejecting louder alternatives: a dark ink/rust theme, a warm honey/ochre accent, and a raspberry accent were all tried and discarded as either "terne" (dull) or too loud for the tone the product needs. The system commits to restraint instead.

**Key Characteristics:**
- Single light theme, no dark mode — the calm, legible surface is the whole point, not a preference to toggle.
- One interactive color (ink), one atmospheric color (lavender) — never both fighting for emphasis.
- Flat surfaces with a fixed, non-scrolling gradient mesh behind everything, instead of box-shadow-driven depth.
- Urbanist throughout, leaning on weight contrast (400 body vs. 900 display) rather than multiple families.

## Colors

The palette reads as ink on paper: one dark neutral for everything actionable, one pale lavender wash for atmosphere, white for content surfaces.

### Primary
- **Ink** (`#242424`): the only color used for buttons, links, focus rings, active/primary text, and emphasis of any kind. Never diluted into a second "brand color" — see the One Voice Rule below.

### Secondary
- **Soft Lavender** (`#d0ccff` / accent tint `#ece9ff`): secondary buttons, selected/accent backgrounds, chips. Decorative and atmospheric, not a call-to-action color — it never carries the same weight as Ink.

### Neutral
- **Paper** (`#f1eff7`): base page background.
- **White** (`#ffffff`): card, popover, and input surfaces.
- **Muted Surface** (`#efeef6`) / **Muted Ink** (`#6b6874`): secondary backgrounds and de-emphasized text (badges, hints, timestamps).
- **Border** (`#e7e5f2`) / **Input Border** (`#d6d1ec`): hairline dividers and form-field strokes.

### Gradient Family (background only)
- **Violet Glow** (`#6c5ce7`): the radial "glow" pool in the fixed background mesh, mixed at low opacity — never used as a solid fill anywhere else.
- **Gradient From / Via / To** (`#d9d0fb` → `#eee9fa` → `#f0eff2`): the diagonal wash behind the whole app, from the top-left corner down to the neutral paper tone.

### Named Rules
**The One Voice Rule.** Ink is the only color allowed to mean "act on this" or "this is emphasized." Lavender is atmosphere and secondary surfaces only — it is never promoted to a button, a link, or a focus ring, no matter how tempting a second accent color looks.

**The No Second Accent Rule.** Honey/ochre and raspberry were both explicitly tried as a second accent color and rejected. Don't reintroduce a warm or saturated accent color to "liven up" the palette — the calm, near-monochrome ink-and-lavender system is the deliberate choice, not a placeholder waiting for a real accent.

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

Flat by default. Surfaces carry no shadow at rest; a single soft `shadow-sm` appears only on cards and inputs as a state marker, not as a layering system, and cards lift slightly (`-translate-y-0.5` + `hover:shadow-md`) on hover as the one motion-based depth cue. The real source of depth in this system isn't shadows at all — it's the fixed background gradient mesh sitting behind every page, which reads as atmosphere rather than elevation.

### Shadow Vocabulary
- **Resting surface** (`box-shadow: none`): default state for every surface.
- **Card / input** (`shadow-sm`): the one ambient shadow the system uses, present at rest on cards and form inputs.
- **Card hover** (`shadow-md` + `-translate-y-0.5`): the only elevation *change* in the system, reserved for interactive project cards.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow only ever appears as a fixed, low-intensity marker (cards, inputs) or as a direct response to hover — never as a multi-level elevation system.

## Shapes

Corners are gently rounded, never sharp and never pill-shaped by default: `0.625rem` (10px) is the base radius, scaled down to `0.375rem`/`0.5rem` for smaller controls and up to `0.875rem` for larger containers. The one exception is `rounded-full`, reserved for the landing page's hero CTA and for circular elements (avatars) — see the Pill CTA note in Do's and Don'ts.

## Components

### Buttons
- **Shape:** `rounded-md` (8px) for every in-app button, regardless of variant.
- **Primary:** Ink background, white text, `h-9 px-4` at default size — the only button variant that reads as "the main action."
- **Secondary:** Soft Lavender background, ink text — used for a supporting action next to a primary one, never alone as the main call-to-action.
- **Outline / Ghost:** transparent or paper background, ink text, border only on `outline` — used for low-emphasis or destructive-adjacent actions.
- **Hover / Focus:** primary darkens toward `rgba(36,36,36,0.9)`; every variant gets a 3px `ring/50` focus ring in Ink on keyboard focus.
- **Marketing exception:** the landing hero CTA is `rounded-full` (a pill), not `rounded-md` — a deliberate, scoped exception for the one marketing call-to-action, not a pattern to carry into the product UI.

### Cards
- **Corner Style:** `rounded-xl` (14px).
- **Background:** White on Paper — the card is always the brighter surface against the page.
- **Shadow Strategy:** `shadow-sm` at rest, `shadow-md` + slight lift on hover for interactive (clickable) cards only — see Elevation & Depth.
- **Internal Padding:** `py-6`, with `px-6` on header/content sub-sections.

### Inputs / Fields
- **Style:** White background, `input-border` stroke, `rounded-md`, `shadow-sm` — deliberately given a visible fill and border after early feedback that a fully transparent input wasn't legible enough.
- **Focus:** border shifts to Ink, 3px `ring/50` glow.
- **Error:** border and ring shift to the destructive color; disabled state drops to 50% opacity.

### Navigation
- **Style:** the top nav is transparent — no background fill, no bottom border — so the fixed gradient mesh shows through behind it. This was a deliberate correction after an earlier version rendered it as an opaque white bar.
- **Content:** logo + wordmark on the left, avatar + name in a dropdown on the right; dropdown items are plain ink text on white, no icons.
- **Mobile:** the user's name collapses to just the avatar below `sm`.

## Do's and Don'ts

### Do:
- **Do** keep Ink (`#242424`) as the only color for anything actionable — buttons, links, focus rings, active states.
- **Do** let the fixed background gradient mesh show through wherever a surface isn't explicitly a card (e.g. the top nav stays transparent).
- **Do** use `shadow-sm` + hover lift as the only elevation vocabulary; don't add a second shadow scale.
- **Do** give form inputs a visible white fill and border — a fully transparent input was tried and rejected as illegible.

### Don't:
- **Don't** reintroduce the dark ink/rust theme — the product is single-theme, light-only, by deliberate decision (see `docs/PRODUCT.md`).
- **Don't** add a second accent color (honey/ochre and raspberry were both tried and rejected) — lavender stays atmospheric, it does not get promoted to an action color.
- **Don't** give the top nav a background fill or border — it was explicitly de-opaqued after user feedback.
- **Don't** carry the landing hero's `rounded-full` pill button into product UI — it's a scoped marketing exception, not the button standard.
