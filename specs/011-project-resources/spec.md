# Feature Specification: Project Resources

**Feature Branch**: `feat/project-resources`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Ajouter une fonctionnalité 'Ressources' au projet : le développeur ajoute une ressource (document uploadé ou page Notion connectée), l'IA la vulgarise, et le client la consulte dans une nouvelle section du projet."

**Supersedes**: The "Documentation" placeholder tile on the project page (`Projects.ProjectPage.documentation` / `clientDocumentation`, currently a "Coming soon" state on both the developer and client views) is replaced by this feature — not a separate addition alongside it.

**Revised 2026-08-08** (same day, before planning): three follow-up questions from the user materially changed the resource lifecycle and processing approach — see User Story 2 (new, developer review/publish gate) and FR-003/FR-013/FR-016 (whole-document vision-based processing, not text-only extraction; diagrams/images supported as regular uploads).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer adds a resource by uploading a document (Priority: P1)

A developer working on a project has a document — an audit report, a spec, an architecture diagram — that their client should understand without needing to read or decode it themselves. The developer uploads the file to the project's Resources section. The system processes it, and shortly after, a plain-language draft is ready for the developer to review — not yet visible to the client.

**Why this priority**: The intake half of the feature's core value. Without it, there's nothing for a developer to review or a client to eventually read.

**Independent Test**: A developer uploads a PDF to a project with no existing resources, and can verify a new resource appears in a "processing" state, then transitions to a "ready for review" state showing a vulgarized draft — while remaining invisible to the client throughout.

**Acceptance Scenarios**:

1. **Given** a project with no resources yet, **When** the developer uploads a document, **Then** a new resource appears immediately in a "processing" state, visible only to the developer.
2. **Given** a resource whose document has been uploaded, **When** the AI processing completes, **Then** the resource shows a plain-language draft that preserves the document's important information (including a description of any diagrams/images the document contains) rather than reducing it to a short summary — still not visible to the client.
3. **Given** a resource that has finished processing, **When** the developer or, once published, the client opens it, **Then** the original uploaded document is still accessible (preview when the format supports it, download otherwise).

---

### User Story 2 - A developer reviews and publishes a processed resource (Priority: P1)

Once a resource's AI-vulgarized draft is ready, the developer looks it over before their client ever sees it. If it reads well, they publish it — the client can now see it. If it's not good enough, they delete it rather than let a client see a bad or confusing version of their own document.

**Why this priority**: Without this gate, User Story 3 (client browsing) has nothing legitimate to show — a resource that auto-published without developer eyes on it first risks putting bad AI output in front of the person least equipped to catch it. This is as core to the feature's trust story as the vulgarization itself.

**Independent Test**: With a resource in "ready for review" state, a developer can view the AI-vulgarized draft, publish it (after which a client can see it), or delete it instead (after which it's gone entirely — no partial/rejected state lingers).

**Acceptance Scenarios**:

1. **Given** a resource in "ready for review" state, **When** the developer opens it, **Then** they see the full AI-vulgarized draft exactly as a client would eventually see it.
2. **Given** a resource in "ready for review" state, **When** the developer publishes it, **Then** it becomes visible in the client's Resources section.
3. **Given** a resource in "ready for review" state (or any other state), **When** the developer deletes it instead of publishing, **Then** it is removed entirely and never becomes visible to the client.
4. **Given** a resource that has already been published, **When** the developer views the Resources section, **Then** they can still see and delete it (e.g. if it turns out to be wrong or outdated) — deleting a published resource removes it from the client's view too.

---

### User Story 3 - A client browses and reads a project's resources (Priority: P1)

A non-technical client wants to understand what a document or diagram says without asking their developer to explain it. They open the project's Resources section, see every *published* resource as a tile, and click one to read the plain-language version — with the option to see or download the original if they want it.

**Why this priority**: The client-facing read experience is the other half of the core value (alongside User Story 1) — a resource that only the developer can see delivers no client value at all.

**Independent Test**: As a client on a project with at least one published resource (and, separately, one still in developer review), open the Resources section, confirm only the published one appears as a tile, click it, and confirm the plain-language content is readable and the original document is reachable.

**Acceptance Scenarios**:

1. **Given** a project with one or more published resources, **When** a client opens the Resources section, **Then** they see a tile for each published resource — never one still awaiting developer review.
2. **Given** a resource tile, **When** the client clicks it, **Then** they land on a page showing the AI-vulgarized content for that resource.
3. **Given** a resource's detail page, **When** the client wants the original document, **Then** they can preview it in the browser (for formats that support it) or download it (always available as a fallback for upload-sourced resources).

---

### User Story 4 - A developer adds a resource by connecting a Notion page (Priority: P2)

A developer keeps some project documentation in Notion rather than as a file. Instead of exporting and uploading it, they connect the specific Notion page directly as a resource, and it goes through the same processing and developer-review gate as an uploaded document.

**Why this priority**: A real alternative source developers already use, but the feature is already valuable with upload alone (User Stories 1–3) — this extends reach without being required for the core value.

**Independent Test**: A developer connects a Notion page to a project (via a pasted Notion integration token and the page's URL/ID) and can verify a new resource appears in "processing," then "ready for review," following the exact same lifecycle as an uploaded document.

**Acceptance Scenarios**:

1. **Given** a project, **When** the developer provides a Notion integration token and a page URL/ID, **Then** a new resource is created from that Notion page's content, starting in "processing" state.
2. **Given** a Notion-sourced resource, **When** AI processing completes, **Then** it shows a plain-language draft of the page's content, awaiting developer review exactly like an uploaded document (User Story 2).
3. **Given** an invalid Notion token or a page the token cannot access, **When** the developer attempts to connect it, **Then** they see a clear error and no resource is created.

---

### Edge Cases

- What happens when AI processing fails (extraction error, AI service error, unreadable file)? The resource must show a clear failed state, not an infinite "processing" spinner or broken content — the developer needs to know something went wrong, and a failed resource is never publishable.
- What happens when a document is very large or has no meaningfully processable content at all (e.g. a fully blank scan)? The system should not crash or silently produce an empty result; a failed/unprocessable state is acceptable (see FR-011).
- What happens when a document is (or contains) a diagram/schema rather than prose — e.g. an architecture diagram exported as an image or a diagram-only PDF? Processing MUST describe what the diagram shows in plain language as part of the vulgarized content, not treat it as unprocessable purely for lacking body text (see FR-003, FR-016).
- What happens if a client opens a resource detail page for a resource that isn't published (still in review, or was deleted)? They should see a clear "not found" state — identical to a resource that never existed, never distinguishing "not published yet" from "doesn't exist" (consistent with this project's existing convention).
- What happens when the developer navigates away or closes the tab while a resource is still processing? Processing must continue independently of the developer's session — it's not tied to keeping a browser tab open.
- What does "the original document" mean for a Notion-sourced resource, which has no uploaded file? FR-007/FR-008 (preview/download) apply only to upload-sourced resources; a Notion-sourced resource instead offers a link back to the source Notion page (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a developer (contributor-role project member) add a resource to a project by uploading a document file.
- **FR-002**: The system MUST let a developer add a resource to a project by connecting a Notion page, via a pasted Notion integration token and the page's URL/ID — no Notion OAuth flow (explicitly out of scope for this iteration).
- **FR-003**: The system MUST process every added resource's full content — including any images or diagrams it contains, not just extractable body text — through an AI step that produces a plain-language, non-technical rewrite that preserves the source's important information (including describing what any diagrams/schemas show) rather than reducing it to a short summary.
- **FR-004**: The system MUST track and show each resource's state — processing, ready for review, published, or failed — distinctly, so no one sees a blank or misleading result at any stage.
- **FR-005**: The system MUST display a project's *published* resources as a set of tiles in a "Resources" section, visible to both the developer and client roles, replacing the current "Documentation" placeholder tile on both the developer and client views of the project page. A developer's own view MUST additionally let them see and manage resources still in processing or awaiting review (not just published ones).
- **FR-006**: The system MUST let a user (developer or client) open a resource tile to reach a detail page showing that resource's AI-vulgarized content.
- **FR-007**: The system MUST let a user preview the original uploaded document in the browser when the file format supports it (at minimum: PDF, and static images).
- **FR-008**: The system MUST always offer a way to download the original document, regardless of whether an in-browser preview is available for its format.
- **FR-009**: The system MUST restrict adding, reviewing, publishing, and deleting a resource to contributor-role project members — consistent with how board connections are already restricted (specs/005 FR-009).
- **FR-010**: The system MUST only let client-role project members view *published* resources — a resource still processing, awaiting review, or failed MUST NOT be visible or reachable by a client under any circumstance (not via the Resources list, not via a direct/guessed link).
- **FR-011**: The system MUST surface a clear failed state (not a silent gap or an infinite processing indicator) when AI processing cannot complete — extraction failure, AI error, or a genuinely unprocessable document. A failed resource is never publishable; the developer's only action on it is to delete it.
- **FR-012**: The system MUST encrypt the Notion integration token before storing it, following the same encryption approach already used for the GitHub Projects board-connection token (specs/005) — a distinct mechanism/credential, not the same stored token or code path.
- **FR-013**: The system MUST accept resource uploads in PDF, Word (.docx), or common static image formats (at minimum PNG and JPEG) — covering both prose documents and standalone diagrams/schemas exported as images — up to 25 MB per file. Any other format or a file over that limit MUST be rejected with a clear error at upload time.
- **FR-014**: The system MUST let a developer delete a resource, in any state (processing, ready for review, published, or failed) — consistent with how a board connection can already be disconnected (specs/005 FR-005). Deleting a published resource immediately removes it from the client's view too. This iteration does not support editing/replacing a resource in place; removing and re-adding covers that case.
- **FR-015**: The system MUST create a resource immediately in a "processing" state when added (upload or Notion connection), independent of AI processing completing — the developer is never blocked waiting for it to finish before the resource exists. Processing completes asynchronously in the background and updates the resource's state to "ready for review" (or "failed", FR-011) once done.
- **FR-016**: The system MUST let a developer publish a resource that has reached "ready for review" state, making it visible to clients (FR-010) — publishing is a distinct, explicit developer action, never automatic on processing completion. The developer reviews the AI-vulgarized draft as-is; this iteration does not support editing that text before publishing (delete-and-retry is the only correction path).

### Key Entities

- **Resource**: A single piece of project documentation, added by a developer, eventually understood by a client. Belongs to exactly one project. Has a source (an uploaded document, or a connected Notion page), a state (processing / ready for review / published / failed), and — once processed — AI-vulgarized content. Distinct from a `BoardConnection` (specs/005): a project can have many resources, but at most one board connection.
- **Notion Connection** (per-resource): The pasted integration token and page URL/ID used to fetch a Notion-sourced resource's content. Encrypted at rest (FR-012), same treatment as the GitHub Projects board-connection token, but a separate, distinct mechanism, not reused/shared with it.
- **Original Document**: The uploaded file itself (for upload-sourced resources — documents or diagram images alike), stored so it can be previewed/downloaded independently of the AI-vulgarized content derived from it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from "has a document or diagram" to "a reviewed, client-ready plain-language version of it" without manually rewriting or explaining any of its content themselves.
- **SC-002**: A client can find and open any published resource within two clicks from the project page (Resources section → resource tile).
- **SC-003**: 100% of resources that fail to process show a clear failed state to the developer, rather than an indefinite processing indicator.
- **SC-004**: A client can always reach the original document for any upload-sourced resource — either previewed in-browser or downloaded — with zero such resources leaving them stuck with only the AI-vulgarized version.
- **SC-005**: Zero unpublished (processing, in-review, or failed) resources are ever visible or reachable by a client, across every tested path (list view, direct link, or otherwise).
- **SC-006**: A resource whose source is primarily a diagram/schema still produces a plain-language description of what it shows, not a failed or empty result, for a legible, non-trivial diagram.

## Assumptions

- A future iteration may let the developer choose an AI processing type (summary, simplification, etc.) at the point of adding a resource — this iteration ships exactly one fixed treatment (vulgarize without over-summarizing, including describing diagrams/images) and does not build any selector for it.
- Cloudflare R2 (or an equivalent S3-compatible object store) is assumed as the storage location for uploaded original documents/images. Provisioning the actual account/bucket and its credentials is a manual, one-time step outside this implementation's automated scope (comparable to registering the GitHub OAuth App for specs/009) — to be done together with the user before storage-dependent tasks can be implemented, not guessed at.
- Notion connection reuses the same *pattern* as the GitHub Projects board-connection token (pasted integration token, server-side encryption) but is a functionally distinct mechanism/credential — not the same stored token or code path.
- No dedicated Excalidraw (or other diagramming-tool) connection is built in this iteration — a developer with an Excalidraw diagram exports it as an image or PDF and uploads it like any other resource (FR-013).
- FR-007/FR-008 (original-document preview/download) apply only to upload-sourced resources. A Notion-sourced resource has no uploaded file; it instead offers a link back to the source Notion page as its "original."
- Client accounts are otherwise unaffected — this feature only adds a new thing for them to read, not a new authentication or account concept.
