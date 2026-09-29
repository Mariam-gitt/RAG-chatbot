-- Track where each document came from (upload / github / notion) and its link.
-- Existing rows get source = 'upload', so nothing already stored changes behaviour.
ALTER TABLE "Document" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE "Document" ADD COLUMN "sourceUrl" TEXT;
