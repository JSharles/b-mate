-- specs/015-document-reference-layer data-model.md § Migration.
-- Q1: a clean start on a development-only environment. This runs first so the
-- enum narrowing below cannot trip over a row still holding `processing`,
-- `ready_for_review` or `published` — values that no longer exist once a
-- document is only ever pending, absorbed or failed.
DELETE FROM "resources";


-- CreateEnum
CREATE TYPE "ReferenceDraftStatus" AS ENUM ('pending_review', 'awaiting_answers');

-- CreateEnum
CREATE TYPE "DraftTrigger" AS ENUM ('document_added', 'document_removed', 'regeneration_requested');

-- AlterEnum
BEGIN;
CREATE TYPE "ResourceStatus_new" AS ENUM ('pending', 'absorbed', 'failed');
ALTER TABLE "public"."resources" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "resources" ALTER COLUMN "status" TYPE "ResourceStatus_new" USING ("status"::text::"ResourceStatus_new");
ALTER TYPE "ResourceStatus" RENAME TO "ResourceStatus_old";
ALTER TYPE "ResourceStatus_new" RENAME TO "ResourceStatus";
DROP TYPE "public"."ResourceStatus_old";
ALTER TABLE "resources" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- DropForeignKey
ALTER TABLE "resource_sections" DROP CONSTRAINT "resource_sections_resource_id_fkey";

-- AlterTable
ALTER TABLE "resources" DROP COLUMN "published_at",
DROP COLUMN "published_by_user_id",
ALTER COLUMN "status" SET DEFAULT 'pending';

-- DropTable
DROP TABLE "resource_sections";

-- DropEnum
DROP TYPE "ResourceSectionStatus";

-- CreateTable
CREATE TABLE "category_extracts" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "category_key" "ResourceCategoryKey" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_extracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_references" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "category_key" "ResourceCategoryKey" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_reference_drafts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "category_key" "ResourceCategoryKey" NOT NULL,
    "status" "ReferenceDraftStatus" NOT NULL DEFAULT 'pending_review',
    "content" TEXT NOT NULL,
    "trigger" "DraftTrigger" NOT NULL,
    "trigger_resource_id" UUID,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "last_instruction" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_reference_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_contents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "category_key" "ResourceCategoryKey" NOT NULL,
    "content_en" TEXT NOT NULL,
    "content_fr" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_questions" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "rank" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_extracts_resource_id_category_key_key" ON "category_extracts"("resource_id", "category_key");

-- CreateIndex
CREATE UNIQUE INDEX "category_references_project_id_category_key_key" ON "category_references"("project_id", "category_key");

-- CreateIndex
CREATE UNIQUE INDEX "category_reference_drafts_project_id_category_key_key" ON "category_reference_drafts"("project_id", "category_key");

-- CreateIndex
CREATE UNIQUE INDEX "category_contents_project_id_category_key_key" ON "category_contents"("project_id", "category_key");

-- AddForeignKey
ALTER TABLE "category_extracts" ADD CONSTRAINT "category_extracts_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_references" ADD CONSTRAINT "category_references_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_reference_drafts" ADD CONSTRAINT "category_reference_drafts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_contents" ADD CONSTRAINT "category_contents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_questions" ADD CONSTRAINT "reference_questions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "category_reference_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

