---

description: "Task list for The Roadmap Section"
---

# Tasks: The Roadmap Section

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: Required. New code ships with tests that keep the 80% gate green, written as part of the same change.

## Format: `[ID] [P?] Description`

- **[P]**: can run in parallel — different files, no dependency on incomplete work

---

## Slice 1 — A section has a kind 🎯

**Goal**: the API can compose, hold, correct and publish a roadmap, and says which kind it is holding.

### The contract

- [x] T001 Add `SectionKindSchema`, `MilestoneSchema`, `MilestoneDraftSchema`, `ReplaceMilestonesRequestSchema` and `SetCurrentMilestoneRequestSchema` to `packages/schemas/src/documentation-sections.ts`; make `CreateSectionRequestSchema` a discriminated union on `kind`, and `SectionView` carry a nullable brief and register
- [x] T002 [P] Make `PublicClientSectionSchema` in `packages/schemas/src/client-release.ts` a discriminated union: prose blocks, or milestones plus `currentMilestoneId`
- [x] T003 [P] Cover both in their tests, including a roadmap refused for carrying a brief and a public milestone refused for carrying its origin

### The data

- [x] T004 Add `ClientSectionKind`, `ClientSection.kind` and `ClientSection.currentMilestoneId` to `apps/api/prisma/schema.prisma`; make the five editorial columns nullable; migrate

### Composing a roadmap

- [x] T005 Create `apps/api/src/documentation/composition/roadmap-output.schema.ts` (`roadmap-composition-v1`) and its spec
- [x] T006 Create `apps/api/src/documentation/sections/prompts/roadmap-composition.prompt.ts` — no brief, no register, no standard phases handed to the model
- [x] T007 Branch `SectionCompositionHandler` on the section's kind in both `buildRequest` and `apply`; mint a uuid per milestone server-side
- [x] T008 Carry `sectionKind` in `CompositionInput` and pick the prompt/contract version in `SectionProposalService.compose`

### Correcting one

- [x] T009 Add `SectionProposalService.replaceMilestones`: refuses a non-roadmap, refuses a composition still running, keeps the ids of milestones the developer kept and mints ids for the rest
- [x] T010 Add `ClientSectionService.setCurrentMilestone`: refuses an id the client could never see, accepts null, and composes nothing
- [x] T011 Clear the current milestone on approval when the id it names is gone
- [x] T012 Add both routes to `SectionsController` as `PUT`, with their DTOs

### Publishing one

- [x] T013 Add `roadmap-derivation-v1` to `client-derivation.prompt.ts` and branch `ClientDerivationHandler`; zip by index and refuse a different count
- [x] T014 Pick the derivation contract by kind in `ClientPublicationService.queueApprovedProposal`
- [x] T015 Emit the discriminated public section from `readCurrent`, reading `currentMilestoneId` live off the section

---

## Slice 2 — The developer's roadmap

**Goal**: the roadmap is the form. Typing in a milestone changes it, and the arc every project runs through is already on the rail.

- [x] T016 Create `apps/web/shared/components/ui/timeline.tsx` — a rail, four marker states, no new dependency
- [x] T017 [P] Create `apps/web/features/documentation/components/roadmap-phases.ts`
- [x] T018 Create `roadmap-editor.tsx`: edit in place, add, remove, reorder, and move the position from the marker itself
- [x] T018b The phases live inside "add a step", not on the rail, and there are six of them — ten ghost nodes read as a wall and as content the roadmap did not have
- [x] T019 Add `replaceMilestones`/`setCurrentMilestone` to `api.ts` and their hooks
- [x] T020 Branch `section-proposal-review.tsx` on the kind, with no "nothing matched" dead end
- [x] T021 Put the roadmap among the starting points in `section-editor-dialog.tsx`, in place of the prose "Planning et jalons", and drop the brief and the register when it is chosen
- [x] T022 Hide the brief line on a roadmap in `section-workspace.tsx`
- [x] T023 [P] Messages in both locales, and the dynamic phase keys declared in `scripts/check-i18n-orphans.mjs`

---

## Slice 3 — The client's roadmap

- [x] T024 Create `client-timeline.tsx` and branch `client-section-view.tsx` on the kind
- [x] T025 [P] Cover it: one node carries the accent, none does when no position is claimed, and a position naming nothing is survived
- [x] T026 Verify at 390px — no sideways scroll on any of the four surfaces

---

## Found on the way, fixed here

- [x] T027 `refetchInterval` read `document.visibilityState` during the server render and threw; guarded behind one `watching()` helper
- [x] T028 Derivation checked open-point coverage against `block.type` where composition writes `block.kind`, so the check never fired
- [x] T029 A milestone the developer has just added carries `id: null`, and so does "no position claimed" — every new step marked itself as current
- [x] T030 Nothing refused a second rubrique with the same name, nor a second roadmap. The screen no longer offers the frise when the project has one, and the API refuses both

---

## Not done, and why

- [ ] T031 **Editing a published roadmap.** It is read only once published, except the position. Adding a step means recomposing, which starts from the documents again. Closing this needs a proposal that was authored rather than composed — a change to what a proposal is, which is not settled here.
