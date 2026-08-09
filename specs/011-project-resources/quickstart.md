# Quickstart: Project Resources

Validates the feature end-to-end once implemented. Assumes `docker compose up -d postgres`, `apps/api` and `apps/web` running (`pnpm dev`), a logged-in developer account with a project, and a real Cloudflare R2 bucket + Notion integration reachable from local dev.

## Prerequisites

- **Cloudflare R2** (manual, one-time — not automated by this implementation, per plan.md Constitution Check): an account, a bucket, and API credentials (Account ID, Access Key ID, Secret Access Key). Add to `apps/api/.env`:
  ```
  R2_ACCOUNT_ID="..."
  R2_ACCESS_KEY_ID="..."
  R2_SECRET_ACCESS_KEY="..."
  R2_BUCKET_NAME="diaphane-resources"
  ```
- **`ANTHROPIC_API_KEY`**: already provisioned (specs/007). Reused for this feature's `DocumentVulgarizationClient`.
- **`RESOURCE_VULGARIZATION_MODEL`**: new env var, defaults to `claude-sonnet-5` if unset (research.md Decision 3) — set explicitly to override, e.g. to a Haiku tier, without a code change.
- **A Notion integration token** (for Scenario 4 only): create one at https://www.notion.so/my-integrations, share a test page with it, and note the page's URL.

## Scenario 1 — Upload a PDF, review, publish (US1 + US2, P1)

1. As a contributor on a project, open the "Resources" section (replacing the old "Documentation" tile) and add a resource by uploading a PDF that contains at least one page of prose and one diagram/schema.
2. Confirm a new resource appears immediately in a "processing" state — no client-visible effect yet.
3. Wait for processing to complete (batch turnaround — poll or re-check after a short wait). Confirm the resource moves to "ready for review," showing a plain-language rewrite that both covers the prose content *and* describes what the diagram shows.
4. As a client on the same project, confirm the Resources section does **not** show this resource yet (still in review).
5. Back as the developer, open the resource and publish it.
6. As the client again, confirm the resource now appears as a tile; open it and confirm the vulgarized content is readable.
7. Confirm the original PDF can be previewed in-browser and downloaded from the resource's detail page.

**Expected**: SC-001, SC-002, SC-005, SC-006 all hold for this run.

## Scenario 2 — Upload a Word document (US1)

1. Upload a `.docx` file with some prose (and, if available, an inline image) as a resource.
2. Confirm it processes to "ready for review" with a plain-language rewrite of the text content.
3. Confirm the original `.docx` offers download (no in-browser preview expected — browsers don't render Word documents; this is the documented FR-007 fallback path, not a bug).

## Scenario 3 — Processing failure surfaces clearly (Edge Cases, FR-011, SC-003)

1. Upload a file that will fail processing — e.g. a corrupted/empty PDF, or (if reachable in the test environment) simulate an Anthropic Batch API error.
2. Confirm the resource reaches a "failed" state with a clear message, not an indefinite "processing" spinner.
3. Confirm the only developer action available on it is delete — no publish option is offered.
4. Confirm a client never sees this resource under any circumstance.

## Scenario 4 — Connect a Notion page (US4, P2)

1. As a contributor, add a resource by connecting a Notion page: paste the integration token and the page URL.
2. Confirm a new resource appears in "processing" state, then "ready for review" with a plain-language rewrite of the page's text content.
3. Publish it; confirm a client can see it, and that its "original" access point is a link back to the Notion page (no file preview/download — this resource has no uploaded file, per spec.md Assumptions).
4. Repeat with a deliberately invalid token or an inaccessible page — confirm a clear error at connection time and no resource created (no lingering "processing" resource that will only fail later).

## Scenario 5 — Delete a resource (FR-014)

1. As a developer, delete a resource in each state you can reach (processing, ready for review, published, failed) — confirm each is removed entirely and, for a previously-published one, immediately disappears from the client's view too.

## Scenario 6 — Access control (FR-009, FR-010, SC-005)

1. As a client-role member, attempt to reach a non-published resource's detail page directly (a guessed/stale URL). Confirm a "not found" response — identical in shape to a resource that never existed (no distinguishing "exists but not published" from "doesn't exist").
2. As a client-role member, attempt to call the add-resource/publish/delete actions directly (bypassing the UI). Confirm each is rejected the same way board-connection actions already are for a client role (specs/005 FR-009) — not found, not a distinct "forbidden."
