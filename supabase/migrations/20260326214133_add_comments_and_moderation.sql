/*
  # Add Comments and Moderation System

  ## 1. New Tables
    - `comments`
      - `id` (uuid, primary key)
      - `post_id` (uuid, foreign key to posts)
      - `user_id` (uuid, foreign key to user_profiles)
      - `content` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `user_moderation`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to user_profiles)
      - `moderated_by` (uuid, foreign key to user_profiles)
      - `moderation_type` (text: 'mute_1h', 'mute_6h', 'mute_24h', 'ban')
      - `reason` (text, nullable)
      - `expires_at` (timestamptz, nullable)
      - `created_at` (timestamptz)

  ## 2. Posts Table Update
    - Add `allow_comments` (boolean, default false)

  ## 3. Security
    - Enable RLS on all new tables
    - Comments: authenticated users can create, all can read
    - User moderation: only admins can manage
    - Add function to check if user is muted/banned
*/

-- Add allow_comments column to posts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'allow_comments'
  ) THEN
    ALTER TABLE posts ADD COLUMN allow_comments boolean DEFAULT false;
  END IF;
END $$;

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_moderation table
CREATE TABLE IF NOT EXISTS user_moderation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  moderated_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  moderation_type text NOT NULL CHECK (moderation_type IN ('mute_1h', 'mute_6h', 'mute_24h', 'ban')),
  reason text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_moderation_user_id ON user_moderation(user_id);
CREATE INDEX IF NOT EXISTS idx_user_moderation_expires_at ON user_moderation(expires_at);

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_moderation ENABLE ROW LEVEL SECURITY;

-- Comments policies
CREATE POLICY "Anyone can view comments"
  ON comments FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM user_moderation
      WHERE user_moderation.user_id = auth.uid()
      AND (
        moderation_type = 'ban'
        OR (expires_at IS NOT NULL AND expires_at > now())
      )
    )
  );

CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- User moderation policies
CREATE POLICY "Admins can view all moderation records"
  ON user_moderation FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can create moderation records"
  ON user_moderation FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update moderation records"
  ON user_moderation FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete moderation records"
  ON user_moderation FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Function to check if user is currently moderated
CREATE OR REPLACE FUNCTION is_user_moderated(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_moderation
    WHERE user_id = check_user_id
    AND (
      moderation_type = 'ban'
      OR (expires_at IS NOT NULL AND expires_at > now())
    )
  );
END;
$$;