-- CreateEnum
CREATE TYPE "SectionProposalStatus" AS ENUM ('composing', 'pending_review', 'approved', 'superseded', 'failed');

-- CreateEnum
CREATE TYPE "SectionProposalOutcome" AS ENUM ('composed', 'nothing_matched');

-- AlterEnum
ALTER TYPE "GenerationOperationType" ADD VALUE 'section_composition';

-- CreateTable
CREATE TABLE "client_sections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "instructions" TEXT NOT NULL,
    "length" "EditorialLength" NOT NULL,
    "pedagogy" "EditorialPedagogy" NOT NULL,
    "technical_familiarity" "ClientTechnicalFamiliarity" NOT NULL,
    "tone" "EditorialTone" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "refresh_needed" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "active_proposal_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_proposals" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "generation_operation_id" UUID NOT NULL,
    "status" "SectionProposalStatus" NOT NULL DEFAULT 'composing',
    "outcome" "SectionProposalOutcome",
    "structured_content" JSONB,
    "change_summary" TEXT,
    "provenance_summary" JSONB,
    "failure_code" VARCHAR(128),
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "section_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_questions" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "impact_explanation" TEXT NOT NULL,
    "answered_by_assertion_id" UUID,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "section_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_question_items" (
    "question_id" UUID NOT NULL,
    "information_item_id" UUID NOT NULL,

    CONSTRAINT "section_question_items_pkey" PRIMARY KEY ("question_id","information_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_sections_active_proposal_id_key" ON "client_sections"("active_proposal_id");

-- CreateIndex
CREATE INDEX "client_sections_project_id_archived_at_sort_order_idx" ON "client_sections"("project_id", "archived_at", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "section_proposals_generation_operation_id_key" ON "section_proposals"("generation_operation_id");

-- CreateIndex
CREATE INDEX "section_proposals_section_id_status_created_at_idx" ON "section_proposals"("section_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "section_questions_proposal_id_sort_order_idx" ON "section_questions"("proposal_id", "sort_order");

-- AddForeignKey
ALTER TABLE "client_sections" ADD CONSTRAINT "client_sections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_sections" ADD CONSTRAINT "client_sections_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_sections" ADD CONSTRAINT "client_sections_active_proposal_id_fkey" FOREIGN KEY ("active_proposal_id") REFERENCES "section_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_proposals" ADD CONSTRAINT "section_proposals_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "client_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_proposals" ADD CONSTRAINT "section_proposals_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_proposals" ADD CONSTRAINT "section_proposals_generation_operation_id_fkey" FOREIGN KEY ("generation_operation_id") REFERENCES "generation_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_proposals" ADD CONSTRAINT "section_proposals_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_questions" ADD CONSTRAINT "section_questions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "section_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_questions" ADD CONSTRAINT "section_questions_answered_by_assertion_id_fkey" FOREIGN KEY ("answered_by_assertion_id") REFERENCES "contributor_assertions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_question_items" ADD CONSTRAINT "section_question_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "section_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_question_items" ADD CONSTRAINT "section_question_items_information_item_id_fkey" FOREIGN KEY ("information_item_id") REFERENCES "information_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
