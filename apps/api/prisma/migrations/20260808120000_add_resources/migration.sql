-- CreateEnum
CREATE TYPE "ResourceSource" AS ENUM ('upload', 'notion');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('processing', 'ready_for_review', 'published', 'failed');

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source" "ResourceSource" NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'processing',
    "title" TEXT NOT NULL,
    "original_file_key" TEXT,
    "original_file_name" TEXT,
    "original_file_mime_type" TEXT,
    "original_file_size_bytes" INTEGER,
    "notion_page_url" TEXT,
    "failure_reason" TEXT,
    "anthropic_batch_id" TEXT,
    "added_by_user_id" UUID NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "resource_vulgarizations" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_vulgarizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notion_connections_project_id_key" ON "notion_connections"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_vulgarizations_resource_id_locale_key" ON "resource_vulgarizations"("resource_id", "locale");

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notion_connections" ADD CONSTRAINT "notion_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_vulgarizations" ADD CONSTRAINT "resource_vulgarizations_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
