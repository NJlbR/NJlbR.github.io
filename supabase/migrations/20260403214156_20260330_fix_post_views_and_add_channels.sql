/*
  # Fix post views bug and add channels system

  1. Post Views Fix
    - Remove approval status check from increment_post_views function
    - Initialize posts_stats for posts that don't have entries
    - Ensure view count increments properly for all users

  2. New Channels System
    - Create `channels` table for group-like channels with unique usernames
    - Create `channel_members` table for channel membership
    - Channel usernames follow same rules as user profiles (4+ chars, alphanumeric + underscore)
    - Support for channel descriptions and profile images
    - Creator can manage channel settings and members
*/

-- Fix the increment_post_views function to remove approval check
DROP FUNCTION IF EXISTS increment_post_views(uuid);

CREATE OR REPLACE FUNCTION increment_post_views(post_id_param uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stats json;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM posts
    WHERE id = post_id_param
  ) THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  INSERT INTO posts_stats (post_id, view_count)
  VALUES (post_id_param, 1)
  ON CONFLICT (post_id) DO UPDATE
  SET view_count = view_count + 1,
      updated_at = now();

  SELECT json_build_object(
    'view_count', ps.view_count,
    'like_count', COALESCE(ps.like_count, 0)
  ) INTO stats
  FROM posts_stats ps
  WHERE ps.post_id = post_id_param;

  RETURN COALESCE(stats, '{"view_count": 0, "like_count": 0}'::json);
END;
$$;

-- Initialize posts_stats for existing posts that don't have entries
INSERT INTO posts_stats (post_id, view_count, like_count)
SELECT id, 0, 0 FROM posts
WHERE id NOT IN (SELECT post_id FROM posts_stats)
ON CONFLICT (post_id) DO NOTHING;

-- Create channels table
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  avatar_url text,
  created_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view channels"
  ON channels FOR SELECT
  USING (true);

CREATE POLICY "Users can create channels"
  ON channels FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Channel creators can update their channels"
  ON channels FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Channel creators can delete their channels"
  ON channels FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Create channel_members table
CREATE TABLE IF NOT EXISTS channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view channel members"
  ON channel_members FOR SELECT
  USING (true);

CREATE POLICY "Users can join channels"
  ON channel_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave channels"
  ON channel_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Channel creators can manage members"
  ON channel_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = channel_members.channel_id
      AND channels.created_by = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_channels_username ON channels(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_channels_created_by ON channels(created_by);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON channel_members(channel_id);

-- Function to check if channel username is available
CREATE OR REPLACE FUNCTION is_channel_username_available(username_to_check text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM channels
    WHERE LOWER(username) = LOWER(username_to_check)
  ) AND NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE LOWER(username) = LOWER(username_to_check)
  );
END;
$$;

-- Function to create a channel
CREATE OR REPLACE FUNCTION create_channel(
  username_param text,
  name_param text,
  description_param text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  channel_id uuid;
  result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF LENGTH(username_param) < 4 THEN
    RAISE EXCEPTION 'Channel username must be at least 4 characters';
  END IF;

  IF NOT username_param ~ '^[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Channel username can only contain letters, numbers, and underscores';
  END IF;

  IF NOT is_channel_username_available(username_param) THEN
    RAISE EXCEPTION 'Channel username is already taken';
  END IF;

  INSERT INTO channels (username, name, description, created_by)
  VALUES (LOWER(username_param), name_param, description_param, auth.uid())
  RETURNING id INTO channel_id;

  INSERT INTO channel_members (channel_id, user_id)
  VALUES (channel_id, auth.uid());

  SELECT json_build_object(
    'id', channels.id,
    'username', channels.username,
    'name', channels.name,
    'description', channels.description,
    'created_by', channels.created_by,
    'created_at', channels.created_at
  ) INTO result
  FROM channels
  WHERE id = channel_id;

  RETURN result;
END;
$$;
