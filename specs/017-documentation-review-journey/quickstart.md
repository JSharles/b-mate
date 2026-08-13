# Quickstart: Author-Defined Client Sections

**Date**: 2026-08-12 · **Spec**: [spec.md](./spec.md)

How to prove this feature works, end to end, against a real project. Each scenario
maps to a user story and can be run once that story is implemented, without waiting
for the others.

## Prerequisites

```bash
docker compose up -d postgres
pnpm --filter api prisma:migrate
pnpm dev
```

`apps/api/.env` needs `GENERATION_POLICY_JSON`, `ANTHROPIC_API_KEY` and the R2
credentials. A missing generation policy stops the API at boot with a clear message —
that is deliberate, and it is the first thing to check when nothing processes.

Run everything below as a contributor on a project that already holds at least one
processed document. Scenario 1 checks the empty case first.

---

## Scenario 1 — Compose and publish a section (US1)

1. Open a project whose documents have been processed and which holds no sections.
   The composition area says so and offers to create one.
2. Create a section. The form offers a few starting points with worked descriptions,
   plus a free title. Pick one, then edit its name and description — both must stay
   editable — or write your own from scratch.
3. The section appears as being prepared. Within a couple of minutes it holds a
   proposal.
4. Open it. The proposed content is there; any question composition could not resolve
   is listed separately, not mixed into the text.
5. Approve. Open the project as the client and read the section.

**Passes when**: the client reads a section whose heading the contributor wrote, whose
content came from their documents, and which the contributor approved.

**Also check**: a section created from a suggestion is indistinguishable from one typed
blank — nothing recorded on it says where it came from (FR-004b).

**Also check**: create a section whose instructions match nothing in the documents.
The proposal must say so plainly rather than inventing or padding (FR-011).

---

## Scenario 2 — Correct on facts, and on relevance (US2)

1. On a composed proposal, find a statement that is wrong and correct its truth.
2. On the same proposal, find a statement that is true but does not belong here and
   exclude it, giving a reason.
3. Trigger a refresh of this section. The corrected fact appears in its corrected
   form; the excluded statement does not come back.
4. Create a second section whose instructions would legitimately pull in the excluded
   statement. Compose it.

**Passes when**: the factual correction shows up in the second section too, and the
exclusion does not — the fact is available there, because relevance was judged for one
section only (FR-014, FR-015).

**Also check**: the interface makes clear, before the contributor acts, which of the
two they are doing and how far it reaches (FR-017). Ask someone who has not seen the
page to say what each button will do.

---

## Scenario 3 — Stay current as documents arrive (US3)

1. With at least one published section, add a second document and wait for processing.
2. The sections are marked as needing a refresh. Open the project as the client: the
   content is exactly what was approved before.
3. Trigger a refresh on one section only. Review and approve it.
4. Open as the client again: that section is updated, the others still read as
   approved.
5. Leave the remaining marks alone. Nothing changes on its own, however long you wait.

**Passes when**: nothing the client reads ever changed without an approval, and the
untouched sections stayed exactly as they were (FR-018, FR-021, SC-005).

**Also check**: remove a document that fed a published section. The section is marked
for refresh; its next proposal reflects the removal.

---

## Scenario 4 — Manage the set (US4)

1. Create three sections, then reorder them. The client reads them in that order.
2. Rename one. The client sees the new heading.
3. Revise one's instructions. It is marked for refresh — it does not recompose on its
   own (FR-020).
4. Delete one. It disappears from the client's view; the others stay published.
5. Delete a section while its composition is running. Nothing is left running behind
   it.

---

## What to watch while running these

**One published set, always complete.** During any approval or refresh, the client
must never read a mixture of approved and unapproved sections. This is the invariant
that broke on 2026-08-12 under concurrent approvals — four categories approved seconds
apart left two live releases covering half the categories between them. Approve two
sections in quick succession and confirm exactly one published set survives, holding
both.

**Nothing stranded.** Every stage of this pipeline has, at some point, known how to
fail but not how to notice it had been abandoned. After each scenario, confirm no
section sits composing with no work behind it, and no alarm names a failure that has
since succeeded.

**Nothing left behind.** After implementation:

```bash
pnpm test:cov      # 80% gate, both apps
pnpm lint
pnpm knip          # unreferenced symbols
pnpm i18n:orphans  # translated strings with no call site
pnpm design:check
```

FR-024 is not satisfied by these alone: check by hand that no Prisma model remains
without a reader in `apps/api/src`, which is how four dead models from features 013
and 014 survived into this one.
