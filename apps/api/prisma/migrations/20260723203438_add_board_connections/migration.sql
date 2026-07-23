-- CreateEnum
CREATE TYPE "BoardProvider" AS ENUM ('github');

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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "board_connections_project_id_key" ON "board_connections"("project_id");

-- AddForeignKey
ALTER TABLE "board_connections" ADD CONSTRAINT "board_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
