-- CreateEnum
CREATE TYPE "ResourceCategoryAssignmentStatus" AS ENUM ('proposed', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "resource_categories" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label_en" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_category_assignments" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "status" "ResourceCategoryAssignmentStatus" NOT NULL DEFAULT 'proposed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_category_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_categories_project_id_key_key" ON "resource_categories"("project_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "resource_category_assignments_resource_id_category_id_key" ON "resource_category_assignments"("resource_id", "category_id");

-- AddForeignKey
ALTER TABLE "resource_categories" ADD CONSTRAINT "resource_categories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_category_assignments" ADD CONSTRAINT "resource_category_assignments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_category_assignments" ADD CONSTRAINT "resource_category_assignments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "resource_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
