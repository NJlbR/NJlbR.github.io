/*
  # Add User Profiles and New Content Types

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `username` (text, unique, not null)
      - `is_admin` (boolean, default false)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Changes
    - Update posts table to support multiple content types
    - Add content_types array column to posts
    - Add description column (replaces transcript concept)
    - Add has_description boolean flag
  
  3. Security
    - Enable RLS on user_profiles
    - Add policies for user profile access
    - Update posts policies to check admin status
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT username_length CHECK (char_length(username) >= 4),
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]+$')
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
CREATE POLICY "Anyone can view user profiles"
  ON user_profiles FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Add new columns to posts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'content_types'
  ) THEN
    ALTER TABLE posts ADD COLUMN content_types text[] DEFAULT ARRAY['text'];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'description'
  ) THEN
    ALTER TABLE posts ADD COLUMN description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'has_description'
  ) THEN
    ALTER TABLE posts ADD COLUMN has_description boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'media_urls'
  ) THEN
    ALTER TABLE posts ADD COLUMN media_urls jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Update existing posts to use new structure
UPDATE posts 
SET content_types = ARRAY[content_type], 
    has_description = (transcript IS NOT NULL),
    description = transcript
WHERE content_types IS NULL;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION is_user_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update posts policies to check admin status
DROP POLICY IF EXISTS "Authenticated users can create posts" ON posts;
DROP POLICY IF EXISTS "Authenticated users can update posts" ON posts;
DROP POLICY IF EXISTS "Authenticated users can delete posts" ON posts;

CREATE POLICY "Admin users can create posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (is_user_admin(auth.uid()));

CREATE POLICY "Admin users can update posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (is_user_admin(auth.uid()))
  WITH CHECK (is_user_admin(auth.uid()));

CREATE POLICY "Admin users can delete posts"
  ON posts FOR DELETE
  TO authenticated
  USING (is_user_admin(auth.uid()));

-- Function to make first user admin
CREATE OR REPLACE FUNCTION make_first_user_admin()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE is_admin = true) THEN
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to make first user admin
DROP TRIGGER IF EXISTS set_first_user_admin ON user_profiles;
CREATE TRIGGER set_first_user_admin
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION make_first_user_admin();

-- Update annotations policies to check admin status
DROP POLICY IF EXISTS "Authenticated users can create annotations" ON annotations;
DROP POLICY IF EXISTS "Authenticated users can update annotations" ON annotations;
DROP POLICY IF EXISTS "Authenticated users can delete annotations" ON annotations;

CREATE POLICY "Admin users can create annotations"
  ON annotations FOR INSERT
  TO authenticated
  WITH CHECK (is_user_admin(auth.uid()));

CREATE POLICY "Admin users can update annotations"
  ON annotations FOR UPDATE
  TO authenticated
  USING (is_user_admin(auth.uid()))
  WITH CHECK (is_user_admin(auth.uid()));

CREATE POLICY "Admin users can delete annotations"
  ON annotations FOR DELETE
  TO authenticated
  USING (is_user_admin(auth.uid()));