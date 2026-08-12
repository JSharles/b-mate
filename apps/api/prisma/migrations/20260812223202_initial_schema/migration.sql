-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('client', 'contributor');

-- CreateEnum
CREATE TYPE "BoardProvider" AS ENUM ('github');

-- CreateEnum
CREATE TYPE "EstimateUnit" AS ENUM ('days', 'hours');

-- CreateEnum
CREATE TYPE "TaskComplexity" AS ENUM ('simple', 'complex');

-- CreateEnum
CREATE TYPE "EstimateSource" AS ENUM ('board', 'ai');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('developer', 'client');

-- CreateEnum
CREATE TYPE "ProjectDateFormat" AS ENUM ('mdy', 'dmy', 'ymd');

-- CreateEnum
CREATE TYPE "ProjectLanguage" AS ENUM ('en', 'fr');

-- CreateEnum
CREATE TYPE "SourceDocumentKind" AS ENUM ('upload', 'notion');

-- CreateEnum
CREATE TYPE "SourceDocumentStatus" AS ENUM ('received', 'extracting', 'ready_to_consolidate', 'incorporating', 'incorporated', 'retrying', 'failed', 'removal_pending', 'removal_failed', 'removed');

-- CreateEnum
CREATE TYPE "SourceRevisionTrigger" AS ENUM ('document_added', 'document_removed', 'clarification_answered', 'guided_correction');

-- CreateEnum
CREATE TYPE "InformationItemKind" AS ENUM ('fact', 'decision', 'date', 'figure', 'constraint', 'explanation', 'open_point');

-- CreateEnum
CREATE TYPE "InformationItemState" AS ENUM ('confirmed', 'point_to_clarify');

-- CreateEnum
CREATE TYPE "RevisionChangeKind" AS ENUM ('added', 'updated', 'confirmed', 'superseded', 'removed', 'provenance_added', 'provenance_removed', 'marked_open', 'resolved');

-- CreateEnum
CREATE TYPE "ProvenanceRole" AS ENUM ('supports', 'conflicts', 'supersedes', 'confirms');

-- CreateEnum
CREATE TYPE "ContributorAssertionKind" AS ENUM ('guided_correction', 'clarification_answer');

-- CreateEnum
CREATE TYPE "ClarificationStatus" AS ENUM ('open', 'left_open', 'answered', 'superseded');

-- CreateEnum
CREATE TYPE "ClarificationResolutionKind" AS ENUM ('answer', 'leave_open');

-- CreateEnum
CREATE TYPE "EditorialLength" AS ENUM ('concise', 'balanced', 'detailed');

-- CreateEnum
CREATE TYPE "EditorialPedagogy" AS ENUM ('direct', 'guided', 'highly_explanatory');

-- CreateEnum
CREATE TYPE "ClientTechnicalFamiliarity" AS ENUM ('novice', 'informed', 'technical');

-- CreateEnum
CREATE TYPE "EditorialTone" AS ENUM ('reassuring', 'neutral', 'direct', 'formal');

-- CreateEnum
CREATE TYPE "ClientReleaseReason" AS ENUM ('section_approval', 'section_removal');

-- CreateEnum
CREATE TYPE "ClientReleaseStatus" AS ENUM ('queued', 'preparing', 'validating', 'ready', 'published', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "GenerationOperationType" AS ENUM ('document_extraction', 'source_consolidation', 'section_composition', 'client_derivation');

-- CreateEnum
CREATE TYPE "GenerationOperationStatus" AS ENUM ('queued', 'running', 'waiting_provider', 'retry_scheduled', 'succeeded', 'needs_attention', 'cancelled', 'superseded');

-- CreateEnum
CREATE TYPE "GenerationTransport" AS ENUM ('sync', 'batch');

-- CreateEnum
CREATE TYPE "GenerationAttemptStatus" AS ENUM ('submitting', 'submitted', 'polling', 'succeeded', 'failed', 'invalid_output', 'abandoned_unknown', 'cancelled');

-- CreateEnum
CREATE TYPE "GenerationErrorClass" AS ENUM ('transient', 'rate_limited', 'credit_exhausted', 'model_unavailable', 'invalid_request', 'input_unprocessable', 'invalid_output', 'provider_terminal', 'policy_denied', 'unknown');

-- CreateEnum
CREATE TYPE "SectionProposalStatus" AS ENUM ('composing', 'pending_review', 'approved', 'superseded', 'failed');

-- CreateEnum
CREATE TYPE "SectionProposalOutcome" AS ENUM ('composed', 'nothing_matched');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "account_kind" "AccountKind" NOT NULL,
    "company" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "image" TEXT,
    "bio" TEXT,
    "github" TEXT,
    "github_id" TEXT,
    "socials" TEXT,
    "linkedin" TEXT,
    "malt" TEXT,
    "website" TEXT,
    "role_title" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "progress_percentage" INTEGER,
    "meeting_url" TEXT,
    "timezone" TEXT,
    "date_format" "ProjectDateFormat",
    "language" "ProjectLanguage",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "assignee_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT,
    "duration" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_connections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "provider" "BoardProvider" NOT NULL,
    "board_owner_login" TEXT NOT NULL,
    "board_owner_type" TEXT NOT NULL,
    "board_number" INTEGER NOT NULL,
    "board_title" TEXT NOT NULL,
    "board_url" TEXT NOT NULL,
    "encrypted_token" TEXT NOT NULL,
    "estimate_unit" "EstimateUnit" NOT NULL DEFAULT 'days',
    "needs_reconnect" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_sources" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
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
    "processing_started_at" TIMESTAMP(3),
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

-- CreateTable
CREATE TABLE "client_section_contents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "section_proposal_id" UUID NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "output_contract_version" VARCHAR(64) NOT NULL,
    "structured_content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_section_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_content_releases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "base_release_id" UUID,
    "reason" "ClientReleaseReason" NOT NULL,
    "status" "ClientReleaseStatus" NOT NULL DEFAULT 'queued',
    "expected_section_count" INTEGER NOT NULL,
    "initiating_proposal_id" UUID,
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
    "section_id" UUID NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "client_section_content_id" UUID NOT NULL,

    CONSTRAINT "client_content_release_entries_pkey" PRIMARY KEY ("release_id","section_id","locale")
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
    "section_proposal_id" UUID,
    "client_release_id" UUID,
    "client_section_content_id" UUID,
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

-- CreateTable
CREATE TABLE "notion_connections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "encrypted_token" TEXT NOT NULL,
    "workspace_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notion_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulgarized_tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "github_item_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "original_title" TEXT NOT NULL,
    "original_description" TEXT,
    "vulgarized_title" TEXT,
    "vulgarized_why" TEXT,
    "vulgarized_impact" TEXT,
    "vulgarized_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vulgarized_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_progress" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "github_item_id" TEXT NOT NULL,
    "detected_started_at" TIMESTAMP(3) NOT NULL,
    "resolved_started_at" TIMESTAMP(3) NOT NULL,
    "estimated_completion_at" TIMESTAMP(3),
    "estimate_source" "EstimateSource",
    "ai_complexity" "TaskComplexity",
    "ai_estimated_duration_days" INTEGER,
    "last_estimated_title" TEXT NOT NULL,
    "last_estimated_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "board_connections_project_id_key" ON "board_connections"("project_id");

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
CREATE UNIQUE INDEX "client_sections_active_proposal_id_key" ON "client_sections"("active_proposal_id");

-- CreateIndex
CREATE INDEX "client_sections_project_id_archived_at_sort_order_idx" ON "client_sections"("project_id", "archived_at", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "section_proposals_generation_operation_id_key" ON "section_proposals"("generation_operation_id");

-- CreateIndex
CREATE INDEX "section_proposals_section_id_status_created_at_idx" ON "section_proposals"("section_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "section_questions_proposal_id_sort_order_idx" ON "section_questions"("proposal_id", "sort_order");

-- CreateIndex
CREATE INDEX "client_section_contents_project_id_section_id_locale_idx" ON "client_section_contents"("project_id", "section_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "client_section_contents_section_proposal_id_locale_output_c_key" ON "client_section_contents"("section_proposal_id", "locale", "output_contract_version");

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

-- CreateIndex
CREATE UNIQUE INDEX "notion_connections_project_id_key" ON "notion_connections"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "vulgarized_tasks_project_id_github_item_id_locale_key" ON "vulgarized_tasks"("project_id", "github_item_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "task_progress_project_id_github_item_id_key" ON "task_progress"("project_id", "github_item_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_connections" ADD CONSTRAINT "board_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "client_section_contents" ADD CONSTRAINT "client_section_contents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_section_contents" ADD CONSTRAINT "client_section_contents_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "client_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_section_contents" ADD CONSTRAINT "client_section_contents_section_proposal_id_fkey" FOREIGN KEY ("section_proposal_id") REFERENCES "section_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_releases" ADD CONSTRAINT "client_content_releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_releases" ADD CONSTRAINT "client_content_releases_base_release_id_fkey" FOREIGN KEY ("base_release_id") REFERENCES "client_content_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_releases" ADD CONSTRAINT "client_content_releases_initiating_proposal_id_fkey" FOREIGN KEY ("initiating_proposal_id") REFERENCES "section_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_release_entries" ADD CONSTRAINT "client_content_release_entries_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "client_content_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_release_entries" ADD CONSTRAINT "client_content_release_entries_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "client_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_content_release_entries" ADD CONSTRAINT "client_content_release_entries_client_section_content_id_fkey" FOREIGN KEY ("client_section_content_id") REFERENCES "client_section_contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_section_proposal_id_fkey" FOREIGN KEY ("section_proposal_id") REFERENCES "section_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_client_release_id_fkey" FOREIGN KEY ("client_release_id") REFERENCES "client_content_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_client_section_content_id_fkey" FOREIGN KEY ("client_section_content_id") REFERENCES "client_section_contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_current_attempt_id_fkey" FOREIGN KEY ("current_attempt_id") REFERENCES "generation_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_replaces_operation_id_fkey" FOREIGN KEY ("replaces_operation_id") REFERENCES "generation_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "generation_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notion_connections" ADD CONSTRAINT "notion_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulgarized_tasks" ADD CONSTRAINT "vulgarized_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
