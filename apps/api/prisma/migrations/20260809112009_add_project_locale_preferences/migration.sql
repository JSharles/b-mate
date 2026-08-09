-- CreateEnum
CREATE TYPE "ProjectDateFormat" AS ENUM ('mdy', 'dmy', 'ymd');

-- CreateEnum
CREATE TYPE "ProjectLanguage" AS ENUM ('en', 'fr');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "date_format" "ProjectDateFormat",
ADD COLUMN     "language" "ProjectLanguage",
ADD COLUMN     "timezone" TEXT;
