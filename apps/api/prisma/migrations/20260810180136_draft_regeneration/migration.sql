
-- AlterEnum
ALTER TYPE "ReferenceDraftStatus" ADD VALUE 'generating';

-- AlterTable
ALTER TABLE "category_reference_drafts" ADD COLUMN     "anthropic_batch_id" TEXT;

