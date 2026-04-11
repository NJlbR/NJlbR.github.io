/*
  # Fix channel post visibility for admins and creators
*/

DROP POLICY IF EXISTS "Subscribers can view channel posts" ON channel_posts;

CREATE POLICY "Channel members can view channel posts"
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
        OR EXISTS (
          SELECT 1 FROM channel_admins ca
          WHERE ca.channel_id = c.id
          AND ca.user_id = auth.uid()
        )
      )
    )
  );
