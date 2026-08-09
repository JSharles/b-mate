# Quickstart: AI Resource Categorization

Validates the feature end-to-end once implemented. Assumes the usual local dev setup (`docker compose up -d postgres`, `apps/api/.env` configured with a real `ANTHROPIC_API_KEY`, `pnpm dev` running both apps).

## Prerequisites

- A project with at least one contributor account logged in, and one client account invited to the same project (for the client-view check in step 5).
- A test document (PDF or `.docx`) whose content plausibly spans more than one type of information — e.g. a short doc that both describes a system's architecture *and* includes a couple of open decisions/action items — to exercise the multi-category path (User Story 1, Acceptance Scenario 2).

## Steps

1. **Add the resource.** As the contributor, upload the test document to the project (existing `AddResourceDialog` flow, unchanged). Confirm it appears with `status: processing`.

2. **Wait for the sweep.** `ResourceBatchSweepService` polls every 5 minutes (`@Cron(CronExpression.EVERY_5_MINUTES)`) — or trigger it manually in a local shell if a manual-invoke path exists for testing. Confirm the resource moves to `ready_for_review` and its vulgarized content is present, unchanged from today's behavior.

3. **Check proposed categories (contributor view).** On the resource's review UI, confirm one or more proposed categories are shown (e.g. "Architecture," "Technical decisions"), each with its own approve/reject control. Reject one and approve another; confirm the one you rejected disappears from further consideration while the approved one remains, and that the resource's own content is still independently publishable regardless.

4. **Publish the resource.** Use the existing `publish()` action. Confirm publishing succeeds and is unaffected by the pending/rejected category from step 3 (FR-004 — decoupled from `publish()`).

5. **Check the client view.** As the client, open the project's Resources area. Confirm:
   - The layout is now tabs, not a flat list (a single approved category is already enough — FR-009).
   - The published resource appears under the tab matching its *approved* category only (not the rejected one).
   - The rejected/unapproved category never appears as a tab or anywhere in the client's view (FR-002).

6. **Check reuse.** Add a second resource whose content overlaps in type with the first (e.g. another architecture-flavored document). Once processed, confirm its proposed category reuses the *same* approved category from step 3 rather than proposing a new, near-duplicate one (research.md Decision 2) — verified by the category's `key` matching, and by the client tab gaining a second resource rather than a new tab appearing once this one is also approved.

7. **Check the developer view stays flat.** Confirm the contributor's own Resources view still shows every resource as a flat list (unchanged from today), regardless of how many resources/categories now exist (FR-006) — categorized tabs are a client-only presentation change.

## Expected outcome

A contributor can categorize resources with no separate manual step beyond today's existing review flow (SC-001); a client can navigate resources by type of information via tabs (SC-002); no unapproved category is ever client-visible (SC-003); an uncategorized-but-published resource remains visible to the client (SC-004); repeated, related resources converge on shared categories rather than fragmenting into near-duplicates (SC-005).
