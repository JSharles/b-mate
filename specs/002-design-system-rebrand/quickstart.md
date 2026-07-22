# Quickstart: Validating the Design System Rebrand

Manual/browser validation scenarios proving the feature works end-to-end,
one per user story in `spec.md`. This is a visual/structural feature, so
validation is primarily "look at the page," not curl calls.

## Prerequisites

- `apps/web` running locally (`pnpm --filter web dev`).
- `apps/api` running locally with Postgres up, and a signed-up test account
  with at least one project (see `docs/PRODUCT.md` / the invitations
  feature's quickstart for how to create one quickly).

## US1 — Consistent new visual identity everywhere

1. Open the marketing landing page logged out. Confirm: light-gray/white
   background gradient, near-black text, pale and emphasis lavender tones, Urbanist
   typeface.
2. Log in. Visit the home page, a project's detail page, and the profile
   page. Confirm the same palette and typeface on all of them.
3. Search the rendered pages for any remaining dark-theme styling (the old
   ink/rust colors) — none should appear anywhere, and there should be no
   way to toggle a dark mode.

## US2 — Horizontal navigation app-wide, dashboard-style home

1. Log in and land on the home page. Confirm: no sidebar; a horizontal
   navigation bar at the top; a welcome heading above the project list.
2. Navigate to a project's detail page, the new-project page, and the
   profile page. Confirm none of them show a sidebar, and all show the
   same horizontal navigation bar.
3. From the top navigation, confirm you can still reach: the project list
   (home), starting a new project, the user's profile, and logging out —
   every action previously reachable from the sidebar.

## US3 — Existing pages keep working, just restyled

1. Open a project's detail page. Confirm every existing action (invite a
   client, cancel/resend an invitation, view/remove members) is present
   and works exactly as before — only the colors and typeface changed.
2. Open the login and signup pages. Confirm the forms, validation, and
   submission behavior are unchanged.

## Automated regression check

Run the full existing suite to confirm no functional regression (SC-005):

```sh
pnpm --filter web test
```

Every existing test should still pass (updated only where a test asserted
something structurally tied to the sidebar, per the tasks that touch
`layout.test.tsx` / `app-sidebar.test.tsx` / `home/page.test.tsx`).

## Contrast spot-check (SC-004)

For each of: body text on the background, body text on a card, and each
accent color used as text/icon color, confirm a contrast ratio of at least
4.5:1 against its background (any standard contrast-checker tool, browser
devtools' accessibility panel, or the OKLCH/hex values directly).
