-- Canonical is terminal. Retained legacy tables exist only so the old runtime
-- can compile until T117; even a direct SQL write must now fail closed.
DO $$
BEGIN
  IF current_database() ~ '^prisma_migrate_shadow_db_' THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "documentary_transition_states"
    WHERE "id" = 'documentary-transition'
      AND "mode" = 'canonical'
      AND "active_reset_run_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy documentary write lock requires canonical transition';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "documentary_reset_runs"
    WHERE "feature_key" = '016-canonical-document-workflow'
      AND "status" = 'clean'
  ) THEN
    RAISE EXCEPTION 'legacy documentary write lock requires clean reset';
  END IF;
END $$;

CREATE FUNCTION "reject_legacy_documentary_write"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'legacy documentary table % is write-inaccessible after canonical transition', TG_TABLE_NAME;
END $$;

CREATE TRIGGER "resources_canonical_write_block"
BEFORE INSERT OR UPDATE OR DELETE ON "resources"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_legacy_documentary_write"();

CREATE TRIGGER "category_extracts_canonical_write_block"
BEFORE INSERT OR UPDATE OR DELETE ON "category_extracts"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_legacy_documentary_write"();

CREATE TRIGGER "category_references_canonical_write_block"
BEFORE INSERT OR UPDATE OR DELETE ON "category_references"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_legacy_documentary_write"();

CREATE TRIGGER "category_reference_drafts_canonical_write_block"
BEFORE INSERT OR UPDATE OR DELETE ON "category_reference_drafts"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_legacy_documentary_write"();

CREATE TRIGGER "category_contents_canonical_write_block"
BEFORE INSERT OR UPDATE OR DELETE ON "category_contents"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_legacy_documentary_write"();

CREATE TRIGGER "reference_questions_canonical_write_block"
BEFORE INSERT OR UPDATE OR DELETE ON "reference_questions"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_legacy_documentary_write"();
