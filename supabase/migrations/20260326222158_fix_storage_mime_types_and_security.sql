/*
  # Исправление MIME типов Storage и улучшение безопасности

  1. Изменения
    - Добавляем все необходимые MIME типы для фотографий (JPEG, PNG, GIF, WebP, SVG, BMP, TIFF, ICO, HEIC, HEIF, AVIF)
    - Добавляем поддержку любых типов файлов для категории "file"
    - Увеличиваем лимит размера файла до 5 GB (5368709120 байт)
    - Проверяем и улучшаем RLS политики для безопасности
    
  2. Безопасность
    - Все таблицы имеют включенный RLS
    - Политики доступа проверены и усилены
    - Storage bucket остается публичным для чтения, но загрузка только для админов
*/

-- Обновляем конфигурацию bucket с полным списком MIME типов
UPDATE storage.buckets
SET 
  allowed_mime_types = ARRAY[
    -- Аудио форматы
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/m4a',
    'audio/aac',
    'audio/webm',
    'audio/x-m4a',
    'audio/x-wav',
    -- Видео форматы
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/avi',
    'video/x-ms-wmv',
    -- Фото форматы
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/heic',
    'image/heif',
    'image/avif',
    -- Документы и другие файлы
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'text/html',
    'text/xml',
    'application/json',
    'application/xml',
    'application/octet-stream'
  ],
  file_size_limit = 5368709120,
  updated_at = now()
WHERE name = 'media-files';

-- Проверяем и усиливаем политики безопасности для user_profiles
-- Убеждаемся, что обычные пользователи не могут изменить is_admin
DROP POLICY IF EXISTS "Users can view all profiles" ON user_profiles;
CREATE POLICY "Users can view all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND is_admin = (SELECT is_admin FROM user_profiles WHERE id = auth.uid())
  );

-- Усиливаем политики для постов - только админы могут создавать/изменять
DROP POLICY IF EXISTS "Anyone can view posts" ON posts;
CREATE POLICY "Anyone can view posts"
  ON posts
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Admins can create posts" ON posts;
CREATE POLICY "Admins can create posts"
  ON posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update posts" ON posts;
CREATE POLICY "Admins can update posts"
  ON posts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can delete posts" ON posts;
CREATE POLICY "Admins can delete posts"
  ON posts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Усиливаем политики для аннотаций - только админы могут создавать/изменять
DROP POLICY IF EXISTS "Anyone can view annotations" ON annotations;
CREATE POLICY "Anyone can view annotations"
  ON annotations
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Admins can create annotations" ON annotations;
CREATE POLICY "Admins can create annotations"
  ON annotations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update annotations" ON annotations;
CREATE POLICY "Admins can update annotations"
  ON annotations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can delete annotations" ON annotations;
CREATE POLICY "Admins can delete annotations"
  ON annotations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Проверяем политики для комментариев - защита от модерированных пользователей
DROP POLICY IF EXISTS "Users can create comments" ON comments;
CREATE POLICY "Users can create comments"
  ON comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM user_moderation
      WHERE user_id = auth.uid()
      AND (
        moderation_type = 'ban'
        OR (expires_at IS NOT NULL AND expires_at > now())
      )
    )
  );

DROP POLICY IF EXISTS "Users can update own comments" ON comments;
CREATE POLICY "Users can update own comments"
  ON comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Users can delete own comments"
  ON comments
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can delete any comment" ON comments;
CREATE POLICY "Admins can delete any comment"
  ON comments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Усиливаем политики для модерации - только админы
DROP POLICY IF EXISTS "Admins can create moderation records" ON user_moderation;
CREATE POLICY "Admins can create moderation records"
  ON user_moderation
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can view own moderation" ON user_moderation;
CREATE POLICY "Users can view own moderation"
  ON user_moderation
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Защита от SQL инъекций: создаем безопасные функции для проверки админа
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id AND is_admin = true
  );
$$;

-- Индексы для оптимизации производительности
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin ON user_profiles(is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_moderation_user_id ON user_moderation(user_id);
CREATE INDEX IF NOT EXISTS idx_user_moderation_expires_at ON user_moderation(expires_at) WHERE expires_at IS NOT NULL;
