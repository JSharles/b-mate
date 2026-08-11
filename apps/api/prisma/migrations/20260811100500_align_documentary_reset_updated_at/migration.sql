-- Prisma's @updatedAt fields are application-managed and intentionally have
-- no database default. Keep the hand-written guarded migration aligned with
-- the generated Prisma schema without touching documentary or project data.
ALTER TABLE "documentary_transition_states"
  ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "documentary_reset_runs"
  ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "documentary_reset_items"
  ALTER COLUMN "updated_at" DROP DEFAULT;
