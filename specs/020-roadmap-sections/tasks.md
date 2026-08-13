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
- [x] T024b Make the developer's published view the same component, so the preview cannot drift from the thing
- [x] T024c Horizontal, then back to vertical: it read well on a bare rail and broke as soon as a step carried sub-steps. Takes the full width now, with the date on the right edge of each row
- [x] T025 [P] Cover it: one node carries the accent, none does when no position is claimed, and a position naming nothing is survived
- [x] T026 Verify at 390px — no sideways scroll on any of the four surfaces

---

## Found on the way, fixed here

- [x] T027 `refetchInterval` read `document.visibilityState` during the server render and threw; guarded behind one `watching()` helper
- [x] T028 Derivation checked open-point coverage against `block.type` where composition writes `block.kind`, so the check never fired
- [x] T029 A milestone the developer has just added carries `id: null`, and so does "no position claimed" — every new step marked itself as current
- [x] T030 Nothing refused a second rubrique with the same name, nor a second roadmap. The screen no longer offers the frise when the project has one, and the API refuses both


---

## Slice 4 — Sub-steps ✅

**Goal**: "Développement" stops being one word for three months. The developer
names what sits inside a milestone, and where the project stands can point at
one of those.

**Independently testable**: a roadmap with a milestone carrying three sub-steps
publishes, the client reads them under their milestone, and marking the second
one current reads as "that phase, that step" without composing or approving
anything.

### The contract

- [x] T032 [P] [US4] Add `SubstepSchema` (id, nullable `when`, required title, nullable description, origin) and `substeps` on `MilestoneSchema` in `packages/schemas/src/documentation-sections.ts`; a substep carries no `substeps` of its own — the ceiling is the type, not a rule
- [x] T033 [P] [US4] Extend `MilestoneDraftSchema` with `substeps` drafts (nullable id) so the whole tree travels on `ReplaceMilestonesRequestSchema`
- [x] T034 [P] [US4] Add `substeps` to `PublicMilestoneSchema` in `packages/schemas/src/client-release.ts`, still without `origin`
- [x] T035 [P] [US4] Cover all three in `documentation-sections.test.ts` and `client-release.test.ts`: a substep with no date accepted, one with no title refused, a substep carrying substeps refused, and a public substep carrying its origin refused

### Composing them

- [x] T036 [US4] Add `substeps` to `RoadmapMilestoneOutputSchema` and to `ROADMAP_COMPOSITION_JSON_SCHEMA` in `apps/api/src/documentation/composition/roadmap-output.schema.ts`; bump the contract to `roadmap-composition-v2`
- [x] T037 [US4] Tell the model in `roadmap-composition.prompt.ts` to name what a phase contains only where the documents do, and never to invent an order; bump `ROADMAP_COMPOSITION_PROMPT_VERSION`
- [x] T038 [US4] Mint an id per substep in `SectionCompositionHandler.applyRoadmap`, alongside the milestone's — never asked of the model (45a13ac)
- [x] T039 [P] [US4] Cover both in `roadmap-output.schema.spec.ts` and `section-composition.handler.spec.ts`

### Correcting them

- [x] T040 [US4] Extend `SectionProposalService.replaceMilestones` to reconcile substeps: an id names one being kept, its absence mints a new one, and a substep read from the documents stays `document` when its wording is corrected
- [x] T041 [US4] Let `ClientSectionService.setCurrentMilestone` accept an id that names a substep — the known-id check walks both levels
- [x] T042 [US4] `dropCurrentMilestoneIfGone` must walk both levels too, or a deleted substep leaves the section pointing at nothing
- [x] T043 [P] [US4] Cover the three in `section-proposal.service.spec.ts` and `client-section.service.spec.ts`

### Publishing them

- [x] T044 [US4] Add `substeps` to `RoadmapDerivationOutputSchema` in `client-derivation.handler.ts`, bump to `roadmap-derivation-v2`, and extend the zip: same milestone count **and** the same substep count under each, or the operation fails
- [x] T045 [P] [US4] Cover the refusal in `client-derivation.handler.spec.ts`

### Reading them

- [x] T046 [US4] Render substeps under their milestone in `apps/web/shared/components/client-timeline.tsx`, quieter than the milestone and marked done/current/ahead from the position
- [x] T047 [US4] Derive "current by containment" in one place: the milestone holding the current substep reads as in progress
- [x] T048 [P] [US4] Cover both in `client-timeline.test.tsx`, including a position naming a substep

### Writing them

- [x] T049 [US4] Add substep editing to `roadmap-editor.tsx`: add, edit, remove and reorder under a milestone, with no way to nest further
- [x] T050 [US4] Make the substep marker a control too, so the position can be moved to one
- [x] T051 [P] [US4] Messages in both locales — "sous-étape", so the word never collides with the "étape" a milestone already is
- [x] T052 [P] [US4] Cover the editing in `roadmap-editor.test.tsx`

### Before it ships

- [x] T053 Verified end to end on the real project: a milestone with a sub-step, composed, corrected, published, ids kept at both levels
- [x] T056 Found doing it: `ReplaceMilestonesDto` had no `substeps`, and the validation pipe strips what it does not declare — the sub-steps never reached the service
- [x] T057 Found doing it: an empty roadmap could be approved, publishing a tab with nothing in it and no way to know why. Refused now, left out of the client's tabs, and no longer badged "Publiée"
- [x] T054 Verify at 390px — substeps must not push the rail sideways
- [x] T055 Run the gate: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:cov`, `pnpm knip`, `pnpm i18n:orphans`

### Dependencies

T032–T035 block everything else. T036–T039 and T040–T043 are independent of each
other once the contract lands. T044 depends on T036. T046–T048 depend on T034.
T049–T052 depend on T033 and T040.

### Not in this slice

Depth past two levels, dependencies between substeps, and a substep of its own
on the reference document. A substep is a name inside a phase, nothing more.

---

## Not done, and why


- [ ] T031 **Editing a published roadmap.** It is read only once published, except the position. Adding a step means recomposing, which starts from the documents again. Closing this needs a proposal that was authored rather than composed — a change to what a proposal is, which is not settled here.
