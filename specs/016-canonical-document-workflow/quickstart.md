# Quickstart Validation Guide: Canonical Document Workflow

This guide describes the runnable checks the implementation must support. It is not an implementation script and does not replace task-level tests.

## 1. Prerequisites

- Node/pnpm versions required by the root `package.json` (`pnpm` 11.15.0).
- Docker Desktop and the repository PostgreSQL service.
- `apps/api/.env` copied from the updated `.env.example`.
- R2 development bucket credentials for manual upload/removal checks.
- At least one permitted generation route. Automated suites use fake provider adapters and must not consume external tokens.

From the repository root:

```bash
pnpm install
docker compose up -d postgres
pnpm --filter api prisma:generate
```

The updated environment example must include:

- `GENERATION_POLICY_JSON` with a version and routes per generation stage;
- `ANTHROPIC_API_KEY` for an Anthropic route and the existing task-vulgarization module;
- optional `OPENAI_API_KEY` for an OpenAI route;
- existing R2, database, encryption, session, and web-origin values.

Use a one-route policy to validate single-provider operation. Use two providers with cross-provider fallback enabled only for the fallback scenarios.

## 2. Reset gate and staged schema transition

The legacy documentary domain must be empty and every uploaded original accounted for before the additive replacement migration runs. The exact script is delivered by the reset slice; expected commands are:

This section is an explicit local/manual validation against Docker PostgreSQL and an explicitly non-production R2 namespace. It is not invoked by Jest, Vitest, `pnpm test`, or CI; automated API tests continue to use `createPrismaMock()` and require neither PostgreSQL nor `DATABASE_URL`. It must not deploy, drain, reset, or mutate Railway/production; those operations require separate explicit approval and the operator runbook.

```bash
pnpm --filter api documentary:reset -- --dry-run --feature 016-canonical-document-workflow
pnpm --filter api documentary:reset -- --confirm 016-canonical-document-workflow
```

Expected results:

1. The preparatory migration creates exactly one `documentary-transition` row in `legacy` mode; deleting or hiding that row makes every legacy write/sweep and reset command fail closed.
2. Dry-run lists legacy documentary row/object counts and changes nothing; local services use the guard-aware build and the configured object namespace is demonstrably non-production.
3. Confirmation validates the approved inventory digest, atomically switches the transition to `resetting`, and rejects uploads, Notion additions, deletions, legacy review mutations, and scheduled sweep advancement.
4. A changed inventory aborts before deletion and requires a new dry-run/approval.
5. Confirmed run deletes each legacy R2 original idempotently and persists a per-item report, then transactionally purges legacy documentary rows in dependency order.
6. Any storage/database failure leaves the transition `resetting`, the run non-clean, prints a machine-readable failure entry, exits non-zero, and blocks both replacement and final-drop migrations.
7. Retrying treats an already-absent object as accounted for and resumes from recorded state.
8. `clean`/`canonical` is reached only with zero legacy rows and zero pending/failed manifest items.
9. A clean run leaves users, projects, memberships, invitations, board connections, Notion connections, and task data unchanged.

After the run is clean:

```bash
pnpm --filter api prisma:migrate
pnpm --filter api prisma:generate
```

At the additive-replacement checkpoint, verify the reset audit remains, every legacy documentary table is empty, the transition is `canonical`, the new tables/constraints exist, and neither old nor new services can read/write the legacy domain. The temporary legacy models/tables remain only so intermediate slices compile.

Locally simulate the post-cutover sequence by building the runtime-removal release while retaining the empty Prisma models/tables, then validate the separate final-drop migration against Docker PostgreSQL. Verify it refuses to run for non-`canonical` transition, non-clean reset, pending/failed manifest item, or non-empty legacy table. Re-run typecheck, coverage, build, and repository-wide residue searches after the local drop. The production runbook separately requires proof that the runtime-removal release is healthy and every previous Railway instance is drained before an operator may approve the production migration.

Production execution is deliberately not part of this quickstart or `speckit-implement`. The separately approved operator procedure must record the minimum compatible build at each checkpoint: all instances guard-aware before reset; roll-forward-only from `resetting`; only transition-aware builds after `canonical`; and only builds without legacy schema references after the final drop.

## 3. Static and automated verification

Run after every implementation slice:

```bash
pnpm --filter api typecheck
pnpm --filter web typecheck
pnpm lint
pnpm test
pnpm test:cov
pnpm build
```

Expected: strict type checks pass, both apps remain above the existing 80% statement/branch/function/line gates, and the production build succeeds. Do not lower thresholds.

Also validate `contracts/openapi.yaml` with the project’s chosen OpenAPI linter once added to tooling. Contract DTO tests must parse the same shared Zod schemas used by frontend responses and provider-independent generated output.

## 4. Canonical ingestion and provenance

Fixture corpus:

- document A: project launch is 1 October, budget is 10,000 €, authentication decision, unique constraint;
- document B: repeats the budget/authentication semantically, adds a unique planning fact;
- document C: explicitly moves launch to 15 October and contains one unresolved contradiction with A/B;
- at least one document in the other supported language;
- locators distributed across PDF pages, DOCX headings, an image region, and a Notion snapshot.

Procedure:

1. Add A and wait for incorporation.
2. Add B and C, including concurrent submission.
3. Read workspace, current source, revision history, and each item’s provenance.

Expected:

- upload response contains `received` document plus durable operation before AI completion;
- unique facts appear once; repeated facts have multiple supporting origins;
- the explicit newer launch date supersedes the old value while history retains both origins;
- source text is normalized into the selected working language while originals/snapshots remain unchanged;
- every current item has at least one valid supporting provenance link;
- only categories whose effective items changed advance target revision/generate drafts;
- no operation result can apply twice or against a stale source head.

## 5. Clarification behavior without silent guessing

Use a fixture that produces more than five material contradictions/ambiguities in one revision.

Expected:

- every material clarification is reachable through cursor pages and total count;
- ordering is by impact rank, with stable tie-breaking;
- evidence links identify the conflicting documents/locations;
- answering creates a contributor assertion and a new source revision;
- “leave open” records deliberate state without blocking factual acceptance;
- accepted factual/client blocks contain every open clarification ID and render the localized “point to clarify” marker;
- no model/provider output can silently select one side of unresolved evidence.

## 6. Factual review, correction routing, and catch-up

1. Keep a category draft pending.
2. Add another document affecting that category.
3. Test both accept and discard of the older draft.
4. Submit a real factual correction instruction.
5. Submit “make it shorter and more pedagogical” as a draft correction.

Expected:

- pending draft stays pinned and is not overwritten;
- category target revision advances;
- accept/discard closes the exact version using its concurrency token, then creates the newest catch-up draft;
- factual correction keeps supported facts and provenance coverage;
- editorial wording returns `EDITORIAL_INSTRUCTION_REQUIRED`, creates no factual draft, and links to profile settings;
- a failed regeneration has no draft content and cannot be accepted;
- a second contributor acting on stale draft/source state receives 409 and fresh state is refetched.

## 7. Editorial profile preview and atomic release

With at least two published categories:

1. change from detailed/technical to concise/highly explanatory;
2. generate preview;
3. cancel it and verify no state changes;
4. create again, confirm, and force one category derivation to finish later than the others;
5. repeat on a project with no validated content.

Expected:

- preview compares real currently published content with candidate content;
- candidate content preserves all required information/open-point IDs and follows deterministic length limits;
- cancel leaves confirmed profile and current release untouched;
- after confirmation, the old complete release remains client-visible at 0/4, 1/4, 2/4, and 3/4 readiness;
- only at 4/4 validated entries do profile revision/release semantics publish through one atomic pointer swap;
- all new release entries share one profile revision;
- no-content project saves the profile without fabricated preview text.

## 8. Editorial quality evaluation

Build a frozen evaluation corpus of at least 20 real or representative accepted factual references. It must cover French and English, every fixed documentation category, open-point markers, and materially different combinations of length, pedagogy, technical familiarity, tone, and optional guidance. Generate one preview per case using the route currently under evaluation.

For every run, record the date, provider/model route, policy snapshot, prompt/schema versions, source/reference identity, editorial profile, latency, usage, and validation outcome without copying secrets. Two reviewers who did not author the evaluated output score the subjective dimensions without seeing provider/model identity; disagreement is adjudicated by a third reviewer. Score each preview with this binary rubric:

- **Facts/open points**: pass only when deterministic ID/coverage checks retain every required fact and marker; any omission or unsupported addition is an automatic case failure.
- **Length**: pass only when the configured deterministic word/character band is met.
- **Pedagogy**: pass when concepts are explained with vocabulary, examples, and causal links appropriate to the requested level; fail for unexplained jargon, circular explanation, or oversimplification that changes meaning.
- **Technical familiarity**: pass when prerequisites and terminology match the selected assumed knowledge; fail when the text presumes unavailable expertise or patronizes an advanced target.
- **Tone/guidance**: pass when observable wording follows the selected tone and non-conflicting free guidance; fail for contradictory voice, unsupported certainty, or ignored guidance.

Expected:

- at least 18 of 20 previews pass every rubric dimension, satisfying SC-008's 90% threshold;
- 100% of passing previews preserve every required fact and open-point marker;
- failures remain failed evaluation records and never become accept-able or published content;
- results are written to `specs/016-canonical-document-workflow/validation/editorial-evaluation.md` with enough version information to reproduce the run;
- if no permitted provider route is available, record the evaluation as blocked rather than substituting fake-adapter output for the quality measurement; a blocked run or a result below 90% does not satisfy SC-008 and does not clear the release gate.

## 9. Provider retry, fallback, and policy controls

Use deterministic fake adapters to simulate:

- transient network/429/5xx;
- exhausted primary credit;
- retired/unavailable model;
- accepted remote batch whose polling is temporarily unavailable;
- invalid JSON, missing provenance, lost item IDs, lost open markers, wrong editorial constraints;
- late result from an abandoned attempt;
- cancellation before submission and after a remote job was accepted;
- all routes exhausted.

Expected:

- every real attempt is persisted with normalized status/error/usage and bounded schedule;
- SDK-level hidden retries are disabled;
- accepted remote jobs continue polling until terminal/expiry instead of immediately duplicating on fallback;
- fallback uses the identical immutable input revisions and validation contract;
- invalid “successful” output becomes `invalid_output`, never draft/published content;
- late/non-current output cannot apply;
- cancelled queued work is never sent, and a late result from cancelled/submitted work remains audit-only;
- all routes exhausted yields contributor-safe `needs_attention` while prior source/reference/release remains intact;
- a manual retry creates a replacement operation under current policy rather than mutating history.

Policy checks:

1. With one configured provider, verify no other adapter receives a call.
2. With fallback disabled, verify zero cross-provider sends.
3. Start an operation with fallback enabled, then disable it before the fallback attempt. The creation snapshot remains auditable, but the current deny gate prevents the new send and yields `needs_attention` if no allowed route remains.
4. A job already submitted before the change remains auditable/pollable because it cannot be unsent.

## 10. Document removal and restoration of supported truth

With A and B supporting one shared fact, A supporting one unique fact, and B explicitly superseding an older A value:

1. Request removal preview for B.
2. Confirm with exact document/source versions.
3. Simulate one R2 deletion failure, then retry.
4. Complete the recalculation and accept affected category drafts.

Expected:

- preview identifies affected categories and shared/sole-support counts;
- during `removal_pending` or storage failure, published content and current source do not falsely claim removal completed;
- after successful removal revision, shared fact remains with A provenance;
- B-only fact disappears;
- older A value may become current again if B was its only valid superseding support;
- unrelated categories never enter review;
- client sees old release until affected references/derivations are validated;
- removed original is no longer downloadable, while tombstone/revision history still explains prior origin.

## 11. Workspace live-state and accessibility verification

Run API and frontend locally on non-conflicting ports, sign in as contributor, and keep the project open through ingestion, clarification, review, retry, and publication.

For SC-006/SC-007, recruit at least 10 developers or freelancers who have never used Diaphane or seen this workflow. Use the same project data and task script for everyone, randomize the order of static workflow-state checks to reduce learning effects, and start the 10-second timer when each state becomes visible. A state check succeeds only when the participant correctly states document stage, next action, and current client visibility without prompting. The end-to-end task succeeds only without facilitator hints or corrective intervention.

Expected:

- one workspace query polls every five seconds only while active, then slows/stops per contract and refetches on focus;
- a server state change is visible within 15 seconds without manual refresh;
- transient refetch failure retains prior data and reports delayed updating;
- upload acknowledgement appears immediately in the cache;
- overview always states what is automatic, optional, required, and client-visible;
- mobile view uses a labelled selector and stacked comparisons rather than compressed tabs;
- status uses text/icon in addition to color; live announcements occur only on real changes;
- deletion and language changes require explanatory confirmation;
- source/provenance and all clarifications remain keyboard-accessible and paginated without a hidden cap.
- every participant completes every state-identification check within 10 seconds for SC-006;
- at least 9 of 10 participants complete document addition, clarification handling, factual validation, and client preview without assistance for SC-007.

## 12. Client isolation regression

As a client member and as a non-member, attempt all contributor documentation endpoints and inspect the existing category content endpoint.

Expected:

- contributor endpoints reveal no distinction between missing and unauthorized resources;
- client content contains only ordered non-empty category content from `currentClientReleaseId`;
- client payload/HTML/network data contains no source document, presigned URL, provenance, item/clarification IDs, drafts, pending release, operation status, provider/model, prompt, diagnostics, or generation errors;
- while preparation/failure occurs, the prior published release remains readable.

## 13. Cost/latency learning instrumentation

For every stage, verify operation/attempt records capture provider, model, transport, duration, token/cache usage, and optional price snapshot without exposing them to contributors. Compare:

- batch extraction/consolidation latency and token cost;
- synchronous factual correction/preview/derivation latency;
- validation rejection rate by route;
- retry/fallback frequency.

Performance gates:

1. With fake adapters and Prisma mocks, run the pure workspace aggregation/transformation over the fixed 100-document fixture and require p95 below 100 ms; this measures application work only, not database performance.
2. Against local Docker PostgreSQL with the representative 100-document dataset, perform 5 warm-up requests then 30 measured reads for both workspace aggregate and paginated canonical-source endpoints; require p95 below 750 ms for each and record environment/seed/query counts in `validation/quickstart-results.md`.
3. Assert extraction/consolidation/factual prompts contain only touched observations and impacted categories for the fixture. A complete-corpus prompt fails unless the operation explicitly documents why no narrower input is correct.

These measurements inform later route/pricing decisions; the feature itself must not introduce customer billing rules or promise a particular provider/model.
