# T006 local documentary reset smoke

Date: 2026-08-11  
Scope: local Docker PostgreSQL and explicitly non-production R2 configuration  
Production/Railway actions: none

## Environment verification

- Docker service: `b-mate-postgres-1`, PostgreSQL 16 Alpine, local port 5432,
  running.
- `apps/api/.env`: `DATABASE_URL` and all required R2 variables are set.
- R2 bucket name contains a non-production marker (`dev`, `test`, `local`,
  `staging`, or `sandbox`). The bucket name and credentials are intentionally
  omitted from this report.
- Preparatory migrations applied locally:
  - `20260811100000_add_documentary_reset_manifest`
  - `20260811100500_align_documentary_reset_updated_at`
- Prisma reported the local database in sync with `schema.prisma`.

## Read-only dry-run

Command:

```bash
pnpm --filter api documentary:reset -- --dry-run --feature 016-canonical-document-workflow
```

Result:

```json
{
  "featureKey": "016-canonical-document-workflow",
  "status": "inventoried",
  "digest": "7847b344dd129f9afe80c41207fb7e4c7934f49382d5e7d30f3f814fb2df9fe5",
  "resources": [],
  "counts": {
    "referenceQuestions": 0,
    "categoryReferenceDrafts": 0,
    "categoryContents": 0,
    "categoryReferences": 0,
    "categoryExtracts": 0,
    "resources": 0
  }
}
```

The dry-run changed no transition, reset-run, reset-item, storage, or legacy
documentary row. There are no R2 object keys to delete in the approved local
inventory.

After all pre-confirmation gates passed, the same dry-run was executed again.
It returned the exact same digest and the same zero-row inventory.

## Confirmation checkpoint

Status: **approved and completed locally**.

The user explicitly approved local confirmation on 2026-08-11. Immediately
before confirmation, the dry-run returned the exact approved digest again.

The first confirmation attempt stopped before the transition or purge because
Prisma could not deserialize PostgreSQL's `void` advisory-lock result. The
transition remained `legacy` at version 1, the reset run remained `inventoried`,
and no reset item or deletion existed. The lock query was corrected to expose a
boolean-only result, covered by a regression test, and the targeted reset tests
and API typecheck passed before confirmation resumed.

The approved confirmation then returned `status: clean` with the exact digest:

```text
7847b344dd129f9afe80c41207fb7e4c7934f49382d5e7d30f3f814fb2df9fe5
```

Post-confirmation verification:

- exactly one transition row;
- transition mode `canonical`, version 3;
- reset run status `clean`;
- zero legacy documentary rows;
- zero reset items and therefore zero pending or failed items;
- no R2 deletion was required because the approved inventory contained no
  object keys;
- non-documentary counts: 2 users, 1 project, 2 project members, 2 invitations,
  1 board connection, 1 Notion connection, and 6 vulgarized tasks.

Before testing a retry, confirmation was made idempotent in canonical mode: an
already-clean run with the same digest is returned without upsert, deletion,
purge, or transition mutation. The same confirmation command returned `clean`
a second time. Transition mode/version, reset status, all zero residue counts,
and every non-documentary count above remained exactly unchanged.

Confirmation was local-only. No deploy, drain, reset, or mutation targeted
Railway or production.

## Gates

All pre-confirmation gates pass:

- PASS — `pnpm --filter api typecheck`
- PASS — `pnpm lint`
- PASS — `pnpm test:cov`
  - API: 38 suites and 387 tests; 93.94% statements and 81.25% branches.
  - Web: 83 files and 390 tests; 93.13% statements and 86.35% branches.
- PASS — `pnpm build`
  - The API and web production builds completed successfully.
  - The first sandboxed web build could not reach Google Fonts; the identical
    build passed when allowed to fetch `Urbanist` and `Geist Mono`.
