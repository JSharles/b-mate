/*
  Warnings:

  - You are about to drop the column `vulgarized_description` on the `vulgarized_tasks` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "vulgarized_tasks" DROP COLUMN "vulgarized_description",
ADD COLUMN     "vulgarized_impact" TEXT,
ADD COLUMN     "vulgarized_status" TEXT,
ADD COLUMN     "vulgarized_why" TEXT;
