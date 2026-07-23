-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('developer', 'client');

-- AlterTable: add nullable first so existing rows can be backfilled below
-- before the NOT NULL constraint is applied.
ALTER TABLE "users" ADD COLUMN "account_kind" "AccountKind";

-- Backfill existing accounts from their current project_members rows.
-- "developer" if the account holds any contributor membership; "client" if
-- it has only client memberships; "developer" if it has none at all (every
-- pre-feature account was created via the direct signup flow, historically
-- the developer-facing one, or via invitation acceptance — which always
-- creates a membership as part of the same action, so a zero-membership
-- account can only be a direct signup). See specs/004-account-kind/data-model.md.
UPDATE "users" u SET "account_kind" = (
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "project_members" pm
      WHERE pm.user_id = u.id AND pm.role = 'contributor'
    ) THEN 'developer'
    WHEN EXISTS (
      SELECT 1 FROM "project_members" pm WHERE pm.user_id = u.id
    ) THEN 'client'
    ELSE 'developer'
  END
)::"AccountKind";

-- AlterTable: now that every row has a value, enforce NOT NULL.
ALTER TABLE "users" ALTER COLUMN "account_kind" SET NOT NULL;
