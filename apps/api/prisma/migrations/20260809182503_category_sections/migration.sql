/*
  Warnings:

  - You are about to drop the `resource_categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `resource_category_assignments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `resource_vulgarizations` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ResourceCategoryKey" AS ENUM ('overview', 'how_it_works', 'planning', 'other');

-- CreateEnum
CREATE TYPE "ResourceSectionStatus" AS ENUM ('proposed', 'approved', 'rejected');

-- DropForeignKey
ALTER TABLE "resource_categories" DROP CONSTRAINT "resource_categories_project_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_category_assignments" DROP CONSTRAINT "resource_category_assignments_category_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_category_assignments" DROP CONSTRAINT "resource_category_assignments_resource_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_vulgarizations" DROP CONSTRAINT "resource_vulgarizations_resource_id_fkey";

-- DropTable
DROP TABLE "resource_categories";

-- DropTable
DROP TABLE "resource_category_assignments";

-- DropTable
DROP TABLE "resource_vulgarizations";

-- DropEnum
DROP TYPE "ResourceCategoryAssignmentStatus";

-- CreateTable
CREATE TABLE "resource_sections" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "category_key" "ResourceCategoryKey" NOT NULL,
    "status" "ResourceSectionStatus" NOT NULL DEFAULT 'proposed',
    "position" INTEGER NOT NULL,
    "titleEn" TEXT NOT NULL,
    "contentEn" TEXT NOT NULL,
    "titleFr" TEXT NOT NULL,
    "contentFr" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_sections_resource_id_category_key_key" ON "resource_sections"("resource_id", "category_key");

-- AddForeignKey
ALTER TABLE "resource_sections" ADD CONSTRAINT "resource_sections_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- specs/014-category-sections data-model.md § Migration, step 3.
-- Q3 chose a clean slate: the three tables dropped above held every existing
-- resource's readable content, so a resource that survives this migration has
-- none. Leaving such a resource at 'published' or 'ready_for_review' would
-- show its contributor something that looks healthy while showing the client
-- nothing at all — a silent empty state indistinguishable from a bug.
-- Marking them 'failed' with a reason surfaces what happened and what to do.
-- Uploaded originals are untouched; re-adding the document is the recovery
-- path.
UPDATE "resources"
SET "status" = 'failed',
    "failure_reason" = 'Processing model changed: this document predates per-category sections and has no readable content. Delete it and add it again to have it re-analysed.',
    "anthropic_batch_id" = NULL
WHERE "status" <> 'failed';
