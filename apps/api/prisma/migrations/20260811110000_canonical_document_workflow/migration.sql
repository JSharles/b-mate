-- Guarded additive replacement: this migration is legal only after the
-- approved reset has reached its terminal, audited state. The retained legacy
-- tables are compile-compatibility only and must remain empty.
DO $$
BEGIN
  -- Prisma reconstructs migrations in an isolated, automatically named shadow
  -- database. It cannot replay the operator-only reset, so only that exact
  -- ephemeral namespace bypasses the target-database readiness assertions.
  IF current_database() ~ '^prisma_migrate_shadow_db_' THEN
    RETURN;
  END IF;

  IF (SELECT COUNT(*) FROM "documentary_transition_states") <> 1 THEN
    RAISE EXCEPTION 'canonical documentary migration requires exactly one transition row';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "documentary_transition_states"
    WHERE "id" = 'documentary-transition'
      AND "mode" = 'canonical'
      AND "active_reset_run_id" IS NULL
      AND "canonicalized_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'canonical documentary migration requires terminal canonical transition';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "documentary_reset_runs"
    WHERE "feature_key" = '016-canonical-document-workflow'
      AND "status" = 'clean'
      AND "storage_failed_count" = 0
      AND "completed_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'canonical documentary migration requires a clean reset run';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "documentary_reset_items"
    WHERE "status" NOT IN ('deleted', 'already_absent')
  ) THEN
    RAISE EXCEPTION 'canonical documentary migration requires a clean reset manifest';
  END IF;

  IF (SELECT COUNT(*) FROM "reference_questions") <> 0
     OR (SELECT COUNT(*) FROM "category_reference_drafts") <> 0
     OR (SELECT COUNT(*) FROM "category_contents") <> 0
     OR (SELECT COUNT(*) FROM "category_references") <> 0
     OR (SELECT COUNT(*) FROM "category_extracts") <> 0
     OR (SELECT COUNT(*) FROM "resources") <> 0 THEN
    RAISE EXCEPTION 'canonical documentary migration requires empty legacy documentary tables';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "DocumentationCategoryKey" AS ENUM ('overview', 'how_it_works', 'planning', 'other');

-- CreateEnum
CREATE TYPE "SourceDocumentKind" AS ENUM ('upload', 'notion');

-- CreateEnum
CREATE TYPE "SourceDocumentStatus" AS ENUM ('received', 'extracting', 'ready_to_consolidate', 'incorporating', 'incorporated', 'retrying', 'failed', 'removal_pending', 'removal_failed', 'removed');

-- CreateEnum
CREATE TYPE "SourceRevisionTrigger" AS ENUM ('document_added', 'document_removed', 'clarification_answered', 'guided_correction', 'working_language_changed');

-- CreateEnum
CREATE TYPE "InformationItemKind" AS ENUM ('fact', 'decision', 'date', 'figure', 'constraint', 'explanation', 'open_point');

-- CreateEnum
CREATE TYPE "InformationItemState" AS ENUM ('confirmed', 'point_to_clarify');

-- CreateEnum
CREATE TYPE "RevisionChangeKind" AS ENUM ('added', 'updated', 'confirmed', 'superseded', 'removed', 'provenance_added', 'provenance_removed', 'translated', 'marked_open', 'resolved');

-- CreateEnum
CREATE TYPE "ProvenanceRole" AS ENUM ('supports', 'conflicts', 'supersedes', 'confirms');

-- CreateEnum
CREATE TYPE "ContributorAssertionKind" AS ENUM ('guided_correction', 'clarification_answer');

-- CreateEnum
CREATE TYPE "ClarificationStatus" AS ENUM ('open', 'left_open', 'answered', 'superseded');

-- CreateEnum
CREATE TYPE "ClarificationResolutionKind" AS ENUM ('answer', 'leave_open');

-- CreateEnum
CREATE TYPE "CategoryDraftStatus" AS ENUM ('generating', 'pending_review', 'correction_generating', 'accepted', 'discarded', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "CategoryDraftTrigger" AS ENUM ('document_added', 'document_removed', 'clarification', 'guided_correction', 'working_language_changed', 'catch_up', 'factual_correction');

-- CreateEnum
CREATE TYPE "CategoryDraftReviewKind" AS ENUM ('accept', 'discard', 'correction_requested');

-- CreateEnum
CREATE TYPE "EditorialLength" AS ENUM ('concise', 'balanced', 'detailed');

-- CreateEnum
CREATE TYPE "EditorialPedagogy" AS ENUM ('direct', 'guided', 'highly_explanatory');

-- CreateEnum
CREATE TYPE "ClientTechnicalFamiliarity" AS ENUM ('novice', 'informed', 'technical');

-- CreateEnum
CREATE TYPE "EditorialTone" AS ENUM ('reassuring', 'neutral', 'direct', 'formal');

-- CreateEnum
CREATE TYPE "EditorialProposalStatus" AS ENUM ('preview_pending', 'preview_ready', 'confirmed', 'cancelled', 'failed', 'expired', 'saved_without_preview');

-- CreateEnum
CREATE TYPE "ClientReleaseReason" AS ENUM ('category_acceptance', 'editorial_profile_change', 'category_removal');

-- CreateEnum
CREATE TYPE "ClientReleaseStatus" AS ENUM ('queued', 'preparing', 'validating', 'ready', 'published', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "GenerationOperationType" AS ENUM ('document_extraction', 'source_consolidation', 'factual_drafting', 'editorial_preview', 'client_derivation', 'output_validation');

-- CreateEnum
CREATE TYPE "GenerationOperationStatus" AS ENUM ('queued', 'running', 'waiting_provider', 'retry_scheduled', 'succeeded', 'needs_attention', 'cancelled', 'superseded');

-- CreateEnum
CREATE TYPE "GenerationTransport" AS ENUM ('sync', 'batch');

-- CreateEnum
CREATE TYPE "GenerationAttemptStatus" AS ENUM ('submitting', 'submitted', 'polling', 'succeeded', 'failed', 'invalid_output', 'abandoned_unknown', 'cancelled');

-- CreateEnum
CREATE TYPE "GenerationErrorClass" AS ENUM ('transient', 'rate_limited', 'credit_exhausted', 'model_unavailable', 'invalid_request', 'input_unprocessable', 'invalid_output', 'provider_terminal', 'policy_denied', 'unknown');

-- CreateTable
CREATE TABLE "project_sources" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "working_language" "ProjectLanguage" NOT NULL DEFAULT 'en',
    "current_revision_id" UUID,
    "next_sequence" INTEGER NOT NULL DEFAULT 1,
    "lock_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_revisions" (
    "id" UUID NOT NULL,
    "project_source_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "parent_revision_id" UUID,
    "trigger" "SourceRevisionTrigger" NOT NULL,
    "trigger_document_id" UUID,
    "trigger_clarification_id" UUID,
    "trigger_assertion_id" UUID,
    "created_by_user_id" UUID,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_revision_impacts" (
    "source_revision_id" UUID NOT NULL,
    "category_key" "DocumentationCategoryKey" NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "source_revision_impacts_pkey" PRIMARY KEY ("source_revision_id","category_key")
);

-- CreateTable
CREATE TABLE "information_items" (
    "id" UUID NOT NULL,
    "project_source_id" UUID NOT NULL,
    "created_in_revision_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "information_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_revision_items" (
    "id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "information_item_id" UUID NOT NULL,
    "previous_revision_item_id" UUID,
    "kind" "InformationItemKind" NOT NULL,
    "state" "InformationItemState" NOT NULL,
    "content" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "source_revision_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_revision_item_categories" (
    "source_revision_item_id" UUID NOT NULL,
    "category_key" "DocumentationCategoryKey" NOT NULL,

    CONSTRAINT "source_revision_item_categories_pkey" PRIMARY KEY ("source_revision_item_id","category_key")
);

-- CreateTable
CREATE TABLE "source_revision_changes" (
    "id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "information_item_id" UUID NOT NULL,
    "kind" "RevisionChangeKind" NOT NULL,
    "before_revision_item_id" UUID,
    "after_revision_item_id" UUID,
    "cause_document_id" UUID,
    "cause_assertion_id" UUID,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "source_revision_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "SourceDocumentKind" NOT NULL,
    "status" "SourceDocumentStatus" NOT NULL DEFAULT 'received',
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "original_file_name" TEXT,
    "original_mime_type" TEXT,
    "original_size_bytes" INTEGER,
    "stored_object_key" TEXT,
    "external_url" TEXT,
    "content_sha256" VARCHAR(64),
    "added_by_user_id" UUID NOT NULL,
    "incorporated_in_revision_id" UUID,
    "removed_in_revision_id" UUID,
    "failure_code" VARCHAR(128),
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_observations" (
    "id" UUID NOT NULL,
    "source_document_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "InformationItemKind" NOT NULL,
    "original_excerpt" TEXT,
    "normalized_content" TEXT NOT NULL,
    "source_language" VARCHAR(16),
    "locator" JSONB,
    "exact_content_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_observation_categories" (
    "document_observation_id" UUID NOT NULL,
    "category_key" "DocumentationCategoryKey" NOT NULL,

    CONSTRAINT "document_observation_categories_pkey" PRIMARY KEY ("document_observation_id","category_key")
);

-- CreateTable
CREATE TABLE "contributor_assertions" (
    "id" UUID NOT NULL,
    "project_source_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "kind" "ContributorAssertionKind" NOT NULL,
    "target_information_item_id" UUID,
    "content" TEXT NOT NULL,
    "reason" TEXT,
    "applied_in_revision_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributor_assertions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provenance_links" (
    "id" UUID NOT NULL,
    "source_revision_item_id" UUID NOT NULL,
    "document_observation_id" UUID,
    "contributor_assertion_id" UUID,
    "role" "ProvenanceRole" NOT NULL,

    CONSTRAINT "provenance_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clarifications" (
    "id" UUID NOT NULL,
    "project_source_id" UUID NOT NULL,
    "detected_in_revision_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "impact_rank" INTEGER NOT NULL,
    "impact_explanation" TEXT NOT NULL,
    "status" "ClarificationStatus" NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolved_in_revision_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clarifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clarification_items" (
    "clarification_id" UUID NOT NULL,
    "information_item_id" UUID NOT NULL,

    CONSTRAINT "clarification_items_pkey" PRIMARY KEY ("clarification_id","information_item_id")
);

-- CreateTable
CREATE TABLE "clarification_evidence" (
    "id" UUID NOT NULL,
    "clarification_id" UUID NOT NULL,
    "document_observation_id" UUID,
    "contributor_assertion_id" UUID,

    CONSTRAINT "clarification_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clarification_resolutions" (
    "id" UUID NOT NULL,
    "clarification_id" UUID NOT NULL,
    "kind" "ClarificationResolutionKind" NOT NULL,
    "answer_assertion_id" UUID,
    "resolved_by_user_id" UUID NOT NULL,
    "expected_clarification_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clarification_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_projection_states" (
    "project_id" UUID NOT NULL,
    "category_key" "DocumentationCategoryKey" NOT NULL,
    "target_source_revision_id" UUID,
    "active_draft_id" UUID,
    "validated_reference_id" UUID,
    "last_reviewed_source_revision_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_projection_states_pkey" PRIMARY KEY ("project_id","category_key")
);

-- CreateTable
CREATE TABLE "documentation_category_reference_drafts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "category_key" "DocumentationCategoryKey" NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "parent_draft_id" UUID,
    "generation_operation_id" UUID NOT NULL,
    "status" "CategoryDraftStatus" NOT NULL DEFAULT 'generating',
    "trigger" "CategoryDraftTrigger" NOT NULL,
    "structured_content" JSONB,
    "change_summary" TEXT,
    "provenance_summary" JSONB,
    "failure_code" VARCHAR(128),
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentation_category_reference_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_draft_reviews" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "kind" "CategoryDraftReviewKind" NOT NULL,
    "instruction" TEXT,
    "routing_code" VARCHAR(128),
    "reviewed_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_draft_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentation_category_references" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "category_key" "DocumentationCategoryKey" NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "accepted_draft_id" UUID NOT NULL,
    "structured_content" JSONB NOT NULL,
    "accepted_by_user_id" UUID NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentation_category_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_editorial_settings" (
    "project_id" UUID NOT NULL,
    "current_profile_revision_id" UUID,
    "active_proposal_id" UUID,
    "next_sequence" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_editorial_settings_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "editorial_profile_revisions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "length" "EditorialLength" NOT NULL,
    "pedagogy" "EditorialPedagogy" NOT NULL,
    "technical_familiarity" "ClientTechnicalFamiliarity" NOT NULL,
    "tone" "EditorialTone" NOT NULL,
    "guidance" TEXT,
    "confirmed_by_user_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editorial_profile_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_profile_proposals" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "base_profile_revision_id" UUID,
    "status" "EditorialProposalStatus" NOT NULL DEFAULT 'preview_pending',
    "length" "EditorialLength" NOT NULL,
    "pedagogy" "EditorialPedagogy" NOT NULL,
    "technical_familiarity" "ClientTechnicalFamiliarity" NOT NULL,
    "tone" "EditorialTone" NOT NULL,
    "guidance" TEXT,
    "representative_category_reference_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editorial_profile_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_previews" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "before_content_id" UUID,
    "after_content_id" UUID,
    "generation_operation_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editorial_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_category_contents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "category_key" "DocumentationCategoryKey" NOT NULL,
    "category_reference_id" UUID NOT NULL,
    "editorial_profile_revision_id" UUID NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "output_contract_version" VARCHAR(64) NOT NULL,
    "structured_content" JSONB NOT NULL,
    "validation_operation_id" UUID,
    "validation_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_category_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_content_releases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "base_release_id" UUID,
    "profile_revision_id" UUID NOT NULL,
    "reason" "ClientReleaseReason" NOT NULL,
    "status" "ClientReleaseStatus" NOT NULL DEFAULT 'queued',
    "expected_category_count" INTEGER NOT NULL,
    "initiating_reference_id" UUID,
    "ready_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_content_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_content_release_entries" (
    "release_id" UUID NOT NULL,
    "category_key" "DocumentationCategoryKey" NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "client_category_content_id" UUID NOT NULL,

    CONSTRAINT "client_content_release_entries_pkey" PRIMARY KEY ("release_id","category_key","locale")
);

-- CreateTable
CREATE TABLE "project_client_publications" (
    "project_id" UUID NOT NULL,
    "current_release_id" UUID,
    "next_sequence" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_client_publications_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "generation_operations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" "GenerationOperationType" NOT NULL,
    "deduplication_key" TEXT NOT NULL,
    "input_fingerprint" VARCHAR(64) NOT NULL,
    "source_document_id" UUID,
    "base_source_revision_id" UUID,
    "source_revision_id" UUID,
    "category_reference_id" UUID,
    "profile_proposal_id" UUID,
    "profile_revision_id" UUID,
    "client_release_id" UUID,
    "client_category_content_id" UUID,
    "prompt_version" VARCHAR(64) NOT NULL,
    "output_contract_version" VARCHAR(64) NOT NULL,
    "policy_snapshot" JSONB NOT NULL,
    "status" "GenerationOperationStatus" NOT NULL DEFAULT 'queued',
    "current_route_index" INTEGER NOT NULL DEFAULT 0,
    "current_attempt_id" UUID,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_owner" VARCHAR(128),
    "lease_expires_at" TIMESTAMP(3),
    "terminal_failure_code" VARCHAR(128),
    "replaces_operation_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_attempts" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "route_index" INTEGER NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "transport" "GenerationTransport" NOT NULL,
    "status" "GenerationAttemptStatus" NOT NULL DEFAULT 'submitting',
    "provider_correlation_id" VARCHAR(255),
    "provider_request_id" VARCHAR(255),
    "provider_job_id" VARCHAR(255),
    "error_class" "GenerationErrorClass",
    "error_code" VARCHAR(128),
    "error_http_status" INTEGER,
    "retryable" BOOLEAN,
    "protected_diagnostic" VARCHAR(2000),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cache_read_tokens" INTEGER,
    "cache_write_tokens" INTEGER,
    "raw_usage" JSONB,
    "estimated_cost_micros" BIGINT,
    "pricing_snapshot" JSONB,
    "pricing_version" VARCHAR(64),
    "next_poll_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "terminal_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_sources_project_id_key" ON "project_sources"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_sources_current_revision_id_key" ON "project_sources"("current_revision_id");

-- CreateIndex
CREATE INDEX "source_revisions_project_source_id_created_at_idx" ON "source_revisions"("project_source_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "source_revisions_project_source_id_sequence_key" ON "source_revisions"("project_source_id", "sequence");

-- CreateIndex
CREATE INDEX "information_items_project_source_id_idx" ON "information_items"("project_source_id");

-- CreateIndex
CREATE INDEX "source_revision_items_source_revision_id_sort_order_idx" ON "source_revision_items"("source_revision_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "source_revision_items_source_revision_id_information_item_i_key" ON "source_revision_items"("source_revision_id", "information_item_id");

-- CreateIndex
CREATE INDEX "source_revision_changes_source_revision_id_idx" ON "source_revision_changes"("source_revision_id");

-- CreateIndex
CREATE INDEX "source_documents_project_id_status_created_at_idx" ON "source_documents"("project_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "source_documents_project_id_content_sha256_idx" ON "source_documents"("project_id", "content_sha256");

-- CreateIndex
CREATE INDEX "document_observations_exact_content_hash_idx" ON "document_observations"("exact_content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "document_observations_source_document_id_sequence_key" ON "document_observations"("source_document_id", "sequence");

-- CreateIndex
CREATE INDEX "contributor_assertions_project_source_id_created_at_idx" ON "contributor_assertions"("project_source_id", "created_at");

-- CreateIndex
CREATE INDEX "provenance_links_source_revision_item_id_role_idx" ON "provenance_links"("source_revision_item_id", "role");

-- CreateIndex
CREATE INDEX "clarifications_project_source_id_status_impact_rank_created_idx" ON "clarifications"("project_source_id", "status", "impact_rank", "created_at");

-- CreateIndex
CREATE INDEX "clarification_evidence_clarification_id_idx" ON "clarification_evidence"("clarification_id");

-- CreateIndex
CREATE INDEX "clarification_resolutions_clarification_id_created_at_idx" ON "clarification_resolutions"("clarification_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "category_projection_states_active_draft_id_key" ON "category_projection_states"("active_draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_projection_states_validated_reference_id_key" ON "category_projection_states"("validated_reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "documentation_category_reference_drafts_generation_operatio_key" ON "documentation_category_reference_drafts"("generation_operation_id");

-- CreateIndex
CREATE INDEX "documentation_category_reference_drafts_project_id_category_idx" ON "documentation_category_reference_drafts"("project_id", "category_key", "status", "created_at");

-- CreateIndex
CREATE INDEX "category_draft_reviews_draft_id_created_at_idx" ON "category_draft_reviews"("draft_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "documentation_category_references_accepted_draft_id_key" ON "documentation_category_references"("accepted_draft_id");

-- CreateIndex
CREATE INDEX "documentation_category_references_project_id_category_key_a_idx" ON "documentation_category_references"("project_id", "category_key", "accepted_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_editorial_settings_current_profile_revision_id_key" ON "project_editorial_settings"("current_profile_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_editorial_settings_active_proposal_id_key" ON "project_editorial_settings"("active_proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_profile_revisions_project_id_sequence_key" ON "editorial_profile_revisions"("project_id", "sequence");

-- CreateIndex
CREATE INDEX "editorial_profile_proposals_project_id_status_created_at_idx" ON "editorial_profile_proposals"("project_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_previews_proposal_id_key" ON "editorial_previews"("proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_previews_after_content_id_key" ON "editorial_previews"("after_content_id");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_previews_generation_operation_id_key" ON "editorial_previews"("generation_operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_category_contents_validation_operation_id_key" ON "client_category_contents"("validation_operation_id");

-- CreateIndex
CREATE INDEX "client_category_contents_project_id_category_key_locale_idx" ON "client_category_contents"("project_id", "category_key", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "client_category_contents_category_reference_id_editorial_pr_key" ON "client_category_contents"("category_reference_id", "editorial_profile_revision_id", "locale", "output_contract_version");

-- CreateIndex
CREATE INDEX "client_content_releases_project_id_status_created_at_idx" ON "client_content_releases"("project_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_content_releases_project_id_sequence_key" ON "client_content_releases"("project_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "project_client_publications_current_release_id_key" ON "project_client_publications"("current_release_id");

-- CreateIndex
CREATE UNIQUE INDEX "generation_operations_deduplication_key_key" ON "generation_operations"("deduplication_key");

-- CreateIndex
CREATE UNIQUE INDEX "generation_operations_current_attempt_id_key" ON "generation_operations"("current_attempt_id");

-- CreateIndex
CREATE INDEX "generation_operations_status_run_after_lease_expires_at_idx" ON "generation_operations"("status", "run_after", "lease_expires_at");

-- CreateIndex
CREATE INDEX "generation_operations_project_id_type_created_at_idx" ON "generation_operations"("project_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "generation_attempts_status_next_poll_at_idx" ON "generation_attempts"("status", "next_poll_at");

-- CreateIndex
CREATE UNIQUE INDEX "generation_attempts_operation_id_ordinal_key" ON "generation_attempts"("operation_id", "ordinal");

-- AddForeignKey
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "source_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revisions" ADD CONSTRAINT "source_revisions_project_source_id_fkey" FOREIGN KEY ("project_source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revisions" ADD CONSTRAINT "source_revisions_parent_revision_id_fkey" FOREIGN KEY ("parent_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revisions" ADD CONSTRAINT "source_revisions_trigger_document_id_fkey" FOREIGN KEY ("trigger_document_id") REFERENCES "source_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revisions" ADD CONSTRAINT "source_revisions_trigger_clarification_id_fkey" FOREIGN KEY ("trigger_clarification_id") REFERENCES "clarifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revisions" ADD CONSTRAINT "source_revisions_trigger_assertion_id_fkey" FOREIGN KEY ("trigger_assertion_id") REFERENCES "contributor_assertions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revisions" ADD CONSTRAINT "source_revisions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_impacts" ADD CONSTRAINT "source_revision_impacts_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "source_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "information_items" ADD CONSTRAINT "information_items_project_source_id_fkey" FOREIGN KEY ("project_source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "information_items" ADD CONSTRAINT "information_items_created_in_revision_id_fkey" FOREIGN KEY ("created_in_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_items" ADD CONSTRAINT "source_revision_items_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "source_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_items" ADD CONSTRAINT "source_revision_items_information_item_id_fkey" FOREIGN KEY ("information_item_id") REFERENCES "information_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_items" ADD CONSTRAINT "source_revision_items_previous_revision_item_id_fkey" FOREIGN KEY ("previous_revision_item_id") REFERENCES "source_revision_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_item_categories" ADD CONSTRAINT "source_revision_item_categories_source_revision_item_id_fkey" FOREIGN KEY ("source_revision_item_id") REFERENCES "source_revision_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_changes" ADD CONSTRAINT "source_revision_changes_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "source_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_changes" ADD CONSTRAINT "source_revision_changes_information_item_id_fkey" FOREIGN KEY ("information_item_id") REFERENCES "information_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_changes" ADD CONSTRAINT "source_revision_changes_before_revision_item_id_fkey" FOREIGN KEY ("before_revision_item_id") REFERENCES "source_revision_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_changes" ADD CONSTRAINT "source_revision_changes_after_revision_item_id_fkey" FOREIGN KEY ("after_revision_item_id") REFERENCES "source_revision_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_changes" ADD CONSTRAINT "source_revision_changes_cause_document_id_fkey" FOREIGN KEY ("cause_document_id") REFERENCES "source_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_revision_changes" ADD CONSTRAINT "source_revision_changes_cause_assertion_id_fkey" FOREIGN KEY ("cause_assertion_id") REFERENCES "contributor_assertions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_incorporated_in_revision_id_fkey" FOREIGN KEY ("incorporated_in_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_removed_in_revision_id_fkey" FOREIGN KEY ("removed_in_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_observations" ADD CONSTRAINT "document_observations_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_observation_categories" ADD CONSTRAINT "document_observation_categories_document_observation_id_fkey" FOREIGN KEY ("document_observation_id") REFERENCES "document_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributor_assertions" ADD CONSTRAINT "contributor_assertions_project_source_id_fkey" FOREIGN KEY ("project_source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributor_assertions" ADD CONSTRAINT "contributor_assertions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributor_assertions" ADD CONSTRAINT "contributor_assertions_target_information_item_id_fkey" FOREIGN KEY ("target_information_item_id") REFERENCES "information_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributor_assertions" ADD CONSTRAINT "contributor_assertions_applied_in_revision_id_fkey" FOREIGN KEY ("applied_in_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provenance_links" ADD CONSTRAINT "provenance_links_source_revision_item_id_fkey" FOREIGN KEY ("source_revision_item_id") REFERENCES "source_revision_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provenance_links" ADD CONSTRAINT "provenance_links_document_observation_id_fkey" FOREIGN KEY ("document_observation_id") REFERENCES "document_observations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provenance_links" ADD CONSTRAINT "provenance_links_contributor_assertion_id_fkey" FOREIGN KEY ("contributor_assertion_id") REFERENCES "contributor_assertions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_project_source_id_fkey" FOREIGN KEY ("project_source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_detected_in_revision_id_fkey" FOREIGN KEY ("detected_in_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_resolved_in_revision_id_fkey" FOREIGN KEY ("resolved_in_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_items" ADD CONSTRAINT "clarification_items_clarification_id_fkey" FOREIGN KEY ("clarification_id") REFERENCES "clarifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_items" ADD CONSTRAINT "clarification_items_information_item_id_fkey" FOREIGN KEY ("information_item_id") REFERENCES "information_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_evidence" ADD CONSTRAINT "clarification_evidence_clarification_id_fkey" FOREIGN KEY ("clarification_id") REFERENCES "clarifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_evidence" ADD CONSTRAINT "clarification_evidence_document_observation_id_fkey" FOREIGN KEY ("document_observation_id") REFERENCES "document_observations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_evidence" ADD CONSTRAINT "clarification_evidence_contributor_assertion_id_fkey" FOREIGN KEY ("contributor_assertion_id") REFERENCES "contributor_assertions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_resolutions" ADD CONSTRAINT "clarification_resolutions_clarification_id_fkey" FOREIGN KEY ("clarification_id") REFERENCES "clarifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_resolutions" ADD CONSTRAINT "clarification_resolutions_answer_assertion_id_fkey" FOREIGN KEY ("answer_assertion_id") REFERENCES "contributor_assertions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_resolutions" ADD CONSTRAINT "clarification_resolutions_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_projection_states" ADD CONSTRAINT "category_projection_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_projection_states" ADD CONSTRAINT "category_projection_states_target_source_revision_id_fkey" FOREIGN KEY ("target_source_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_projection_states" ADD CONSTRAINT "category_projection_states_active_draft_id_fkey" FOREIGN KEY ("active_draft_id") REFERENCES "documentation_category_reference_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_projection_states" ADD CONSTRAINT "category_projection_states_validated_reference_id_fkey" FOREIGN KEY ("validated_reference_id") REFERENCES "documentation_category_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_projection_states" ADD CONSTRAINT "category_projection_states_last_reviewed_source_revision_i_fkey" FOREIGN KEY ("last_reviewed_source_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_category_reference_drafts" ADD CONSTRAINT "documentation_category_reference_drafts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_category_reference_drafts" ADD CONSTRAINT "documentation_category_reference_drafts_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_category_reference_drafts" ADD CONSTRAINT "documentation_category_reference_drafts_parent_draft_id_fkey" FOREIGN KEY ("parent_draft_id") REFERENCES "documentation_category_reference_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_category_reference_drafts" ADD CONSTRAINT "documentation_category_reference_drafts_generation_operati_fkey" FOREIGN KEY ("generation_operation_id") REFERENCES "generation_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_draft_reviews" ADD CONSTRAINT "category_draft_reviews_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "documentation_category_reference_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_draft_reviews" ADD CONSTRAINT "category_draft_reviews_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_category_references" ADD CONSTRAINT "documentation_category_references_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_category_references" ADD CONSTRAINT "documentation_category_references_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_category_references" ADD CONSTRAINT "documentation_category_references_accepted_draft_id_fkey" FOREIGN KEY ("accepted_draft_id") REFERENCES "documentation_category_reference_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_category_references" ADD CONSTRAINT "documentation_category_references_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_editorial_settings" ADD CONSTRAINT "project_editorial_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_editorial_settings" ADD CONSTRAINT "project_editorial_settings_current_profile_revision_id_fkey" FOREIGN KEY ("current_profile_revision_id") REFERENCES "editorial_profile_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_editorial_settings" ADD CONSTRAINT "project_editorial_settings_active_proposal_id_fkey" FOREIGN KEY ("active_proposal_id") REFERENCES "editorial_profile_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_profile_revisions" ADD CONSTRAINT "editorial_profile_revisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_editorial_settings"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_profile_revisions" ADD CONSTRAINT "editorial_profile_revisions_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_profile_proposals" ADD CONSTRAINT "editorial_profile_proposals_project_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_profile_proposals" ADD CONSTRAINT "editorial_profile_proposals_settings_fkey" FOREIGN KEY ("project_id") REFERENCES "project_editorial_settings"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_profile_proposals" ADD CONSTRAINT "editorial_profile_proposals_base_profile_revision_id_fkey" FOREIGN KEY ("base_profile_revision_id") REFERENCES "editorial_profile_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_profile_proposals" ADD CONSTRAINT "editorial_profile_proposals_representative_category_refere_fkey" FOREIGN KEY ("representative_category_reference_id") REFERENCES "documentation_category_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_profile_proposals" ADD CONSTRAINT "editorial_profile_proposals_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_previews" ADD CONSTRAINT "editorial_previews_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "editorial_profile_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_previews" ADD CONSTRAINT "editorial_previews_before_content_id_fkey" FOREIGN KEY ("before_content_id") REFERENCES "client_category_contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_previews" ADD CONSTRAINT "editorial_previews_after_content_id_fkey" FOREIGN KEY ("after_content_id") REFERENCES "client_category_contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_previews" ADD CONSTRAINT "editorial_previews_generation_operation_id_fkey" FOREIGN KEY ("generation_operation_id") REFERENCES "generation_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_category_contents" ADD CONSTRAINT "client_category_contents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_category_contents" ADD CONSTRAINT "client_category_contents_category_reference_id_fkey" FOREIGN KEY ("category_reference_id") REFERENCES "documentation_category_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_category_contents" ADD CONSTRAINT "client_category_contents_editorial_profile_revision_id_fkey" FOREIGN KEY ("editorial_profile_revision_id") REFERENCES "editorial_profile_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_category_contents" ADD CONSTRAINT "client_category_contents_validation_operation_id_fkey" FOREIGN KEY ("validation_operation_id") REFERENCES "generation_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_releases" ADD CONSTRAINT "client_content_releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_releases" ADD CONSTRAINT "client_content_releases_base_release_id_fkey" FOREIGN KEY ("base_release_id") REFERENCES "client_content_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_releases" ADD CONSTRAINT "client_content_releases_profile_revision_id_fkey" FOREIGN KEY ("profile_revision_id") REFERENCES "editorial_profile_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_releases" ADD CONSTRAINT "client_content_releases_initiating_reference_id_fkey" FOREIGN KEY ("initiating_reference_id") REFERENCES "documentation_category_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_release_entries" ADD CONSTRAINT "client_content_release_entries_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "client_content_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_release_entries" ADD CONSTRAINT "client_content_release_entries_client_category_content_id_fkey" FOREIGN KEY ("client_category_content_id") REFERENCES "client_category_contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_client_publications" ADD CONSTRAINT "project_client_publications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_client_publications" ADD CONSTRAINT "project_client_publications_current_release_id_fkey" FOREIGN KEY ("current_release_id") REFERENCES "client_content_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_base_source_revision_id_fkey" FOREIGN KEY ("base_source_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "source_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_category_reference_id_fkey" FOREIGN KEY ("category_reference_id") REFERENCES "documentation_category_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_profile_proposal_id_fkey" FOREIGN KEY ("profile_proposal_id") REFERENCES "editorial_profile_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_profile_revision_id_fkey" FOREIGN KEY ("profile_revision_id") REFERENCES "editorial_profile_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_client_release_id_fkey" FOREIGN KEY ("client_release_id") REFERENCES "client_content_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_client_category_content_id_fkey" FOREIGN KEY ("client_category_content_id") REFERENCES "client_category_contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_current_attempt_id_fkey" FOREIGN KEY ("current_attempt_id") REFERENCES "generation_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_replaces_operation_id_fkey" FOREIGN KEY ("replaces_operation_id") REFERENCES "generation_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "generation_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain checks that Prisma cannot express.
ALTER TABLE "project_sources"
  ADD CONSTRAINT "project_sources_next_sequence_check" CHECK ("next_sequence" > 0),
  ADD CONSTRAINT "project_sources_lock_version_check" CHECK ("lock_version" > 0);

ALTER TABLE "source_revisions"
  ADD CONSTRAINT "source_revisions_sequence_check" CHECK ("sequence" > 0),
  ADD CONSTRAINT "source_revisions_summary_check" CHECK (length(trim("summary")) > 0);

ALTER TABLE "source_revision_items"
  ADD CONSTRAINT "source_revision_items_content_check" CHECK (length(trim("content")) > 0),
  ADD CONSTRAINT "source_revision_items_sort_order_check" CHECK ("sort_order" >= 0);

ALTER TABLE "source_documents"
  ADD CONSTRAINT "source_documents_size_check" CHECK ("original_size_bytes" IS NULL OR "original_size_bytes" >= 0),
  ADD CONSTRAINT "source_documents_hash_check" CHECK ("content_sha256" IS NULL OR "content_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "source_documents_kind_metadata_check" CHECK (
    ("kind" = 'upload' AND "original_file_name" IS NOT NULL AND "original_mime_type" IS NOT NULL AND "original_size_bytes" IS NOT NULL AND "stored_object_key" IS NOT NULL AND "external_url" IS NULL)
    OR
    ("kind" = 'notion' AND "external_url" IS NOT NULL AND "stored_object_key" IS NOT NULL)
  );

ALTER TABLE "document_observations"
  ADD CONSTRAINT "document_observations_sequence_check" CHECK ("sequence" > 0),
  ADD CONSTRAINT "document_observations_content_check" CHECK (length(trim("normalized_content")) > 0),
  ADD CONSTRAINT "document_observations_hash_check" CHECK ("exact_content_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "provenance_links"
  ADD CONSTRAINT "provenance_links_origin_xor_check" CHECK (
    ("document_observation_id" IS NULL) <> ("contributor_assertion_id" IS NULL)
  );

ALTER TABLE "clarifications"
  ADD CONSTRAINT "clarifications_question_check" CHECK (length(trim("question")) > 0),
  ADD CONSTRAINT "clarifications_impact_rank_check" CHECK ("impact_rank" > 0),
  ADD CONSTRAINT "clarifications_version_check" CHECK ("version" > 0);

ALTER TABLE "clarification_evidence"
  ADD CONSTRAINT "clarification_evidence_origin_xor_check" CHECK (
    ("document_observation_id" IS NULL) <> ("contributor_assertion_id" IS NULL)
  );

ALTER TABLE "clarification_resolutions"
  ADD CONSTRAINT "clarification_resolutions_answer_check" CHECK (
    ("kind" = 'answer' AND "answer_assertion_id" IS NOT NULL)
    OR ("kind" = 'leave_open' AND "answer_assertion_id" IS NULL)
  );

ALTER TABLE "category_projection_states"
  ADD CONSTRAINT "category_projection_states_version_check" CHECK ("version" > 0);

ALTER TABLE "documentation_category_reference_drafts"
  ADD CONSTRAINT "documentation_category_reference_drafts_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "documentation_category_reference_drafts_failed_content_check" CHECK ("status" <> 'failed' OR "structured_content" IS NULL);

ALTER TABLE "project_editorial_settings"
  ADD CONSTRAINT "project_editorial_settings_sequence_check" CHECK ("next_sequence" > 0),
  ADD CONSTRAINT "project_editorial_settings_version_check" CHECK ("version" > 0);

ALTER TABLE "editorial_profile_revisions"
  ADD CONSTRAINT "editorial_profile_revisions_sequence_check" CHECK ("sequence" > 0),
  ADD CONSTRAINT "editorial_profile_revisions_guidance_check" CHECK ("guidance" IS NULL OR length("guidance") <= 2000);

ALTER TABLE "editorial_profile_proposals"
  ADD CONSTRAINT "editorial_profile_proposals_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "editorial_profile_proposals_guidance_check" CHECK ("guidance" IS NULL OR length("guidance") <= 2000);

ALTER TABLE "client_content_releases"
  ADD CONSTRAINT "client_content_releases_sequence_check" CHECK ("sequence" > 0),
  ADD CONSTRAINT "client_content_releases_expected_count_check" CHECK ("expected_category_count" BETWEEN 0 AND 4);

ALTER TABLE "project_client_publications"
  ADD CONSTRAINT "project_client_publications_sequence_check" CHECK ("next_sequence" > 0),
  ADD CONSTRAINT "project_client_publications_version_check" CHECK ("version" > 0);

ALTER TABLE "generation_operations"
  ADD CONSTRAINT "generation_operations_fingerprint_check" CHECK ("input_fingerprint" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "generation_operations_route_index_check" CHECK ("current_route_index" >= 0);

ALTER TABLE "generation_attempts"
  ADD CONSTRAINT "generation_attempts_ordinal_check" CHECK ("ordinal" > 0),
  ADD CONSTRAINT "generation_attempts_route_index_check" CHECK ("route_index" >= 0),
  ADD CONSTRAINT "generation_attempts_usage_check" CHECK (
    ("input_tokens" IS NULL OR "input_tokens" >= 0)
    AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
    AND ("cache_read_tokens" IS NULL OR "cache_read_tokens" >= 0)
    AND ("cache_write_tokens" IS NULL OR "cache_write_tokens" >= 0)
    AND ("estimated_cost_micros" IS NULL OR "estimated_cost_micros" >= 0)
  );

-- A canonical item cannot commit without attributable supporting evidence.
CREATE FUNCTION "assert_source_revision_item_has_support"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_item_id UUID;
BEGIN
  target_item_id := COALESCE(
    (to_jsonb(NEW) ->> 'source_revision_item_id')::UUID,
    (to_jsonb(OLD) ->> 'source_revision_item_id')::UUID,
    (to_jsonb(NEW) ->> 'id')::UUID,
    (to_jsonb(OLD) ->> 'id')::UUID
  );
  IF EXISTS (SELECT 1 FROM "source_revision_items" WHERE "id" = target_item_id)
     AND NOT EXISTS (
       SELECT 1 FROM "provenance_links"
       WHERE "source_revision_item_id" = target_item_id AND "role" = 'supports'
     ) THEN
    RAISE EXCEPTION 'source revision item % requires supporting provenance', target_item_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE CONSTRAINT TRIGGER "source_revision_items_support_trigger"
AFTER INSERT OR UPDATE ON "source_revision_items"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_source_revision_item_has_support"();

CREATE CONSTRAINT TRIGGER "provenance_links_support_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "provenance_links"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_source_revision_item_has_support"();
