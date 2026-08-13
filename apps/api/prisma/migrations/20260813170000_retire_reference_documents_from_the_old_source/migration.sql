-- The reference documents already written were written from the canonical
-- source the previous migration deleted: their parts cite information items
-- that no longer exist and carry no document titles, so nothing can read them
-- under the contract that replaced it. They go the same way the proposals
-- composed from that source did — the documents themselves are untouched, and
-- the project writes a fresh one on demand.
--
-- Notes are the developer's own words and are kept: they are replayed on the
-- next write, which is the whole reason they are stored.
UPDATE "projects" SET
  "active_reference_document_id" = NULL,
  "reference_needs_rewrite" = true;

DELETE FROM "reference_documents";

-- Attempts cascade with their operation; the operation's pointer back at the
-- attempt it is holding does not, so it is released first.
UPDATE "generation_operations" SET "current_attempt_id" = NULL
  WHERE "type" = 'reference_document';
DELETE FROM "generation_operations" WHERE "type" = 'reference_document';
