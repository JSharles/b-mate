-- CreateEnum
CREATE TYPE "ReferenceDocumentStatus" AS ENUM ('writing', 'ready', 'superseded', 'failed');

-- CreateEnum
CREATE TYPE "ReferenceDocumentOutcome" AS ENUM ('written', 'nothing_usable');

-- AlterEnum
ALTER TYPE "GenerationOperationType" ADD VALUE 'reference_document';

-- AlterTable
ALTER TABLE "project_sources" ADD COLUMN     "active_reference_document_id" UUID,
ADD COLUMN     "reference_needs_rewrite" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" VARCHAR(8);

-- CreateTable
CREATE TABLE "reference_documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "generation_operation_id" UUID NOT NULL,
    "status" "ReferenceDocumentStatus" NOT NULL DEFAULT 'writing',
    "outcome" "ReferenceDocumentOutcome",
    "locale" VARCHAR(8) NOT NULL,
    "structured_content" JSONB,
    "failure_code" VARCHAR(128),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reference_documents_generation_operation_id_key" ON "reference_documents"("generation_operation_id");

-- CreateIndex
CREATE INDEX "reference_documents_project_id_status_created_at_idx" ON "reference_documents"("project_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_sources_active_reference_document_id_key" ON "project_sources"("active_reference_document_id");

-- AddForeignKey
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_active_reference_document_id_fkey" FOREIGN KEY ("active_reference_document_id") REFERENCES "reference_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_documents" ADD CONSTRAINT "reference_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_documents" ADD CONSTRAINT "reference_documents_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_documents" ADD CONSTRAINT "reference_documents_generation_operation_id_fkey" FOREIGN KEY ("generation_operation_id") REFERENCES "generation_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

