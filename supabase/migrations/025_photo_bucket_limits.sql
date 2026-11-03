-- 025_photo_bucket_limits.sql
-- Audit follow-up: the progress-photos bucket (created in 024) had no server-side
-- size or content-type limits, so a signed-in user could store arbitrarily large
-- or non-image objects. Enforce the same limits the client checks.
-- Idempotent. Per AGENTS.md, apply to the live project first, then merge.

UPDATE storage.buckets
   SET file_size_limit = 10485760,  -- 10 MiB
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'progress-photos';
