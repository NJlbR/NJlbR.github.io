-- Keep the legacy content_type column in sync with the newer content_types array.
-- Older databases still have the original CHECK constraint that only allowed
-- text/audio/video, which rejects photo-only and file-only posts before the
-- media URLs can be saved.
ALTER TABLE posts
DROP CONSTRAINT IF EXISTS posts_content_type_check,
ADD CONSTRAINT posts_content_type_check
CHECK (content_type IN ('text', 'audio', 'video', 'photo', 'file'));
