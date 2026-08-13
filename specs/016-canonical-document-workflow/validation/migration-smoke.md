# T009 canonical migration smoke

Date: 2026-08-11  
Scope: local Docker PostgreSQL only  
Production/Railway actions: none

## Preconditions and application

- Transition singleton: exactly one `documentary-transition` row, mode
  `canonical`, no active reset.
- Reset run `016-canonical-document-workflow`: `clean`, no failed storage item,
  no pending/failed manifest item.
- All six retained legacy documentary tables were empty before migration.
- `20260811110000_canonical_document_workflow` and
  `20260811110500_lock_legacy_documentary_tables` applied successfully.
- `prisma migrate status` reports 24 migrations and an up-to-date schema.
- The replacement migration's SQL guard checks every condition above on the
  target database. Only Prisma's automatically named, isolated
  `prisma_migrate_shadow_db_*` may bypass the operator-reset assertions so
  migration history remains replayable for schema validation.

## Replacement-domain integrity

- Prisma formatting, validation, client generation, and API typecheck pass.
- PostgreSQL reports both XOR constraints present and validated:
  `provenance_links_origin_xor_check` and
  `clarification_evidence_origin_xor_check`.
- Deferred support-provenance triggers are installed on source items and
  provenance links, so a committed item cannot remain without a `supports`
  origin.
- Unique indexes were inspected for:
  - one `ProjectSource` per project and one source per current revision;
  - `(project_source_id, sequence)` revision ordering;
  - `(project_id, category_key)` projection identity;
  - unique active-draft and validated-reference pointers;
  - operation deduplication and current-attempt pointers.
- Foreign-key rules were inspected: project-owned roots cascade with a project;
  revision items, observations, release entries, and attempts cascade only from
  their owning aggregate; historical inputs and accepted/publication pointers
  are restricted or set null as specified.
- All canonical source and generation tables were empty immediately after the
  additive migration; no legacy row was converted, copied, or dual-written.

## Legacy isolation and preservation

- Legacy row total after migration: zero across `resources`,
  `category_extracts`, `category_references`, `category_reference_drafts`,
  `category_contents`, and `reference_questions`.
- Each retained legacy table has statement-level blockers for `INSERT`,
  `UPDATE`, and `DELETE` (18 trigger/event entries total).
- A direct local `INSERT` attempt against `resources` failed with
  `legacy documentary table resources is write-inaccessible after canonical
  transition`; no row was inserted.
- Canonical code introduced by T007/T008 has no query or relation to legacy
  documentary delegates. The only remaining legacy SQL reader is the isolated
  reset/audit runner, scheduled for deletion with the old runtime.
- Non-documentary counts before and after migration are identical: 2 users,
  1 project, 2 project members, 2 invitations, 1 board connection, 1 Notion
  connection, and 6 vulgarized tasks.

## Regression checks

- Reset and Prisma-mock suites: 3 suites, 21 tests passed.
- API typecheck passed.
- No Railway deploy, drain, reset, storage deletion, or production mutation was
  performed.
