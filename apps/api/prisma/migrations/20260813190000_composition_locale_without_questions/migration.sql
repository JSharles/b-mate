-- A composition is what the developer reads before publishing, so it is written
-- in their language and carries it, the way the reference document does.
ALTER TABLE "section_proposals" ADD COLUMN "locale" VARCHAR(8) NOT NULL DEFAULT 'en';

-- Questions raised per section were a second place to answer what the reference
-- document already asks. There is one place, and it is the document.
DROP TABLE "section_questions";
