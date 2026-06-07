-- Allow Telegram-style media-only posts without title, text or caption.
ALTER TABLE posts
DROP CONSTRAINT IF EXISTS title_length_check,
ADD CONSTRAINT title_length_check CHECK (char_length(title) <= 500);
