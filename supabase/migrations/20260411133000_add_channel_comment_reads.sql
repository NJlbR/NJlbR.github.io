/*
  # Track channel comment reads per user
*/

CREATE TABLE IF NOT EXISTS channel_post_comment_reads (
  post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE channel_post_comment_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their comment read state" ON channel_post_comment_reads;
CREATE POLICY "Users can read their comment read state"
  ON channel_post_comment_reads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert their comment read state" ON channel_post_comment_reads;
CREATE POLICY "Users can upsert their comment read state"
  ON channel_post_comment_reads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their comment read state" ON channel_post_comment_reads;
CREATE POLICY "Users can update their comment read state"
  ON channel_post_comment_reads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_channel_post_comment_reads_user_id
  ON channel_post_comment_reads(user_id);
