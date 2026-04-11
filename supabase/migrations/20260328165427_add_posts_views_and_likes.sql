/*
  # Добавление счётчиков просмотров и лайков

  1. Новые таблицы
    - `posts_views` - отслеживание просмотров постов
      - `id` (uuid, primary key)
      - `post_id` (uuid, foreign key)
      - `user_id` (uuid, nullable - для анонимных просмотров)
      - `viewed_at` (timestamp)
    
    - `post_likes` - система лайков для постов
      - `id` (uuid, primary key)
      - `post_id` (uuid, foreign key)
      - `user_id` (uuid, foreign key)
      - `created_at` (timestamp)
    
    - `posts_stats` - кеш статистики для быстрого доступа
      - `post_id` (uuid, primary key)
      - `view_count` (integer)
      - `like_count` (integer)
      - `updated_at` (timestamp)

  2. Безопасность
    - Enable RLS на всех таблицах
    - Просмотры может добавлять любой (для отслеживания анонимных просмотров)
    - Лайки может ставить только одобренные пользователи
    - Удалять лайки может только автор лайка
    - Просмотры видны всем

  3. Функции
    - `increment_post_views()` - увеличивает счётчик просмотров
    - `toggle_post_like()` - переключает статус лайка (добавляет/удаляет)
    - `get_post_stats()` - возвращает статистику поста
*/

-- Create posts_views table
CREATE TABLE IF NOT EXISTS posts_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid,
  viewed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_views_post_id ON posts_views(post_id);
CREATE INDEX IF NOT EXISTS idx_posts_views_user_id ON posts_views(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_views_post_user ON posts_views(post_id, user_id);

ALTER TABLE posts_views ENABLE ROW LEVEL SECURITY;

-- Views are visible to all, but we check user ID for owner's own views
CREATE POLICY "Anyone can view post views"
  ON posts_views FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert their own views"
  ON posts_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Anyone can insert anonymous views"
  ON posts_views FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- Create post_likes table
CREATE TABLE IF NOT EXISTS post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- Only approved users can like posts
CREATE POLICY "Approved users can view all likes"
  ON post_likes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND approval_status = 'approved'
    )
  );

CREATE POLICY "Approved users can like posts"
  ON post_likes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND approval_status = 'approved'
    )
  );

CREATE POLICY "Users can unlike their own likes"
  ON post_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create posts_stats table for caching
CREATE TABLE IF NOT EXISTS posts_stats (
  post_id uuid PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  view_count integer DEFAULT 0,
  like_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE posts_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view post stats"
  ON posts_stats FOR SELECT
  TO public
  USING (true);

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_post_views(post_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO posts_stats (post_id, view_count, like_count, updated_at)
  VALUES (post_id_param, 1, 0, now())
  ON CONFLICT (post_id) DO UPDATE
  SET view_count = posts_stats.view_count + 1, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION increment_post_views(uuid) TO public;

-- Function to toggle like
CREATE OR REPLACE FUNCTION toggle_post_like(post_id_param uuid, user_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  like_exists boolean;
  new_like_count integer;
BEGIN
  -- Check if user is approved
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id_param
    AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only approved users can like posts';
  END IF;

  -- Check if like exists
  SELECT EXISTS(
    SELECT 1 FROM post_likes
    WHERE post_id = post_id_param
    AND user_id = user_id_param
  ) INTO like_exists;

  IF like_exists THEN
    -- Remove like
    DELETE FROM post_likes
    WHERE post_id = post_id_param
    AND user_id = user_id_param;
  ELSE
    -- Add like
    INSERT INTO post_likes (post_id, user_id)
    VALUES (post_id_param, user_id_param);
  END IF;

  -- Update stats
  SELECT COUNT(*) INTO new_like_count
  FROM post_likes
  WHERE post_id = post_id_param;

  INSERT INTO posts_stats (post_id, view_count, like_count, updated_at)
  VALUES (post_id_param, 0, new_like_count, now())
  ON CONFLICT (post_id) DO UPDATE
  SET like_count = new_like_count, updated_at = now();

  RETURN jsonb_build_object('liked', NOT like_exists, 'like_count', new_like_count);
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_post_like(uuid, uuid) TO authenticated;

-- Function to get post stats
CREATE OR REPLACE FUNCTION get_post_stats(post_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'view_count', COALESCE(ps.view_count, 0),
    'like_count', COALESCE(ps.like_count, 0)
  ) INTO stats
  FROM posts_stats ps
  WHERE ps.post_id = post_id_param;

  IF stats IS NULL THEN
    stats := jsonb_build_object('view_count', 0, 'like_count', 0);
  END IF;

  RETURN stats;
END;
$$;

GRANT EXECUTE ON FUNCTION get_post_stats(uuid) TO public;
