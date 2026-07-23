# Phase 0 Research: GitHub Projects Board Connection

No `NEEDS CLARIFICATION` markers remained in the Technical Context after specification (the one open product question — GitHub auth mechanism — was resolved with the user during `/speckit-specify`, see spec.md FR-010/FR-011). Research here covers the technical decisions needed to implement that choice.

## Decision 1: GitHub Projects v2 is GraphQL-only

**Finding**: Unlike GitHub's older "Classic Projects" (REST-accessible), Projects v2 is exposed exclusively through GitHub's GraphQL API (`POST https://api.github.com/graphql`). There is no REST equivalent to list, read, or query v2 project boards.

**Decision**: The backend calls the GraphQL endpoint directly via the platform's built-in `fetch`, authenticated with `Authorization: Bearer <token>` (GitHub accepts fine-grained PATs this way, same as classic PATs). No GitHub SDK (e.g. Octokit) is added as a dependency — the feature needs exactly two query shapes (list the token's accessible boards; confirm access to one specific board), which is not enough surface to justify a new dependency per the "no new dependency" bias unless genuinely needed.

**Alternatives considered**: `@octokit/graphql` (rejected — pulls in a dependency for a thin wrapper this codebase can write directly in ~30 lines; revisit if a future provider/feature needs broader GitHub API surface).

## Decision 2: Listing "the token's accessible boards"

**Finding**: GitHub's GraphQL schema exposes `viewer { projectsV2(first: N) { nodes { id title number url owner { ... on User { login } ... on Organization { login } } } } }` — `viewer` resolves to whichever identity the token belongs to, and `projectsV2` returns the boards that identity can see (owned directly, or a member of the owning org with access). This is exactly the set the developer needs to pick from in User Story 1's connect flow (FR-001/FR-002).

**Decision**: The preview step (`POST .../board-connection/preview`) runs this single query with the pasted token and returns the list to the frontend for the developer to pick from — nothing is persisted at this step. `owner.login` plus a discriminator (`User` vs `Organization`) is captured per board, since GitHub's schema requires knowing which when later querying a *specific* board directly (`user(login:)` vs `organization(login:)` are different root fields).

**Alternatives considered**: Asking the developer to type the org/project number by hand (rejected — worse UX, and contradicts SC-001's "without leaving b-mate to look up any information by hand"; also more error-prone since a typo would only surface as a confusing failure later).

## Decision 3: Re-validating access at connect time (FR-002)

**Finding**: Between the preview step and the final "confirm" click, nothing has changed, but the two steps are a real API round-trip apart (the developer could in theory doctor the request). FR-002 requires access to be verified at connect time, not just trusted from the preview response.

**Decision**: `POST .../board-connection` re-runs the same `viewer.projectsV2` lookup (or, equivalently, directly queries `user(login:).projectV2(number:)` / `organization(login:).projectV2(number:)` using the submitted owner/type/number) and confirms the selected board is actually in the result before persisting. Whichever shape is used, the check is a single cheap GraphQL call — not a performance concern (Technical Context: not a hot path).

**Alternatives considered**: Trusting the preview step's result and skipping re-validation (rejected — this is exactly what FR-002 exists to prevent; the two-step UX buys nothing if the second step doesn't actually check).

## Decision 4: Token encryption at rest

**Finding**: Unlike passwords (Argon2id, one-way hash — the app never needs the original value back), the PAT must be recoverable in full to call GitHub's API on the developer's behalf later. Hashing is not an option; encryption (reversible, with a server-held key) is required.

**Decision**: AES-256-GCM via Node's built-in `crypto` module, with the key read from a new `BOARD_CONNECTION_ENCRYPTION_KEY` environment variable (added to `apps/api/.env.example`, generated locally, provisioned in Railway for prod — never committed, consistent with how `DATABASE_URL` and other secrets are already handled per AGENTS.md). GCM's authentication tag protects against tampering with the stored ciphertext, not just confidentiality.

**Alternatives considered**: A dedicated secrets-management service (e.g. AWS KMS, Vault) — rejected as disproportionate infrastructure for a single-column secret in a project at this stage; revisit if/when the product accumulates more provider credentials of this kind.

## Decision 5: One `BoardConnection` per project, replace-on-connect (FR-006)

**Finding**: The spec requires at most one connection per project, and connecting a new board should silently replace an old one rather than requiring an explicit disconnect first.

**Decision**: `projectId` is a unique column on `BoardConnection` (enforced at the database level, not just application logic), and `connect()` is implemented as an upsert keyed on `projectId` — this makes "replace" and "first connect" the exact same code path, with no separate branch to keep in sync.

**Alternatives considered**: A one-to-many `BoardConnection[]` per project with an "active" flag (rejected — adds a whole extra invariant to maintain — "exactly one active row" — for no benefit the spec asks for; the unique-column-plus-upsert approach makes the 1:1 constraint impossible to violate by construction).

## Decision 6: `BoardProvider` enum sized for the future, not built for it

**Finding**: FR-011 says the "paste a token" UX should not foreclose a future second provider (e.g. Notion), but this feature explicitly does not build multi-provider support (spec Positioning, out-of-scope).

**Decision**: Add a `BoardProvider` enum with a single value (`github`) today, on the `BoardConnection` model, rather than hardcoding "this table is GitHub-only" with no discriminator at all. This costs nothing extra now (one enum column) but means a future provider doesn't require a breaking schema change to the same table — just a new enum value and provider-specific columns (or a related table) added alongside, decided when that feature is actually specified.

**Alternatives considered**: No provider column at all, i.e. an implicitly GitHub-only table (rejected — cheap to avoid now, would otherwise force a migration/rename later just to make room for a discriminator that could have existed from the start). A separate `Provider` model/table already generalized for multiple providers (rejected — building for a feature that isn't decided yet; the spec explicitly says not to build multi-provider support now).

## Summary of concrete changes this unlocks

1. `apps/api/prisma/schema.prisma`: new `BoardProvider` enum (`github`), new `BoardConnection` model (1:1 with `Project`, encrypted token, board identity fields).
2. One migration: create the `BoardConnection` table.
3. `apps/api/src/board-connections/` (new module): controller (preview/connect/get/disconnect), service (membership + contributor check, upsert-on-connect, hard-delete-on-disconnect), a thin GitHub GraphQL client, AES-256-GCM encrypt/decrypt helpers.
4. `apps/api/.env.example`: `+ BOARD_CONNECTION_ENCRYPTION_KEY`.
5. `packages/schemas/src/board-connection.ts`: request/response Zod schemas.
6. `apps/web/features/board-connections/` (new feature): API calls, hooks, the connect dialog (paste token → pick board → confirm), and the card that replaces the Settings placeholder for contributors.
