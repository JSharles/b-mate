-- CreateEnum
CREATE TYPE "EstimateUnit" AS ENUM ('days', 'hours');

-- CreateEnum
CREATE TYPE "TaskComplexity" AS ENUM ('simple', 'complex');

-- CreateEnum
CREATE TYPE "EstimateSource" AS ENUM ('board', 'ai');

-- AlterTable
ALTER TABLE "board_connections" ADD COLUMN     "estimate_unit" "EstimateUnit" NOT NULL DEFAULT 'days';

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
    "last_estimated_title" TEXT NOT NULL,
    "last_estimated_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_progress_project_id_github_item_id_key" ON "task_progress"("project_id", "github_item_id");

-- AddForeignKey
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
