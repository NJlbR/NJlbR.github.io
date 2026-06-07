-- Keep media-only posts visually untitled while satisfying databases that still
-- have a title_length_check requiring a non-empty/non-blank title.
ALTER TABLE posts
DROP CONSTRAINT IF EXISTS title_length_check;

UPDATE posts
SET title = U&'\200B'
WHERE title IS NULL OR btrim(title) = '';

ALTER TABLE posts
ADD CONSTRAINT title_length_check CHECK (char_length(title) <= 500 AND char_length(title) > 0);
