CREATE TABLE "source_language_proposals" (
    "id" UUID NOT NULL,
    "project_source_id" UUID NOT NULL,
    "from_language" "ProjectLanguage" NOT NULL,
    "to_language" "ProjectLanguage" NOT NULL,
    "expected_source_revision_id" UUID,
    "impacted_item_count" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_language_proposals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "source_language_proposals_languages_check"
      CHECK ("from_language" <> "to_language"),
    CONSTRAINT "source_language_proposals_impacted_count_check"
      CHECK ("impacted_item_count" >= 0),
    CONSTRAINT "source_language_proposals_version_check"
      CHECK ("version" > 0)
);

ALTER TABLE "generation_operations"
  ADD COLUMN "source_language_proposal_id" UUID;

CREATE UNIQUE INDEX "generation_operations_source_language_proposal_id_key"
  ON "generation_operations"("source_language_proposal_id");
CREATE INDEX "source_language_proposals_project_source_id_created_at_idx"
  ON "source_language_proposals"("project_source_id", "created_at");

ALTER TABLE "source_language_proposals"
  ADD CONSTRAINT "source_language_proposals_project_source_id_fkey"
  FOREIGN KEY ("project_source_id") REFERENCES "project_sources"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_language_proposals"
  ADD CONSTRAINT "source_language_proposals_expected_source_revision_id_fkey"
  FOREIGN KEY ("expected_source_revision_id") REFERENCES "source_revisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_language_proposals"
  ADD CONSTRAINT "source_language_proposals_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_operations"
  ADD CONSTRAINT "generation_operations_source_language_proposal_id_fkey"
  FOREIGN KEY ("source_language_proposal_id") REFERENCES "source_language_proposals"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
