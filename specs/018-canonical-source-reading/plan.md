# Implementation Plan: The Reference Document

**Branch**: `018-canonical-source-reading` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

## Summary

One generation stage replaces four. Twelve tables become three. The reference document becomes the only place the developer reads, answers and corrects.

Documents and notes go to the model in one request; it returns the document and the points it could not settle. Answering a point and correcting a paragraph both record a note, and every note is replayed on every write.

## The shape

```
documents ─┐
           ├─► one call ─► reference document + open points
notes ─────┘                        │
                                    └─► sections written for the client
```

Every write reads the documents and the notes. Never the previous document.

## Technical Context

**Stack**: unchanged.

**Kept from the old pipeline**: `DocumentInputNormalizerService`. It already turns an upload or a Notion page into parts a model can read — text chunks, images, PDF. That work is real and independent of what we then ask for. What goes is the prompt that split those parts into facts.

**Size**: measured on the live project, two documents ≈ 20 000 words ≈ 27 000 tokens, plus notes. One call, no chunking, roughly ten times the headroom before it stops being comfortable.

## Constitution Check

| Principle | Assessment |
|---|---|
| **I. Test-first coverage** | No exemption. The invariants are testable: a note is replayed, a point answered once is not asked again, an unrelated document is raised rather than woven in. |
| **II. Type safety** | The document, its parts and its points go in `packages/schemas`. No `any` at the boundary. |
| **III. Feature isolation** | API stays in `documentation`. Web stays in `features/documentation`. |
| **IV. Never resolve open product decisions** | The method, the single surface, and dropping the carousel were all decided by the developer on 2026-08-13. None left open. |
| **V. Security and privacy** | The reference document is contributor-only, and the download inherits the screen's check — a file URL is not an authorisation. |
| **VI. Spec before multi-screen** | Followed. |

## Decisions

### Decision 1 — One stage, and it returns both

`reference_document` takes the documents' normalized parts and the project's notes. It returns the document **and** the points it could not settle, in one answer.

**Why not a second stage for the points**: they are the same judgement. A model deciding what it cannot state is deciding, in the same breath, what it can. Splitting that in two means paying twice and reconciling two opinions.

**What guards against invention**: the prompt forbids inference and the output carries, per part, which documents it drew on — checked against the documents actually sent. There is no per-sentence citation to verify because there are no per-sentence facts; the honest guarantee is coarser and stated as such in the spec.

**No identifier is ever echoed.** Documents are referenced as `d0`, `d1` — the lesson written in `reference-token.ts`, which this feature has already broken once.

### Decision 2 — A note is one row

```
Note: id, projectId, content, authorUserId, createdAt, archivedAt
```

That is all. No kind, no target, no revision. An answer and a correction are the same thing (spec, FR-012), and the paragraph that prompted a correction will not exist after the next write, so pointing at it would be pointing at nothing.

**Ordering**: notes are replayed oldest first, and a later note may contradict an earlier one — the spec says that becomes a point rather than being resolved by order (FR-015).

### Decision 3 — Relevance is judged in the same call

No separate stage. The request already carries every document; asking which of them does not belong costs nothing extra and cannot disagree with the document that was written from them.

Skipped when the project has one document (FR-018): there is nothing to compare it against.

### Decision 4 — Sections read the reference document

`section_composition` currently draws on the canonical source. With the fact base gone, the reference document is the truth, and sections draw on it.

This reverses the rule the previous draft carried ("nothing reads the reference document"), and correctly: that rule existed to stop two accounts of the truth existing side by side. With one account, reading it is the only sensible thing to do.

**A section cannot be composed before a reference document exists.** That is a real ordering constraint and the screen must say so rather than fail.

### Decision 5 — What gets deleted

| Removed | Why |
|---|---|
| `document_extraction`, `source_consolidation` stages | replaced by the one call |
| `DocumentObservation` | facts, gone |
| `InformationItem`, `SourceRevision`, `SourceRevisionItem`, `SourceRevisionChange` | the fact base and its history |
| `ProvenanceLink` | per-sentence provenance, replaced by per-part document names |
| `Clarification`, `ClarificationItem`, `ClarificationEvidence`, `ClarificationResolution` | points now live on the document |
| `ContributorAssertion` | replaced by `Note` |
| `ProjectSource` | it existed to own the revisions |
| the clarifications panel and its carousel | one surface (FR-016c) |

`SourceDocument` keeps its lifecycle — received, extracting, incorporated, removed — because a document still has to be fetched, normalized and stored. What changes is what happens after.

## Implementation Sequence

**Slice 1 — the new path, beside the old.** `Note`, the reshaped `reference_document` stage reading documents and notes, and the document screen answering and correcting in place. Nothing is deleted yet, so this can be abandoned.

**Slice 2 — the switch.** Sections read the reference document. The working page keeps a count and a way in.

**Slice 3 — the removal.** Everything in Decision 5, verified by `pnpm knip`, `pnpm i18n:orphans` and a schema pass for models with no reader.

Slice 3 is deliberately last here, unlike 017: this time the replacement is not a rearrangement of the same data but a different way of producing it, and it should be seen working on the real project before the old path is gone.

## Risks

**One call has to do what four did.** Structure, clean, spot contradictions, judge relevance and write in the developer's language. If quality drops against what the four-stage pipeline produced, the answer is a better prompt, not another stage — but that has to be looked at on the real project before slice 3 deletes the alternative.

**Notes accumulate.** Fifty notes replayed on every write is fine; five hundred is a second corpus nobody curates. Nothing here addresses that, and it is recorded so it is not discovered as a surprise.

**Losing per-sentence provenance is irreversible in practice.** Once `ProvenanceLink` is gone and the documents have been re-read, the mapping is not coming back. This is the one deletion worth being sure about — and the developer has been.
