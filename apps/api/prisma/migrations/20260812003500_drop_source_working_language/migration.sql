-- AlterEnum
BEGIN;
CREATE TYPE "CategoryDraftTrigger_new" AS ENUM ('document_added', 'document_removed', 'clarification', 'guided_correction', 'catch_up', 'factual_correction');
ALTER TABLE "documentation_category_reference_drafts" ALTER COLUMN "trigger" TYPE "CategoryDraftTrigger_new" USING ("trigger"::text::"CategoryDraftTrigger_new");
ALTER TYPE "CategoryDraftTrigger" RENAME TO "CategoryDraftTrigger_old";
ALTER TYPE "CategoryDraftTrigger_new" RENAME TO "CategoryDraftTrigger";
DROP TYPE "public"."CategoryDraftTrigger_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "RevisionChangeKind_new" AS ENUM ('added', 'updated', 'confirmed', 'superseded', 'removed', 'provenance_added', 'provenance_removed', 'marked_open', 'resolved');
ALTER TABLE "source_revision_changes" ALTER COLUMN "kind" TYPE "RevisionChangeKind_new" USING ("kind"::text::"RevisionChangeKind_new");
ALTER TYPE "RevisionChangeKind" RENAME TO "RevisionChangeKind_old";
ALTER TYPE "RevisionChangeKind_new" RENAME TO "RevisionChangeKind";
DROP TYPE "public"."RevisionChangeKind_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SourceRevisionTrigger_new" AS ENUM ('document_added', 'document_removed', 'clarification_answered', 'guided_correction');
ALTER TABLE "source_revisions" ALTER COLUMN "trigger" TYPE "SourceRevisionTrigger_new" USING ("trigger"::text::"SourceRevisionTrigger_new");
ALTER TYPE "SourceRevisionTrigger" RENAME TO "SourceRevisionTrigger_old";
ALTER TYPE "SourceRevisionTrigger_new" RENAME TO "SourceRevisionTrigger";
DROP TYPE "public"."SourceRevisionTrigger_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "generation_operations" DROP CONSTRAINT "generation_operations_source_language_proposal_id_fkey";

-- DropForeignKey
ALTER TABLE "source_language_proposals" DROP CONSTRAINT "source_language_proposals_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "source_language_proposals" DROP CONSTRAINT "source_language_proposals_expected_source_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "source_language_proposals" DROP CONSTRAINT "source_language_proposals_project_source_id_fkey";

-- DropIndex
DROP INDEX "generation_operations_source_language_proposal_id_key";

-- AlterTable
ALTER TABLE "generation_operations" DROP COLUMN "source_language_proposal_id";

-- AlterTable
ALTER TABLE "project_sources" DROP COLUMN "working_language";

-- DropTable
DROP TABLE "source_language_proposals";

