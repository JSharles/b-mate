---
target: landing page (app/[locale]/(public)/page.tsx)
total_score: 22
max_score: 28
na_heuristics: 5,7,9
p0_count: 2
p1_count: 1
timestamp: 2026-07-22T17-45-16Z
slug: app-locale-public-page-tsx
---
Method: dual-agent (A: a1427a5363840ec59 · B: af60a8e8072b8cd76)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Coming soon" badges are the only status signal beyond the FAQ chevron rotation — easy to miss. |
| 2 | Match System / Real World | 4 | "Black box," "re-explaining," "read-only" map directly to real developer pain; no invented jargon. |
| 3 | User Control and Freedom | 3 | Logo (`nav-bar.tsx`) isn't a link — no "go home" affordance. |
| 4 | Consistency and Standards | 2 | Same pill-CTA/icon patterns render inconsistently: closing CTA loses its fill, 4/9 benefit-card icons vanish. |
| 5 | Error Prevention | n/a | No forms or destructive actions on this static marketing page. |
| 6 | Recognition Rather Than Recall | 4 | Section eyebrows + persistent nav anchors mean nothing needs to be remembered. |
| 7 | Flexibility and Efficiency | n/a | Persuade-mode surface; no power-user path expected. |
| 8 | Aesthetic and Minimalist Design | 3 | One Voice Rule holds (no rogue second accent), undercut by "coming soon" clutter and the broken elements below. |
| 9 | Error Recovery | n/a | No user-facing error states on this page. |
| 10 | Help and Documentation | 3 | FAQ honestly answers the security/pricing questions a wary buyer would ask. |
| **Total** | | **22/28** | **Good (79%)** |

## Design Specificity Verdict

**LLM assessment**: Specific in content, generic in composition. The copy is genuinely bespoke — the dev-board → plain-language demo with real ticket names, the honest "launch phase, no pricing yet" FAQ answer — all trace directly to b-mate's actual MVP and its "never fabricate" principle. But the visual chassis (eyebrow + 900-weight display headline + centered subhead + pill CTA hero, alternating light/dark bento benefit cards, accordion FAQ, dark closing band) is a highly recognizable contemporary SaaS-template pattern that could be reskinned for almost any dev-tool landing page unchanged.

**Deterministic scan**: `detect.mjs` ran clean (exit 2, findings present — expected) against `features/landing/components` + the page route: 2 `design-system-font-size` findings, both `text-[10px]` on uppercase badge/tag spans (`ai-preview.tsx:63`, `benefit-card.tsx:29`) — a size step not in `DESIGN.md`'s documented type ramp (smallest documented is 0.875rem/label). Neither reads as a false positive; they're genuine off-ramp sizes, not one of DESIGN.md's called-out exceptions (flat shadows, transparent nav). The live-injected browser detector additionally caught: uppercase body-text styling on the hero eyebrow, ~103–130 char/line paragraphs (aim <80) in two spots, a card-inside-card nesting in the AI-preview client-view panel, and a `transition: height` on `body`. These are all things Assessment A's holistic read didn't flag — useful, complementary signal.

**Visual overlays**: mutation and live-server injection both worked; overlays were rendered and read via console, then the live-server was stopped cleanly (confirmed via `kill -0`). No user-visible overlay persists in your browser now — this was a one-shot console read, not a standing annotation.

## Overall Impression

The page's content and restraint are genuinely on-brand — it doesn't cheat with a fake accent color or invented proof. But three real rendering bugs (two of them exact hex-value collisions between foreground and background classes) undercut it at exactly the moments that matter most: the primary conversion button, a third of the benefit-card icons, and the one tag in the flagship demo that's supposed to look "urgent." None of these needed a design opinion to catch — they're `#242424`-on-`#242424` bugs, verified directly in source.

## What's Working

- **Hero restraint**: single CTA, single accent color, an emotionally specific opening line ("What clients can't see, they always imagine worse") — the One Voice Rule holding under real pressure.
- **AiPreview as literal demo** (`ai-preview.tsx`): shows the actual before/after translation mechanism instead of illustrating it abstractly — rare, real specificity for a landing page.
- **Honest FAQ**: no fabricated stats or logos, consistent with `docs/PRODUCT.md`'s "Evidence on Hand" constraint (pre-launch, nothing to fake).

## Priority Issues

**[P0] Benefit-card icons are invisible on 4 of 9 cards**
**Why it matters**: `benefit-card.tsx:25` always applies `text-primary` to the icon regardless of `tone`. On `tone="ink"` cards the container is `bg-foreground` (line 21) — and `--primary` and `--foreground` are both `#242424` (`app/globals.css:17,22`). The icon's fill color exactly matches its own background: not low-contrast, literally invisible. Confirmed on "Decisions explained simply," "Stop re-explaining," "A client who sees, a client who stays," and "All the technical docs, translated."
**Fix**: `className={cn("size-6", tone === "ink" ? "text-background" : "text-primary")}`.
**Suggested command**: `/impeccable harden`

**[P0] Closing-band CTA renders as floating text, not a button**
**Why it matters**: `closing-band.tsx:8` the section is `bg-primary`; the CTA link (line 15) is `bg-foreground` — again both `#242424`. The button's fill is indistinguishable from the section behind it, so at the single highest-stakes conversion moment on the page, the "Create a project" CTA loses its pill-button affordance entirely (text is still legible via `text-background`, but there's no visible button shape).
**Fix**: give the button a genuinely contrasting fill — e.g. `bg-background text-foreground` (paper-on-ink) instead of `bg-foreground` on an already-ink section.
**Suggested command**: `/impeccable harden`

**[P1] AI-preview "bug" tag is illegible against its own siblings**
**Why it matters**: `ai-preview.tsx:26` the `bug` tag style is `bg-primary/20 text-primary` (dark ink at 20% opacity, dark ink text) sitting on a `bg-neutral-800` list item inside a `bg-neutral-900` panel — dark-on-dark. Its siblings `chore`/`feature` use light `neutral-100` tones and read fine. "Fix websocket race condition" effectively has no visible tag while "Add Redis cache" does — ironic given this component's whole job is demonstrating legibility.
**Fix**: give `bug` a light-on-dark treatment consistent with `chore`/`feature`, e.g. `bg-primary/20 text-background` or a dedicated warm-neutral tag color.
**Suggested command**: `/impeccable harden`

**[P2] Features section is majority vaporware, same visual weight as shipped content**
**Why it matters**: 3 of 4 feature blocks are tagged "Coming soon" — the entire AiPreview showcase and features cards 2 & 3 (`features-section.tsx`) — while only "Read-only access" is real MVP scope per `docs/PRODUCT.md`. All render at equal visual weight right after the demo delights the visitor, risking a bait-and-switch feel.
**Fix**: visually subordinate "coming soon" content (smaller card, muted treatment, or a separate "what's next" strip) instead of matching it 1:1 with shipped features.
**Suggested command**: `/impeccable clarify`

**[P3] Two cognitive-load ceiling breaches, plus a handful of detail-level findings**
**Why it matters**: FAQ (`faq-section.tsx`) stacks 5 accordion items instead of ≤4; the desktop nav (`nav-bar.tsx`) exposes 6 simultaneous choices (4 anchors + Log in + Sign up) with no visual weighting toward Sign up. Additionally (detector-caught): two `text-[10px]` badge sizes fall outside DESIGN.md's documented type ramp, the hero eyebrow uses full uppercase body-text styling rather than a short label, two paragraph blocks run 103–130 chars/line (aim <80), and the AI-preview's client-view panel nests a card inside a card.
**Fix**: group FAQ into two labeled clusters or trim to 4; de-emphasize nav anchors relative to Sign up; fold the badge sizes into the documented type ramp (or add a `caption` role to DESIGN.md if the size is intentional); tighten paragraph measure.
**Suggested command**: `/impeccable quieter`

## Persona Red Flags

**Jordan (confused first-timer, evaluating dev)**: sees the AI-translation demo, gets excited, then discovers 2 of 3 adjacent feature cards plus the whole demo block are "Coming soon" — may read the page as further along than it is, then feel misled once the FAQ later clarifies pricing isn't even set yet.

**Riley (stress tester)**: immediately finds the closing-band CTA has no visible button fill, and that 4 benefit-card icons across the page simply don't render — plus the "bug" tag in the AI-preview demo is illegible next to its visible siblings.

**Casey (distracted mobile user)**: on mobile the entire anchor nav (`nav-bar.tsx`, `hidden ... sm:flex`) disappears with no replacement (no hamburger menu) — no way to jump to FAQ or Features, only linear scroll; and if they scroll all the way to the bottom, the one thing waiting for them is a CTA with no visible button shape.

## Minor Observations

- Logo (`nav-bar.tsx:10-13`) isn't wrapped in a `Link` — clicking it does nothing.
- Hero eyebrow is a full sentence/claim rather than a short label, stretching DESIGN.md's Eyebrow Rule further than the page's other eyebrows do.
- `muted-foreground` (`#6b6874`) body copy on `paper` (`#f1eff7`) reads a bit soft in screenshots — worth a contrast check, not confirmed broken.
- Mobile viewport (~390px) couldn't be captured directly in this session (a browser-automation tool limitation, not a page issue) — worth a manual phone check before shipping fixes.

## Questions to Consider

- What if the closing band flipped the metaphor — light "paper" background with the one ink button — so the page's rhythm ends on the calm surface it's been building toward, instead of a dark band that accidentally swallows its own CTA?
- What if "Coming soon" features were cut from the public landing page entirely until they ship — applying the product's own "never fabricate" principle to the marketing page itself, not just in-app content?
- What if the AI-preview demo became interactive (hover a ticket, watch its translation highlight) instead of static — making the one moment that best explains the differentiator impossible to scroll past unnoticed?
