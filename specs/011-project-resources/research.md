# Research: Project Resources

## Decision 1: AI processing is whole-document, vision-based — not text-extraction-only

**Decision**: PDF and image (PNG/JPEG) resources are sent to Claude as native document/image content blocks, not pre-extracted to plain text first. Claude's Messages API reads a PDF's text *and* renders its pages as images in the same call, so diagrams/schemas are described in the vulgarized output instead of being invisible to a text-only pipeline.

**Rationale**: User's explicit requirement (spec.md FR-003, FR-016, SC-006) — a document that's mostly a diagram must still produce a meaningful plain-language description, not a failed/empty result. Native document support means no separate OCR/extraction step, no extra library, no extra failure mode for that step.

**Alternatives considered**: Text-only extraction (a PDF-text library) with diagrams simply undescribed — rejected per the user's explicit requirement. A separate OCR/vision pass merged with extracted text — rejected as needless complexity when Claude already does this natively in one call.

## Decision 2: Word (.docx) gets text (+ inline image) extraction, not full page-vision rendering — a disclosed asymmetry

**Decision**: `.docx` files are processed differently from PDF/images: text and any embedded images are extracted client-side (a JS library, e.g. `mammoth`) and sent to Claude as text (plus any extractable embedded images as separate image blocks where feasible), rather than rendered page-by-page like a PDF.

**Rationale**: Claude's native document vision support is specifically for PDF (and standalone images) — there is no equivalent "render a .docx page as an image" capability, and converting .docx → PDF server-side would require a native binary (LibreOffice headless) with no first-class Nixpacks/Railway support, a real deployment burden for one file format. A pure-JS extraction library has no such dependency and deploys exactly like the rest of this Node app.

**Alternatives considered**: Server-side LibreOffice conversion (.docx → PDF, then treat identically to a PDF upload) — would give visually-faithful, consistent diagram handling across both formats, but adds a native-binary runtime dependency this project has never needed before; deferred, not ruled out permanently, if .docx-with-diagrams turns out to be a common real case. A hosted docx→PDF conversion API — a third external service dependency for a single file format; not justified for v1.

**Consequence to disclose**: a diagram embedded in a `.docx` may be described less richly than the same diagram in a PDF, since it's handled as a standalone extracted image rather than in its original page layout/context. Acceptable for v1, not hidden — noted here and in quickstart.md.

## Decision 3: A dedicated `DocumentVulgarizationClient`, Claude Sonnet 5, model configurable via env var — no LangChain/LangGraph

**Revised during implementation (2026-08-08)**: the app is bilingual (en/fr) — a resource's vulgarized content is generated for *both* locales, not one, mirroring `VulgarizedTask`'s existing per-locale shape (specs/007). Both locales are submitted as two requests inside the same batch (`custom_id: 'en'`/`'fr'`), so `Resource.anthropicBatchId` stays a single field — see data-model.md's `ResourceVulgarization`.

**Decision**: A new client, separate from the existing `AnthropicVulgarizationClient` (specs/007/008 — short task title/description rewrites), since the input shape (a whole document, potentially with images) and prompt are materially different. Uses the direct `@anthropic-ai/sdk` (already a dependency), the same tool-calling + Zod-validated-output pattern already established. Defaults to **Claude Sonnet 5** (not Haiku) — vulgarizing a whole document while preserving important information and accurately describing diagrams is a meaningfully harder instruction-following task than the existing short task-rewrite Haiku already handles well; the real per-document cost difference is small in absolute terms (roughly $0.04–0.05 vs $0.08–0.10 per ~20-page document at Sonnet 5's introductory pricing — see Decision 4 for how Batch halves both). The model name is read from an env var (`RESOURCE_VULGARIZATION_MODEL` or equivalent), not hardcoded, so it can be swapped without a code change if real usage shows a cheaper tier is sufficient.

**Rationale**: Matches this codebase's established, deliberate style (thin, explicit wrapper directly over the vendor SDK, Zod-validated structured output) rather than introducing a framework. LangGraph is built for multi-step, stateful agentic workflows (planning, looping, branching tool use) — this is a single structured call (send document, get back one vulgarized-text response), so a graph-orchestration library would add real complexity (a new abstraction paradigm, a new dependency with its own release cadence) for a control flow that's just "one function call." LangChain's main selling point for this use case — multi-provider abstraction — is achieved instead by a small first-party interface (one method, one implementation today) at near-zero cost, without inheriting a large, fast-moving dependency or breaking from the existing direct-SDK convention.

**Alternatives considered**: Reusing/extending `AnthropicVulgarizationClient` directly — rejected, the input (a document, possibly multi-modal) and prompt are different enough to warrant a separate client, matching how `GithubProjectsClient` and `GithubOauthClient` stay separate despite both being "GitHub." Scaleway/another Model-as-a-Service provider — considered at length (see conversation); rejected for v1 because it would require building a PDF→page-images pipeline ourselves (Scaleway's vision model, Pixtral, doesn't read multi-page PDFs natively) for a marginal cost saving once Anthropic's Batch API discount (Decision 4) is applied. Self-hosting an open-weight model — rejected, the fixed GPU infrastructure cost isn't justified at this product's current/expected volume; per-document API cost is already a few cents.

## Decision 4: Processing is submitted via Anthropic's Message Batches API, polled by a periodic sweep

**Decision**: When a resource is created, its document content is submitted as a Claude Batch request (a batch of one is valid and still gets the discount) rather than a synchronous Messages API call. A new periodic sweep (mirroring `TaskVulgarizationService`'s existing `@Cron` pattern, specs/007) polls pending batch jobs, and on completion writes the vulgarized content and flips the resource to "ready for review" (or "failed", per spec FR-011, if the batch item errored or the batch as a whole failed).

**Rationale**: Spec.md FR-015 already requires async processing (resource exists immediately in "processing" state, vulgarization completes afterward) — the Batch API is a natural fit for a request that was never going to be synchronous anyway, at half the per-token cost (50% discount on both input and output, stacking with the vision-heavy input this feature needs). Reusing the sweep pattern keeps this consistent with how the codebase already handles "background job checks GitHub/AI state and updates rows" (specs/007/008), rather than introducing a new job-queue dependency (e.g. BullMQ + Redis) this project has never needed.

**Alternatives considered**: A synchronous Messages API call fired off in the background immediately after the HTTP response (no batch, no sweep) — simpler (no polling logic), but costs 2x per token and doesn't reuse the existing sweep idiom. A dedicated job queue (BullMQ/Redis) — would generalize better to future async work, but introduces a new piece of infrastructure (Redis) this project doesn't otherwise need; not justified for one feature's background processing when the existing cron-sweep pattern already covers it.

## Decision 5: Notion-sourced resources are processed as text only (no image blocks forwarded to vision)

**Decision**: A Notion page's content is fetched via the Notion API (block children, recursively for nested blocks) and flattened to plain text/markdown for the vulgarization call. Image blocks within the page are not forwarded to Claude's vision input for v1.

**Rationale**: Notion's own image URLs (for Notion-hosted images) are short-lived, presigned links that expire — reliably forwarding them into a vision call adds real fetch-timing complexity (fetch-and-re-upload before they expire) for a secondary path (User Story 4, P2) that's explicitly less critical than upload (User Story 1, P1). Text-only keeps the Notion path simple; if a Notion page is diagram-heavy, its resource may read as sparser than an equivalent PDF upload — an acceptable, disclosed v1 limitation, not a silent gap (the page's prose content is still vulgarized normally).

**Alternatives considered**: Fetching and forwarding Notion image blocks to vision — deferred as a future enhancement once the upload path (the priority) is solid.

## Decision 6: File storage — Cloudflare R2 via the S3-compatible SDK, presigned URLs for preview/download

**Decision**: Uploaded original files (PDF/DOCX/images) are stored in a Cloudflare R2 bucket, using `@aws-sdk/client-s3` (R2 is S3-API-compatible) — a new dependency for `apps/api`. The API generates short-lived presigned GET URLs for browser preview (PDF/image, rendered via a plain `<iframe>`/`<img>`, no PDF.js needed since browsers already render PDFs natively) and download (all formats), rather than proxying file bytes through the API itself.

**Rationale**: Matches the decision already made with the user (R2: S3-compatible, no egress fees — relevant since clients will preview/download these files repeatedly). Presigned URLs avoid routing potentially large files through the NestJS process for every view, and avoid needing a PDF-rendering library on the frontend.

**Alternatives considered**: Proxying file bytes through an authenticated API endpoint — simpler access-control story (one guard, no signed-URL expiry to reason about) but adds real bandwidth/latency cost to the API process for something object storage already does well; presigned URLs are the standard pattern for this and were not seen as risky enough to avoid.

## Decision 7: Encryption reuses the existing token-encryption utility, but as a distinct credential

**Decision**: The Notion integration token is encrypted with the same AES-256-GCM utility already used for the GitHub Projects board-connection token (`apps/api/src/board-connections/token-encryption.ts`) — reused as a plain function import (no new crypto code), but stored in its own column on its own entity, never conflated with the GitHub board token (per spec.md's Notion Connection entity and this project's established convention of keeping external-service connections distinct even when they share an implementation pattern).

**Rationale**: No reason to duplicate proven encryption code; Constitution III's module-isolation concern is about Prisma reach-ins between modules, not about reusing a stateless utility function — the same reasoning already applied for `board-oauth-cookie.ts` importing `encryptToken` in specs/010.

**Alternatives considered**: A separate encryption utility for Notion tokens — rejected, no technical reason to duplicate identical crypto logic.
