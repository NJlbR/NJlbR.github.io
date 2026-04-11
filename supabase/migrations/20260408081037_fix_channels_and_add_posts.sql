/*
  # Исправление каналов и добавление системы постов

  1. Исправления
    - Автоматически подписывать создателя канала при создании
    - Исправить функцию toggle_channel_subscription
    - Добавить таблицу channel_posts для постов в каналах
    - Добавить channel_admins для администраторов каналов

  2. Новые таблицы
    - channel_posts: посты в каналах (как в группах)
    - channel_admins: администраторы каналов с правом публикации

  3. Безопасность
    - Только администраторы и создатель могут публиковать посты
    - Подписчики могут просматривать посты
    - RLS политики для всех операций
*/

-- Создаем таблицу для администраторов каналов
CREATE TABLE IF NOT EXISTS channel_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  can_post boolean DEFAULT true,
  can_edit_channel boolean DEFAULT false,
  added_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE channel_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view channel admins"
  ON channel_admins FOR SELECT
  USING (true);

CREATE POLICY "Channel creators can manage admins"
  ON channel_admins FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = channel_admins.channel_id
      AND channels.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = channel_admins.channel_id
      AND channels.created_by = auth.uid()
    )
  );

-- Создаем таблицу для постов в каналах
CREATE TABLE IF NOT EXISTS channel_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content text,
  media_urls jsonb,
  like_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE channel_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view channel posts"
  ON channel_posts FOR SELECT
  USING (true);

CREATE POLICY "Channel creators and admins can create posts"
  ON channel_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = channel_posts.channel_id
      AND channels.created_by = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM channel_admins
      WHERE channel_admins.channel_id = channel_posts.channel_id
      AND channel_admins.user_id = auth.uid()
      AND channel_admins.can_post = true
    )
  );

CREATE POLICY "Authors can update own posts"
  ON channel_posts FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Channel creators and admins can delete posts"
  ON channel_posts FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = channel_posts.channel_id
      AND channels.created_by = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM channel_admins
      WHERE channel_admins.channel_id = channel_posts.channel_id
      AND channel_admins.user_id = auth.uid()
    )
  );

-- Создаем таблицу для лайков постов каналов
CREATE TABLE IF NOT EXISTS channel_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE channel_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view post likes"
  ON channel_post_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can like posts"
  ON channel_post_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike posts"
  ON channel_post_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS idx_channel_admins_channel_id ON channel_admins(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_admins_user_id ON channel_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_posts_channel_id ON channel_posts(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_posts_author_id ON channel_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_channel_posts_created_at ON channel_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_post_likes_post_id ON channel_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_channel_post_likes_user_id ON channel_post_likes(user_id);

-- Обновляем функцию создания канала для автоматической подписки
DROP FUNCTION IF EXISTS create_channel(text, text, text);

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

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only approved users can create channels';
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

  INSERT INTO channel_subscribers (channel_id, user_id)
  VALUES (channel_id, auth.uid())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

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

-- Исправляем функцию toggle_channel_subscription
DROP FUNCTION IF EXISTS toggle_channel_subscription(uuid);

CREATE OR REPLACE FUNCTION toggle_channel_subscription(channel_id_param uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  is_currently_subscribed boolean;
  new_subscriber_count integer;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = current_user_id
    AND approval_status = 'approved'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only approved users can subscribe to channels');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM channels WHERE id = channel_id_param
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Channel not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM channel_subscribers
    WHERE channel_id = channel_id_param
    AND user_id = current_user_id
  ) INTO is_currently_subscribed;

  IF is_currently_subscribed THEN
    IF EXISTS (
      SELECT 1 FROM channels
      WHERE id = channel_id_param
      AND created_by = current_user_id
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Channel creator cannot unsubscribe'
      );
    END IF;

    DELETE FROM channel_subscribers
    WHERE channel_id = channel_id_param
    AND user_id = current_user_id;
  ELSE
    INSERT INTO channel_subscribers (channel_id, user_id)
    VALUES (channel_id_param, current_user_id)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  SELECT COUNT(*) INTO new_subscriber_count
  FROM channel_subscribers
  WHERE channel_id = channel_id_param;

  RETURN json_build_object(
    'success', true,
    'subscribed', NOT is_currently_subscribed,
    'subscriber_count', new_subscriber_count
  );
END;
$$;

-- Функция для переключения лайка поста в канале
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

-- Функция для удаления поста канала
CREATE OR REPLACE FUNCTION delete_channel_post(
  post_id uuid,
  deleter_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  post_channel_id uuid;
BEGIN
  SELECT channel_id INTO post_channel_id
  FROM channel_posts
  WHERE id = post_id;

  IF post_channel_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Post not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM channel_posts
    WHERE id = post_id
    AND author_id = deleter_user_id
  ) AND NOT EXISTS (
    SELECT 1 FROM channels
    WHERE id = post_channel_id
    AND created_by = deleter_user_id
  ) AND NOT EXISTS (
    SELECT 1 FROM channel_admins
    WHERE channel_id = post_channel_id
    AND user_id = deleter_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'No permission to delete this post');
  END IF;

  DELETE FROM channel_posts WHERE id = post_id;

  RETURN json_build_object('success', true);
END;
$$;

-- Функция для проверки прав на публикацию в канале
CREATE OR REPLACE FUNCTION can_post_in_channel(
  channel_id_param uuid,
  user_id_param uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM channels
    WHERE id = channel_id_param
    AND created_by = user_id_param
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM channel_admins
    WHERE channel_id = channel_id_param
    AND user_id = user_id_param
    AND can_post = true
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
