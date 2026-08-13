# Plan: the roadmap section

**Branch**: `feat/roadmap-timeline` | **Date**: 2026-08-13 | **Spec**: [spec.md](spec.md)

## The shape of the change

A section gains a **kind**. Everything the kind changes is a branch inside machinery that already exists — the proposal, its one composition slot, the lease, the approval, the derivation, the atomic release. Nothing new is built around it.

```
documents → reference document → composition → (review) → derivation → release
                                      ↑                        ↑
                              branches on kind          branches on kind
```

## Decisions

**One handler, two contracts.** `SectionCompositionHandler` and `ClientDerivationHandler` each branch on the section's kind rather than being duplicated. The slot-claiming, lease, retry and terminal-failure logic is the part that took three fixes to get right (`5c4fbee`, `ff11818`, `c9ae01a`); a second handler would be a second copy of it.

**Milestones live in the JSON column the blocks already live in.** `SectionProposal.structuredContent` holds an array of blocks for prose and an array of milestones for a roadmap. The section's `kind` says which, so nothing has to be guessed from the shape. No new table.

**The public contract becomes a discriminated union on `kind`.** `PublicClientSection` is `{kind:"prose", blocks}` or `{kind:"roadmap", milestones, currentMilestoneId}`. Self-describing, because the client's renderer should not have to consult the section list to know what it is holding.

**Milestone ids are minted server-side and never asked of the model.** Composition returns ordered milestones with no ids; the server assigns uuids. Derivation is sent an ordered array and must return one of the same length; the server zips by index and keeps its own ids. This is the rule that `45a13ac` established after echoed identifiers killed three stages.

**The current milestone is a column on the section, not part of the content.** It changes without composing, approving or releasing anything (FR-007), so it cannot live inside a published release. Approving a proposal clears it when the id it names is gone.

**The editorial columns become nullable.** A roadmap has no tone. Storing a default one so the column can stay `NOT NULL` would be recording something nobody chose, and the derivation prompt would then read it.

## API

| Method | Route | Does |
|---|---|---|
| `POST` | `…/sections` | gains `kind`; a roadmap body carries a name only |
| `PATCH` | `…/sections/:id` | a roadmap accepts a rename and nothing else |
| `PUT` | `…/sections/:id/proposal/milestones` | replaces the milestone set of the pending proposal |
| `PUT` | `…/sections/:id/current-milestone` | moves where the project stands |

`PUT` for the milestone set, not `PATCH`: the whole ordered set travels, so the result is never a function of what the server already held — the same reason `POST …/order` carries every id.

## Prisma

```prisma
enum ClientSectionKind { prose roadmap }

model ClientSection {
  kind                 ClientSectionKind           @default(prose)
  instructions         String?                     // null on a roadmap
  length               EditorialLength?
  pedagogy             EditorialPedagogy?
  technicalFamiliarity ClientTechnicalFamiliarity?
  tone                 EditorialTone?
  currentMilestoneId   String?  @map("current_milestone_id") @db.Uuid
}
```

`currentMilestoneId` is a plain column, not a relation: milestones are JSON, so no foreign key can hold it. The service clears it when it names nothing.

## Slices

1. **The contract and the kind** — schemas, Prisma, create/update, the roadmap composition prompt and its branch, milestone editing, the current milestone, the derivation branch, the public union. API tests.
2. **The developer's roadmap** — the timeline component, the kind at creation, the roadmap tab, editing in place, the standard phases as ghost nodes.
3. **The client's roadmap** — the published timeline, on desktop and at 390px.

## Risks

**The prompt writes a plan the documents do not contain.** A roadmap is the shape a model most wants to invent. Guarded three ways: `nothing_matched` is a first-class outcome, "when" is copied as written rather than normalised, and the standard phases are offered to the developer instead of being handed to the model as a skeleton to fill.

**A derivation that returns a different number of milestones.** Rejected by count, which fails the operation rather than publishing a shorter roadmap.

## Noticed on the way, not in scope

`ClientDerivationHandler` checks open-point coverage against `block.type`, but composition writes `block.kind` — so `expectedOpen` is always empty and the check never fires. Real, pre-existing, and separate from this feature.
