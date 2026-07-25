-- CreateTable
CREATE TABLE "vulgarized_tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "github_item_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "original_title" TEXT NOT NULL,
    "original_description" TEXT,
    "vulgarized_title" TEXT,
    "vulgarized_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vulgarized_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vulgarized_tasks_project_id_github_item_id_locale_key" ON "vulgarized_tasks"("project_id", "github_item_id", "locale");

-- AddForeignKey
ALTER TABLE "vulgarized_tasks" ADD CONSTRAINT "vulgarized_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
