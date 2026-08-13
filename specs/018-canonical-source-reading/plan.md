# Implementation Plan: The Reference Document

**Branch**: `018-canonical-source-reading` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

## Summary

Three things get built, and one gets taken away.

The system writes **one reference document per project** from its canonical source, on a screen of its own, downloadable. Processing learns to **hold a document that does not concern the project** and ask instead of absorbing it. The questions it asks get written **in the developer's language**. And the hundred-row statement list leaves the working page.

Nothing about the canonical source changes underneath. The same statements, the same provenance, the same merging, the same attributable correction. This feature changes what the developer reads.

## The one rule that keeps this from becoming a second truth

**Nothing reads the reference document.** It is written from the canonical source and it ends there — composition still draws only on the canonical source (017, FR-009), publication still derives from an approved section proposal.

If the reference document ever became an input, the product would hold two accounts of the same project and would eventually publish from the wrong one. It is a reading, and readings are terminal.

## Technical Context

**Stack**: unchanged — NestJS 11 + Prisma 7 on `apps/api`, Next.js 16 + Tailwind v4 + TanStack Query + next-intl on `apps/web`, Zod in `packages/schemas`.

**New generation stages**: two. `reference_document` writes the document; `document_relevance` judges whether a document belongs.

**Scale**: the reference document is written from the whole canonical head — measured at 100 statements ≈ 3 500 tokens on the live project, the same order as section composition. No chunking.

## Constitution Check

| Principle | Assessment |
|---|---|
| **I. Test-first coverage** | No exemption. The invariants are testable: a held document contributes nothing, a gap is marked rather than filled, a question is written in the developer's locale. |
| **II. Type safety** | Contracts for the document, its parts and the relevance verdict go in `packages/schemas`. No `any` at the boundary. |
| **III. Feature isolation** | API work stays in the `documentation` module. Web work stays in `features/documentation`; nothing here is client-facing, so nothing moves to `shared/`. |
| **IV. Never resolve open product decisions** | Four questions were raised and answered in the spec's Clarifications. One remains open and is flagged below rather than decided. |
| **V. Security and privacy** | The reference document is contributor-only. It must never be reachable by a client, and the download inherits the same check as the screen — a file URL is not an authorisation. |
| **VI. Spec before multi-screen** | Followed. Spec signed off 2026-08-13. |

## Decisions

### Decision 1 — The reference document is its own generation stage

A new stage `reference_document` takes the canonical head and writes the document: named parts, continuous text, every block citing the statements it rests on.

**Why a stage rather than a view computed in code**: the requirement is a written document, not a rearrangement. Only a model can turn a hundred statements into something that reads top to bottom.

**Why not reuse section composition**: a section is a slice for a client under a chosen register. This is the whole project, factual, for the developer. Same machinery, different job — and merging them would mean one of the two compromises.

**What guards it against invention** (FR-003): every block cites the statement ids it rests on, and the ids are validated against what was sent — the same check `validateCompositionReferences` already performs for sections. A block citing nothing, or citing something we did not send, is refused. The model cannot introduce a sentence with no source and have it survive.

### Decision 2 — Relevance is judged by its own stage, not folded into an existing one

A new stage `document_relevance` runs between extraction and consolidation. Input: the document's observations, and the canonical statements already held. Output: `belongs` / `does_not_belong`, and one sentence saying why.

**Why not fold it into extraction**: extraction reads one document and knows nothing of the project. It has nothing to judge against.

**Why not fold it into consolidation**: consolidation already merges, supersedes, conflicts and raises clarifications. Adding a verdict to it is exactly the doubling-up that made extraction fail four ways in one session (017). One obligation per stage.

**Skipped for the first document** (FR-016): with nothing to compare against, the stage would be guessing. It is not run, and the document is incorporated.

**Guarding the false positive** (FR-017): the prompt is asked whether the document concerns *this project*, not whether it repeats what is already known. A new subject is expected; an unrelated client is not. This is the failure mode that would make the check worse than useless, so it gets its own test with a document on a genuinely new subject.

### Decision 3 — A held document is a document status, and the question is a clarification

`SourceDocumentStatus` gains `awaiting_relevance`. A document in that state has been extracted and is going no further.

The question raised is an ordinary `Clarification` — same table, same ranking, same answering path — carrying a reference to the document it concerns. Answering "it belongs" resumes consolidation; answering "it does not" removes the document through the removal path that already exists.

**Why reuse Clarification rather than a new kind of prompt**: the developer already has one place where the system asks them things. A second one would split their attention for a question that behaves identically.

### Decision 4 — The developer's language is remembered, not configured

`User` gains `locale`. The web already knows it on every request; `apiFetch` sends it, and the session guard writes it to the user row when it differs. The developer configures nothing (FR-023).

The consolidation prompt takes that locale and writes its questions in it.

**Why on the user and not the project**: the project already carries a language, and it means the client's. A developer with an English-speaking client would otherwise be asked in English.

**Existing questions keep their wording** (FR-019 of the spec): they were recorded in English and stay that way. Translating them on the fly would mean a call per display, and rewriting them in place would falsify a record the developer may have already answered against.

### Decision 5 — Downloading is the page, laid out for paper

No new route, no PDF library. The reference document screen carries print rules that drop the navigation and the actions, and a button that opens the browser's print dialog. The developer saves a PDF from there.

**What this costs**: the file is what the browser makes of the page. Good enough to read, send and keep.

**When to revisit**: the day something has to produce the file with no person present — an email attachment, an automated report. That needs a real generator, and it is not worth its weight before then.

## Implementation Sequence

**Slice 1 — the document exists.** `ReferenceDocument`, the `reference_document` stage, its screen, and the working page reshaped around a summary. This alone answers the complaint that started the feature.

**Slice 2 — the questions.** The clarification carousel, and the locale carried from the interface to the prompt.

**Slice 3 — the guard.** `document_relevance`, the `awaiting_relevance` status, and the answering path.

**Slice 4 — the download.** Print rules and the action.

Each slice ends with something usable. Slice 1 is the one that matters; slices 3 and 4 could be dropped without the feature failing.

## Risks

**The document may read no better than the list.** A model asked to turn a hundred disconnected statements into continuous prose can produce something as tedious as what it replaces, just in paragraphs. Nothing in this plan prevents that — it is the same open risk 017 recorded about composition, and the same answer applies: ship slice 1 early and read the real output before building further.

**Relevance is a judgement about intent, made on partial evidence.** A design brief for a new module and a contract for another client can look similar from the observations alone. The cost of a false positive is a developer answering a question they should not have been asked; the cost of a false negative is a wrong document absorbed. The second is worse, which is why the check exists — but it is why it holds the document and asks rather than deciding.

**The statement list is leaving a page some habit has formed around.** It has been the first thing on that page since 016.

## Resolved: the reference document has no approval gate

Answered by the developer on 2026-08-13: "pas nécessairement, si le document ne me plaît pas alors je ne crée pas de contenu client et je le remplace ou le corrige."

That is the better answer, and it is worth writing down why. The chain is:

1. Documents are added.
2. Statements are extracted into the canonical source.
3. **The reference document is written from them — for the developer.**
4. The developer creates sections, naming them and saying what they cover.
5. A proposal is composed for each section.
6. **The developer approves it, and their client reads it.**

The approval sits at step 6 because that is the moment something becomes visible to a client. The reference document sits at step 3 and is never client-facing, so a gate on it would guard nothing — and a bad one is self-correcting, because the developer simply does not build sections on it until they have fixed it.

Nothing here is validated by a client, and nothing is validated by the system. The developer approves; the client reads.
