# Contributor Workspace State Contract

This contract complements `openapi.yaml`. It defines what the contributor UI may infer from the aggregate response and prevents loading/provider implementation details from leaking into copy or client data.

## Questions the aggregate must answer

`GET /projects/{projectId}/documentation/workspace` must let a contributor determine, without consulting another endpoint:

1. **What is happening?** Current source revision, document stages, active operation count, pending release progress.
2. **What needs me?** Required category reviews, optional clarifications, and failures with an explicit action.
3. **What does the client see?** No content, the current published release, or the previous release while a replacement is prepared.

## Stable public workflow states

The API maps internal domain/provider states into these contributor-safe values:

| Public state | Meaning | Contributor action |
|---|---|---|
| `idle` | No background work and no pending human action. | None. |
| `processing` | Automatic extraction, consolidation, drafting, validation, or release work is progressing. | None; keep prior client state visible. |
| `retrying` | A recoverable failure occurred and automatic recovery is scheduled. | None. Do not expose provider/model/error text. |
| `clarification_available` | One or more optional material questions are open. | Answer or explicitly leave open. Publication is not blocked. |
| `review_required` | A factual category draft is ready. | Accept, request factual correction, or discard. |
| `publication_preparing` | Validated facts/profile are being converted into a new client release. | None; prior release remains visible. |
| `needs_attention` | Automatic routes are exhausted or input requires a contributor action. | Use the returned `actionCode`. |

More than one condition may exist. `primaryState` is selected server-side by priority:

```text
needs_attention
review_required
clarification_available
publication_preparing
retrying
processing
idle
```

## Action classes

Every action is explicitly classified:

- `required`: factual review or input repair without which new content cannot progress;
- `optional`: clarification answer/leave-open;
- `automatic`: processing/retry/publication with no button;
- `attention`: an exhausted operation with one safe action such as retry under current policy, replace unreadable file, or reconnect Notion.

The UI must not infer requiredness from color, operation type, or HTTP status.

## Client visibility state

`clientVisibility.state` is exactly one of:

- `none`: no client documentary release exists;
- `current`: the latest completed release is visible;
- `previous_while_preparing`: a new release is pending and the named current release remains visible.

The response includes `publishedReleaseId`, `publishedAt`, `pendingReleaseId`, `pendingReadyCount`, and `pendingExpectedCount` when relevant. It never says the client sees a draft merely because generation completed; only the publication pointer defines visibility.

## Change tokens and polling

The aggregate exposes opaque monotonic/change tokens:

- `sourceRevisionId` and `sourceRevisionSequence`;
- `workspaceVersion`;
- `publicationReleaseId`;
- `editorialProfileRevisionId`;
- `hasActiveOperations`;
- `refreshAfterMs` (`5000` while active, `30000` when stable).

Frontend behavior:

1. Poll at the supplied interval while the tab is visible.
2. On a changed source revision, invalidate source, provenance, clarification, and category-review detail queries.
3. On a changed publication release, invalidate contributor/client content previews.
4. On mutation success, merge the acknowledged resource/operation immediately and refetch the aggregate.
5. During a failed refetch, retain prior data, show a non-destructive “update delayed” notice, and retry; never replace published/source content with skeletons.

## Localized error/action codes

Ordinary APIs return stable codes and safe parameters, localized by the frontend. Initial set:

- `DOCUMENT_UNREADABLE`
- `DOCUMENT_TOO_LARGE`
- `DOCUMENT_TYPE_UNSUPPORTED`
- `NOTION_RECONNECT_REQUIRED`
- `GENERATION_TEMPORARILY_DELAYED`
- `GENERATION_ROUTES_EXHAUSTED`
- `GENERATION_POLICY_BLOCKED`
- `EDITORIAL_INSTRUCTION_REQUIRED`
- `STALE_SOURCE_REVISION`
- `STALE_DRAFT`
- `STALE_CLARIFICATION`
- `PREVIEW_UNAVAILABLE_NO_CONTENT`
- `RESET_INCOMPLETE` (operator/reset command only)

Raw provider names, model names, prompt text, request IDs, remote messages, token counts, and policy JSON are absent from contributor and client response schemas.

## Shared client rendering

Both roles use the same pure `ClientCategoryView` props contract:

```text
categories: [{ key, label, contentBlocks }]
locale
mode: published | pending-preview
```

Role-specific hooks remain separate. Client mode receives only published release data. Contributor pending mode may receive prepared content but must display a persistent “not visible to the client” label and may not offer a publish shortcut outside the defined factual/profile gates.

## Responsive/accessibility obligations

- Desktop uses a view navigation plus readable `max-w-prose` body; provenance may open in a sheet.
- Mobile uses a labelled view selector instead of five compressed tabs; before/after comparisons stack.
- Status is icon + text, never color only. Green is reserved for currently published content.
- Global workflow changes are announced through a stable `aria-live="polite"` region only when the state actually changes.
- All destructive removals and working-language changes use a confirmation dialog that explains recalculation and current client visibility.
- Long clarification/source lists expose totals, headings, and accessible cursor/load-more controls; pagination is not a hidden business cap.
