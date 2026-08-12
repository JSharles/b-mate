-- AlterTable
ALTER TABLE "source_documents" ADD COLUMN "processing_started_at" TIMESTAMP(3);

-- Existing rows: the first run began when the document was added, which is
-- what the interface was already showing for them.
UPDATE "source_documents" SET "processing_started_at" = "created_at";
