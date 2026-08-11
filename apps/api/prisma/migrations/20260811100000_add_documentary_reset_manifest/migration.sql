-- specs/016-canonical-document-workflow
-- Preparatory, non-destructive migration. The reset itself is an explicit
-- operator command and is never run from a normal application start.

CREATE TYPE "DocumentaryTransitionMode" AS ENUM ('legacy', 'resetting', 'canonical');
CREATE TYPE "DocumentaryResetStatus" AS ENUM (
  'inventoried',
  'storage_deleting',
  'storage_failed',
  'database_purging',
  'database_failed',
  'clean'
);
CREATE TYPE "DocumentaryResetItemStatus" AS ENUM (
  'pending',
  'deleted',
  'already_absent',
  'failed'
);

CREATE TABLE "documentary_transition_states" (
  "id" VARCHAR(64) NOT NULL,
  "mode" "DocumentaryTransitionMode" NOT NULL DEFAULT 'legacy',
  "version" INTEGER NOT NULL DEFAULT 1,
  "active_reset_run_id" UUID,
  "approved_inventory_digest" VARCHAR(64),
  "write_freeze_at" TIMESTAMP(3),
  "canonicalized_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "documentary_transition_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "documentary_transition_states_singleton_check"
    CHECK ("id" = 'documentary-transition'),
  CONSTRAINT "documentary_transition_states_version_check"
    CHECK ("version" > 0)
);

CREATE TABLE "documentary_reset_runs" (
  "id" UUID NOT NULL,
  "feature_key" TEXT NOT NULL,
  "status" "DocumentaryResetStatus" NOT NULL DEFAULT 'inventoried',
  "approved_inventory_digest" VARCHAR(64) NOT NULL,
  "storage_expected_count" INTEGER NOT NULL DEFAULT 0,
  "storage_deleted_count" INTEGER NOT NULL DEFAULT 0,
  "storage_failed_count" INTEGER NOT NULL DEFAULT 0,
  "database_expected_rows" INTEGER NOT NULL DEFAULT 0,
  "database_deleted_rows" INTEGER NOT NULL DEFAULT 0,
  "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "documentary_reset_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "documentary_reset_runs_non_negative_counts_check" CHECK (
    "storage_expected_count" >= 0
    AND "storage_deleted_count" >= 0
    AND "storage_failed_count" >= 0
    AND "database_expected_rows" >= 0
    AND "database_deleted_rows" >= 0
  )
);

CREATE TABLE "documentary_reset_items" (
  "id" UUID NOT NULL,
  "reset_run_id" UUID NOT NULL,
  "legacy_resource_id" UUID NOT NULL,
  "object_key" TEXT,
  "status" "DocumentaryResetItemStatus" NOT NULL DEFAULT 'pending',
  "diagnostic" VARCHAR(1000),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "documentary_reset_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "documentary_reset_items_attempt_count_check"
    CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "documentary_reset_runs_feature_key_key"
  ON "documentary_reset_runs"("feature_key");
CREATE UNIQUE INDEX "documentary_reset_items_reset_run_id_legacy_resource_id_key"
  ON "documentary_reset_items"("reset_run_id", "legacy_resource_id");
CREATE INDEX "documentary_reset_items_reset_run_id_status_idx"
  ON "documentary_reset_items"("reset_run_id", "status");

ALTER TABLE "documentary_reset_items"
  ADD CONSTRAINT "documentary_reset_items_reset_run_id_fkey"
  FOREIGN KEY ("reset_run_id") REFERENCES "documentary_reset_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A narrow, content-free inventory boundary for the explicit reset runner.
-- The view intentionally exposes only identifiers and storage keys.
CREATE VIEW "documentary_legacy_resource_inventory" AS
SELECT
  "id" AS "resource_id",
  "original_file_key" AS "object_key"
FROM "resources";

-- Seed exactly once. The CHECK above prevents a differently keyed row from
-- turning this transition boundary into an accidental multi-row setting.
INSERT INTO "documentary_transition_states" (
  "id",
  "mode",
  "version",
  "created_at",
  "updated_at"
) VALUES (
  'documentary-transition',
  'legacy',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
