/*
  # Channel post views and comments
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channel_posts' AND column_name = 'view_count'
  ) THEN
    ALTER TABLE channel_posts ADD COLUMN view_count integer DEFAULT 0;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS channel_post_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  viewed_at timestamptz DEFAULT now(),
  UNIQUE(post_id, viewer_id)
);

ALTER TABLE channel_post_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subscribers can view channel post views"
  ON channel_post_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = (SELECT cp.channel_id FROM channel_posts cp WHERE cp.id = channel_post_views.post_id)
      AND (
        COALESCE(c.is_private, false) = false
        OR c.created_by = auth.uid()
        OR is_channel_subscriber(c.id, auth.uid())
      )
    )
  );

CREATE POLICY "Authenticated users can insert channel post views"
  ON channel_post_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = viewer_id);

CREATE TABLE IF NOT EXISTS channel_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 4000),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE channel_post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subscribers can view channel comments"
  ON channel_post_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = (SELECT cp.channel_id FROM channel_posts cp WHERE cp.id = channel_post_comments.post_id)
      AND (
        COALESCE(c.is_private, false) = false
        OR c.created_by = auth.uid()
        OR is_channel_subscriber(c.id, auth.uid())
      )
    )
  );

CREATE POLICY "Approved users can comment in channels"
  ON channel_post_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.approval_status = 'approved'
    )
  );

CREATE INDEX IF NOT EXISTS idx_channel_post_views_post_id ON channel_post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_channel_post_views_viewer_id ON channel_post_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_channel_post_comments_post_id ON channel_post_comments(post_id);

DROP POLICY IF EXISTS "Anyone can view channel posts" ON channel_posts;

CREATE POLICY "Subscribers can view channel posts"
  ON channel_posts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = channel_posts.channel_id
      AND (
        COALESCE(c.is_private, false) = false
        OR c.created_by = auth.uid()
        OR is_channel_subscriber(c.id, auth.uid())
      )
    )
  );

CREATE OR REPLACE FUNCTION increment_channel_post_views(post_id_param uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  view_total integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  INSERT INTO channel_post_views (post_id, viewer_id)
  VALUES (post_id_param, auth.uid())
  ON CONFLICT (post_id, viewer_id) DO NOTHING;

  UPDATE channel_posts
  SET view_count = (
    SELECT COUNT(*) FROM channel_post_views
    WHERE post_id = post_id_param
  )
  WHERE id = post_id_param;

  SELECT view_count INTO view_total
  FROM channel_posts
  WHERE id = post_id_param;

  RETURN json_build_object('success', true, 'view_count', view_total);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_channel_post_views(uuid) TO authenticated;
