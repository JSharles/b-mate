# Documentary workflow transition runbook

This runbook covers the guarded transition introduced by
`specs/016-canonical-document-workflow`. It does not authorize a production
reset or deployment. Every Railway mutation, drain, reset, and destructive
schema migration requires a separate explicit operator approval.

## Safety invariants

- `documentary_transition_states` contains exactly the fixed
  `documentary-transition` row. Missing state fails closed.
- Dry-run is read-only. Its SHA-256 digest is the approval token for the exact
  sorted resource/object inventory and legacy table counts.
- `resetting` blocks every legacy resource upload, Notion addition, removal,
  category review mutation, rebuild, and scheduled sweep.
- A confirmed failure remains `resetting`, exits non-zero, and is retried with
  the same reset run. It never re-enables legacy writes.
- The command is never part of `start:prod`, Railway start commands, or Prisma
  migrations.

## Local validation only

Use Docker PostgreSQL and an R2 namespace that is explicitly non-production.

```bash
pnpm --filter api prisma:migrate
pnpm --filter api documentary:reset -- --dry-run --feature 016-canonical-document-workflow
pnpm --filter api documentary:reset -- --confirm 016-canonical-document-workflow --digest <SHA256_FROM_DRY_RUN>
```

Before confirmation, record the complete dry-run report and verify the digest
has not changed. After confirmation, require all of the following:

- transition mode `canonical`;
- reset run `clean`;
- zero pending/failed reset items;
- zero rows in every legacy documentary table;
- every non-null legacy object key recorded as deleted or already absent;
- users, projects, memberships, invitations, board/Notion connections, and
  task-tracking data unchanged.

## Production compatibility floor

Production execution is outside `speckit-implement`.

1. Before reset, every instance must run the transition-aware guard release.
2. From the first `resetting` write, recovery is roll-forward-only. Never
   redeploy an unguarded build.
3. After `canonical`, only builds that understand the transition and reject
   legacy writes are compatible.
4. Remove the legacy runtime in a release that still retains the empty legacy
   schema. Prove it healthy and drain every older instance.
5. Apply the guarded legacy-table drop only in a later, separately approved
   release.
6. After that drop, only builds with no legacy Prisma model, generated-client
   assumption, query, route, or worker may be deployed.

## Failure handling

- Inventory drift: stop, run a new dry-run, and obtain a new approval.
- Storage failure: keep `resetting`; repair credentials/connectivity and rerun
  confirmation with the same approved digest if the frozen inventory matches.
- Database purge failure: keep `resetting`; fix the database issue and retry.
  The purge is dependency ordered and transactional.
- Missing transition row: do not recreate it from application code. Diagnose
  migration state and restore the fixed row through an audited database
  repair before any documentary mutation.
