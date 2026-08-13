-- The reference document becomes the only account of a project's truth.
-- Everything the fact pipeline built — observations, information items,
-- revisions, provenance links, clarifications and contributor assertions —
-- is dropped here rather than migrated: there is nowhere to migrate it to.
--
-- The rows below go first because the schema changes underneath them cannot
-- run while they exist.

-- Section proposals were composed from a canonical source that no longer
-- exists, and so was everything published from them. The sections themselves
-- are the developer's own work and stay, each owed a fresh composition.
UPDATE "client_sections" SET "active_proposal_id" = NULL, "refresh_needed" = true;
UPDATE "project_client_publications" SET "current_release_id" = NULL;
UPDATE "generation_operations" SET "replaces_operation_id" = NULL, "current_attempt_id" = NULL;
DELETE FROM "generation_attempts";
DELETE FROM "generation_operations"
  WHERE "type" IN ('document_extraction', 'source_consolidation', 'section_composition', 'client_derivation');
DELETE FROM "client_content_release_entries";
DELETE FROM "client_section_contents";
DELETE FROM "client_content_releases";
DELETE FROM "section_questions";
DELETE FROM "section_proposals";

-- A document no longer has a pipeline behind it, so the in-flight statuses
-- have nowhere to land: whatever never reached the corpus is a failure the
-- developer re-uploads, and whatever was on its way out is out.
UPDATE "source_documents" SET "status" = 'removed'
  WHERE "status" IN ('removal_pending', 'removal_failed');
UPDATE "source_documents" SET "status" = 'failed'
  WHERE "status" IN ('extracting', 'ready_to_consolidate', 'incorporating', 'retrying');

-- AlterEnum
BEGIN;
CREATE TYPE "GenerationOperationType_new" AS ENUM ('reference_document', 'section_composition', 'client_derivation');
ALTER TABLE "generation_operations" ALTER COLUMN "type" TYPE "GenerationOperationType_new" USING ("type"::text::"GenerationOperationType_new");
ALTER TYPE "GenerationOperationType" RENAME TO "GenerationOperationType_old";
ALTER TYPE "GenerationOperationType_new" RENAME TO "GenerationOperationType";
DROP TYPE "public"."GenerationOperationType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SourceDocumentStatus_new" AS ENUM ('received', 'incorporated', 'failed', 'removed');
ALTER TABLE "public"."source_documents" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "source_documents" ALTER COLUMN "status" TYPE "SourceDocumentStatus_new" USING ("status"::text::"SourceDocumentStatus_new");
ALTER TYPE "SourceDocumentStatus" RENAME TO "SourceDocumentStatus_old";
ALTER TYPE "SourceDocumentStatus_new" RENAME TO "SourceDocumentStatus";
DROP TYPE "public"."SourceDocumentStatus_old";
ALTER TABLE "source_documents" ALTER COLUMN "status" SET DEFAULT 'received';
COMMIT;

-- DropForeignKey
ALTER TABLE "clarification_evidence" DROP CONSTRAINT "clarification_evidence_clarification_id_fkey";

-- DropForeignKey
ALTER TABLE "clarification_evidence" DROP CONSTRAINT "clarification_evidence_contributor_assertion_id_fkey";

-- DropForeignKey
ALTER TABLE "clarification_evidence" DROP CONSTRAINT "clarification_evidence_document_observation_id_fkey";

-- DropForeignKey
ALTER TABLE "clarification_items" DROP CONSTRAINT "clarification_items_clarification_id_fkey";

-- DropForeignKey
ALTER TABLE "clarification_items" DROP CONSTRAINT "clarification_items_information_item_id_fkey";

-- DropForeignKey
ALTER TABLE "clarification_resolutions" DROP CONSTRAINT "clarification_resolutions_answer_assertion_id_fkey";

-- DropForeignKey
ALTER TABLE "clarification_resolutions" DROP CONSTRAINT "clarification_resolutions_clarification_id_fkey";

-- DropForeignKey
ALTER TABLE "clarification_resolutions" DROP CONSTRAINT "clarification_resolutions_resolved_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "clarifications" DROP CONSTRAINT "clarifications_detected_in_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "clarifications" DROP CONSTRAINT "clarifications_project_source_id_fkey";

-- DropForeignKey
ALTER TABLE "clarifications" DROP CONSTRAINT "clarifications_resolved_in_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "contributor_assertions" DROP CONSTRAINT "contributor_assertions_applied_in_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "contributor_assertions" DROP CONSTRAINT "contributor_assertions_author_user_id_fkey";

-- DropForeignKey
ALTER TABLE "contributor_assertions" DROP CONSTRAINT "contributor_assertions_project_source_id_fkey";

-- DropForeignKey
ALTER TABLE "contributor_assertions" DROP CONSTRAINT "contributor_assertions_target_information_item_id_fkey";

-- DropForeignKey
ALTER TABLE "document_observations" DROP CONSTRAINT "document_observations_source_document_id_fkey";

-- DropForeignKey
ALTER TABLE "generation_operations" DROP CONSTRAINT "generation_operations_base_source_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "generation_operations" DROP CONSTRAINT "generation_operations_source_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "information_items" DROP CONSTRAINT "information_items_created_in_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "information_items" DROP CONSTRAINT "information_items_project_source_id_fkey";

-- DropForeignKey
ALTER TABLE "project_sources" DROP CONSTRAINT "project_sources_active_reference_document_id_fkey";

-- DropForeignKey
ALTER TABLE "project_sources" DROP CONSTRAINT "project_sources_current_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "project_sources" DROP CONSTRAINT "project_sources_project_id_fkey";

-- DropForeignKey
ALTER TABLE "provenance_links" DROP CONSTRAINT "provenance_links_contributor_assertion_id_fkey";

-- DropForeignKey
ALTER TABLE "provenance_links" DROP CONSTRAINT "provenance_links_document_observation_id_fkey";

-- DropForeignKey
ALTER TABLE "provenance_links" DROP CONSTRAINT "provenance_links_source_revision_item_id_fkey";

-- DropForeignKey
ALTER TABLE "reference_documents" DROP CONSTRAINT "reference_documents_source_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "section_proposals" DROP CONSTRAINT "section_proposals_source_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "section_question_items" DROP CONSTRAINT "section_question_items_information_item_id_fkey";

-- DropForeignKey
ALTER TABLE "section_question_items" DROP CONSTRAINT "section_question_items_question_id_fkey";

-- DropForeignKey
ALTER TABLE "section_questions" DROP CONSTRAINT "section_questions_answered_by_assertion_id_fkey";

-- DropForeignKey
ALTER TABLE "source_documents" DROP CONSTRAINT "source_documents_incorporated_in_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "source_documents" DROP CONSTRAINT "source_documents_removed_in_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revision_changes" DROP CONSTRAINT "source_revision_changes_after_revision_item_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revision_changes" DROP CONSTRAINT "source_revision_changes_before_revision_item_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revision_changes" DROP CONSTRAINT "source_revision_changes_cause_assertion_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revision_changes" DROP CONSTRAINT "source_revision_changes_cause_document_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revision_changes" DROP CONSTRAINT "source_revision_changes_information_item_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revision_changes" DROP CONSTRAINT "source_revision_changes_source_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revision_items" DROP CONSTRAINT "source_revision_items_information_item_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revision_items" DROP CONSTRAINT "source_revision_items_previous_revision_item_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revision_items" DROP CONSTRAINT "source_revision_items_source_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revisions" DROP CONSTRAINT "source_revisions_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revisions" DROP CONSTRAINT "source_revisions_parent_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revisions" DROP CONSTRAINT "source_revisions_project_source_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revisions" DROP CONSTRAINT "source_revisions_trigger_assertion_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revisions" DROP CONSTRAINT "source_revisions_trigger_clarification_id_fkey";

-- DropForeignKey
ALTER TABLE "source_revisions" DROP CONSTRAINT "source_revisions_trigger_document_id_fkey";

-- AlterTable
ALTER TABLE "generation_operations" DROP COLUMN "base_source_revision_id",
DROP COLUMN "source_revision_id";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "active_reference_document_id" UUID,
ADD COLUMN     "reference_needs_rewrite" BOOLEAN NOT NULL DEFAULT true;

-- The reference slot moves off project_sources, which this migration drops.
UPDATE "projects" SET
  "active_reference_document_id" = "s"."active_reference_document_id",
  "reference_needs_rewrite" = "s"."reference_needs_rewrite"
  FROM "project_sources" AS "s" WHERE "s"."project_id" = "projects"."id";

-- AlterTable
ALTER TABLE "reference_documents" DROP COLUMN "source_revision_id";

-- AlterTable
ALTER TABLE "section_proposals" DROP COLUMN "provenance_summary",
DROP COLUMN "source_revision_id",
ADD COLUMN     "reference_document_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "section_questions" DROP COLUMN "answered_by_assertion_id";

-- AlterTable
ALTER TABLE "source_documents" DROP COLUMN "incorporated_in_revision_id",
DROP COLUMN "removed_in_revision_id";

-- DropTable
DROP TABLE "clarification_evidence";

-- DropTable
DROP TABLE "clarification_items";

-- DropTable
DROP TABLE "clarification_resolutions";

-- DropTable
DROP TABLE "clarifications";

-- DropTable
DROP TABLE "contributor_assertions";

-- DropTable
DROP TABLE "document_observations";

-- DropTable
DROP TABLE "information_items";

-- DropTable
DROP TABLE "project_sources";

-- DropTable
DROP TABLE "provenance_links";

-- DropTable
DROP TABLE "section_question_items";

-- DropTable
DROP TABLE "source_revision_changes";

-- DropTable
DROP TABLE "source_revision_items";

-- DropTable
DROP TABLE "source_revisions";

-- DropEnum
DROP TYPE "ClarificationResolutionKind";

-- DropEnum
DROP TYPE "ClarificationStatus";

-- DropEnum
DROP TYPE "ContributorAssertionKind";

-- DropEnum
DROP TYPE "InformationItemKind";

-- DropEnum
DROP TYPE "InformationItemState";

-- DropEnum
DROP TYPE "ProvenanceRole";

-- DropEnum
DROP TYPE "RevisionChangeKind";

-- DropEnum
DROP TYPE "SourceRevisionTrigger";

-- CreateIndex
CREATE UNIQUE INDEX "projects_active_reference_document_id_key" ON "projects"("active_reference_document_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_active_reference_document_id_fkey" FOREIGN KEY ("active_reference_document_id") REFERENCES "reference_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_proposals" ADD CONSTRAINT "section_proposals_reference_document_id_fkey" FOREIGN KEY ("reference_document_id") REFERENCES "reference_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

