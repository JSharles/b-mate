# Phase 1 Data Model: Design System Rebrand

No new or modified data entities. This feature is a purely visual and
structural front-end change — colors, typography, and the signed-in app's
navigation shell — with no Prisma schema changes and no new or changed API
request/response shapes. `packages/schemas` and `apps/api` are untouched.

The only "entity" worth naming is not data but a design token set, already
fully specified in spec.md (FR-001) and research.md §2/§5:

| Token | Value |
|---|---|
| Background | Diagonal gradient, pale lavender → light gray |
| Card | White |
| Text (ink) | Near-black (not pure black) |
| Accent — pale | Lavender (secondary/soft elements) |
| Accent — emphasis | A more saturated lavender (primary actions) |
| Typeface | Urbanist |

Exact hex values are a Phase 2 (`/speckit-tasks`) / implementation detail,
not a spec-level decision — this document exists to satisfy the plan
template's Phase 1 output requirement, not because there's a relational
model to describe.
