/*
  # Ensure channel comments and likes exist
*/

-- Comments
CREATE TABLE IF NOT EXISTS channel_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 4000),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE channel_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Subscribers can view channel comments" ON channel_post_comments;
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
        OR EXISTS (
          SELECT 1 FROM channel_admins ca
          WHERE ca.channel_id = c.id
          AND ca.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Approved users can comment in channels" ON channel_post_comments;
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

CREATE INDEX IF NOT EXISTS idx_channel_post_comments_post_id ON channel_post_comments(post_id);

-- Likes
CREATE TABLE IF NOT EXISTS channel_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE channel_post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view post likes" ON channel_post_likes;
CREATE POLICY "Anyone can view post likes"
  ON channel_post_likes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can like posts" ON channel_post_likes;
CREATE POLICY "Users can like posts"
  ON channel_post_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike posts" ON channel_post_likes;
CREATE POLICY "Users can unlike posts"
  ON channel_post_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_channel_post_likes_post_id ON channel_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_channel_post_likes_user_id ON channel_post_likes(user_id);

-- Toggle like function
CREATE OR REPLACE FUNCTION toggle_channel_post_like(
  post_id_param uuid,
  user_id_param uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_liked boolean;
  new_like_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM channel_post_likes
    WHERE post_id = post_id_param
    AND user_id = user_id_param
  ) INTO is_liked;

  IF is_liked THEN
    DELETE FROM channel_post_likes
    WHERE post_id = post_id_param
    AND user_id = user_id_param;
  ELSE
    INSERT INTO channel_post_likes (post_id, user_id)
    VALUES (post_id_param, user_id_param)
    ON CONFLICT (post_id, user_id) DO NOTHING;
  END IF;

  UPDATE channel_posts
  SET like_count = (
    SELECT COUNT(*) FROM channel_post_likes
    WHERE post_id = post_id_param
  )
  WHERE id = post_id_param;

  SELECT like_count INTO new_like_count
  FROM channel_posts
  WHERE id = post_id_param;

  RETURN json_build_object(
    'liked', NOT is_liked,
    'like_count', new_like_count
  );
END;
$$;
