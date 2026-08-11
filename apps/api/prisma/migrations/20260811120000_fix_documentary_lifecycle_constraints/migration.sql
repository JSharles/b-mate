-- A removed document is retained as an auditable tombstone after its stored
-- object has been deleted. Its origin metadata stays available, but the object
-- key must no longer point to data that does not exist.
ALTER TABLE "source_documents"
  DROP CONSTRAINT "source_documents_kind_metadata_check";

ALTER TABLE "source_documents"
  ADD CONSTRAINT "source_documents_kind_metadata_check" CHECK (
    (
      "kind" = 'upload'
      AND "original_file_name" IS NOT NULL
      AND "original_mime_type" IS NOT NULL
      AND "original_size_bytes" IS NOT NULL
      AND "external_url" IS NULL
      AND (
        ("status" = 'removed' AND "stored_object_key" IS NULL)
        OR ("status" <> 'removed' AND "stored_object_key" IS NOT NULL)
      )
    )
    OR
    (
      "kind" = 'notion'
      AND "external_url" IS NOT NULL
      AND (
        ("status" = 'removed' AND "stored_object_key" IS NULL)
        OR ("status" <> 'removed' AND "stored_object_key" IS NOT NULL)
      )
    )
  );

-- Extraction contracts use a zero-based sequence. Align the database guard
-- with the shared schema and provider prompt.
ALTER TABLE "document_observations"
  DROP CONSTRAINT "document_observations_sequence_check";

ALTER TABLE "document_observations"
  ADD CONSTRAINT "document_observations_sequence_check" CHECK ("sequence" >= 0);
