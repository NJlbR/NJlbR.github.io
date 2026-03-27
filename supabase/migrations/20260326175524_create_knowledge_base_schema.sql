/*
  # Knowledge Base Schema

  ## Overview
  Creates the database structure for a personal knowledge base application
  with posts, interactive annotations, hashtags, and person relationships.

  ## New Tables

  ### posts
  - `id` (uuid, primary key) - Unique post identifier
  - `title` (text) - Post title
  - `content_type` (text) - Type: 'text', 'audio', 'video'
  - `content` (text) - Main content or media URL
  - `transcript` (text, nullable) - Text transcript for audio/video
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  - `author_id` (uuid) - Reference to auth.users

  ### annotations
  - `id` (uuid, primary key) - Unique annotation identifier
  - `term` (text, unique) - Term name
  - `content` (text) - Annotation content/description
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### post_annotations
  - `id` (uuid, primary key) - Unique identifier
  - `post_id` (uuid) - Reference to posts
  - `annotation_id` (uuid) - Reference to annotations
  - `position_start` (integer, nullable) - Text selection start position
  - `position_end` (integer, nullable) - Text selection end position
  - `created_at` (timestamptz) - Creation timestamp

  ### hashtags
  - `id` (uuid, primary key) - Unique hashtag identifier
  - `name` (text, unique) - Hashtag name (without #)
  - `created_at` (timestamptz) - Creation timestamp

  ### post_hashtags
  - `post_id` (uuid) - Reference to posts
  - `hashtag_id` (uuid) - Reference to hashtags
  - Primary key: (post_id, hashtag_id)

  ### persons
  - `id` (uuid, primary key) - Unique person identifier
  - `name` (text, unique) - Person name
  - `created_at` (timestamptz) - Creation timestamp

  ### post_persons
  - `post_id` (uuid) - Reference to posts
  - `person_id` (uuid) - Reference to persons
  - Primary key: (post_id, person_id)

  ## Security
  - Enable RLS on all tables
  - Public can read posts, annotations, hashtags, persons
  - Only authenticated users can create/update/delete content
*/

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('text', 'audio', 'video')),
  content text NOT NULL,
  transcript text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  author_id uuid REFERENCES auth.users(id)
);

-- Create annotations table
CREATE TABLE IF NOT EXISTS annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text UNIQUE NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create post_annotations junction table
CREATE TABLE IF NOT EXISTS post_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  annotation_id uuid REFERENCES annotations(id) ON DELETE CASCADE NOT NULL,
  position_start integer,
  position_end integer,
  created_at timestamptz DEFAULT now()
);

-- Create hashtags table
CREATE TABLE IF NOT EXISTS hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create post_hashtags junction table
CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  hashtag_id uuid REFERENCES hashtags(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (post_id, hashtag_id)
);

-- Create persons table
CREATE TABLE IF NOT EXISTS persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create post_persons junction table
CREATE TABLE IF NOT EXISTS post_persons (
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  person_id uuid REFERENCES persons(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (post_id, person_id)
);

-- Enable Row Level Security
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_persons ENABLE ROW LEVEL SECURITY;

-- Policies for posts
CREATE POLICY "Posts are viewable by everyone"
  ON posts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can delete their posts"
  ON posts FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- Policies for annotations
CREATE POLICY "Annotations are viewable by everyone"
  ON annotations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create annotations"
  ON annotations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update annotations"
  ON annotations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete annotations"
  ON annotations FOR DELETE
  TO authenticated
  USING (true);

-- Policies for post_annotations
CREATE POLICY "Post annotations are viewable by everyone"
  ON post_annotations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create post annotations"
  ON post_annotations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete post annotations"
  ON post_annotations FOR DELETE
  TO authenticated
  USING (true);

-- Policies for hashtags
CREATE POLICY "Hashtags are viewable by everyone"
  ON hashtags FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create hashtags"
  ON hashtags FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policies for post_hashtags
CREATE POLICY "Post hashtags are viewable by everyone"
  ON post_hashtags FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create post hashtags"
  ON post_hashtags FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete post hashtags"
  ON post_hashtags FOR DELETE
  TO authenticated
  USING (true);

-- Policies for persons
CREATE POLICY "Persons are viewable by everyone"
  ON persons FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create persons"
  ON persons FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policies for post_persons
CREATE POLICY "Post persons are viewable by everyone"
  ON post_persons FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create post persons"
  ON post_persons FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete post persons"
  ON post_persons FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_content_type ON posts(content_type);
CREATE INDEX IF NOT EXISTS idx_post_annotations_post_id ON post_annotations(post_id);
CREATE INDEX IF NOT EXISTS idx_post_annotations_annotation_id ON post_annotations(annotation_id);
CREATE INDEX IF NOT EXISTS idx_annotations_term ON annotations(term);
