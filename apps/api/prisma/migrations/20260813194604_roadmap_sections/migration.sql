-- CreateEnum
CREATE TYPE "ClientSectionKind" AS ENUM ('prose', 'roadmap');

-- AlterTable
ALTER TABLE "client_sections" ADD COLUMN     "current_milestone_id" UUID,
ADD COLUMN     "kind" "ClientSectionKind" NOT NULL DEFAULT 'prose',
ALTER COLUMN "instructions" DROP NOT NULL,
ALTER COLUMN "length" DROP NOT NULL,
ALTER COLUMN "pedagogy" DROP NOT NULL,
ALTER COLUMN "technical_familiarity" DROP NOT NULL,
ALTER COLUMN "tone" DROP NOT NULL;
