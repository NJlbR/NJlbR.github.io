-- Media-only posts can be intentionally published without a visible title.
-- Some databases may still have the older title_length_check requiring at
-- least one character, so use a single-space storage placeholder for existing
-- untitled posts and keep the constraint focused on the maximum length.
ALTER TABLE posts
DROP CONSTRAINT IF EXISTS title_length_check;

UPDATE posts
SET title = ' '
WHERE title = '';

ALTER TABLE posts
ADD CONSTRAINT title_length_check CHECK (char_length(title) <= 500);
