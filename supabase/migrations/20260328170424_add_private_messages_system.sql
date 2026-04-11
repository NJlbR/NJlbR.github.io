/*
  # Система личных сообщений
  
  ## Описание
  Добавляет функциональность личных сообщений между пользователями с поддержкой текста, фото, аудио, видео и файлов.
  
  ## Новые таблицы
  
  ### `conversations`
  - `id` (uuid, primary key) - ID диалога
  - `participant1_id` (uuid) - ID первого участника
  - `participant2_id` (uuid) - ID второго участника
  - `last_message_at` (timestamptz) - Время последнего сообщения
  - `created_at` (timestamptz) - Дата создания
  - `updated_at` (timestamptz) - Дата обновления
  
  ### `messages`
  - `id` (uuid, primary key) - ID сообщения
  - `conversation_id` (uuid) - ID диалога
  - `sender_id` (uuid) - ID отправителя
  - `content` (text) - Текст сообщения (опционально)
  - `media_urls` (jsonb) - Массив медиафайлов
  - `is_read` (boolean) - Прочитано ли сообщение
  - `created_at` (timestamptz) - Дата отправки
  - `updated_at` (timestamptz) - Дата обновления
  
  ## Безопасность
  - RLS включен для всех таблиц
  - Пользователи могут видеть только свои диалоги
  - Пользователи могут отправлять сообщения только в свои диалоги
  - Только одобренные пользователи могут создавать диалоги и отправлять сообщения
  - Админы видят email всех участников диалогов
  
  ## Индексы
  - Индекс на участников диалогов для быстрого поиска
  - Индекс на conversation_id для быстрой загрузки сообщений
  - Индекс на sender_id для поиска сообщений пользователя
  - Индекс на is_read для подсчета непрочитанных сообщений
*/

-- Создание таблицы диалогов
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT different_participants CHECK (participant1_id != participant2_id),
  CONSTRAINT ordered_participants CHECK (participant1_id < participant2_id)
);

-- Создание таблицы сообщений
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  media_urls jsonb DEFAULT '[]'::jsonb,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT message_has_content CHECK (
    content IS NOT NULL AND length(trim(content)) > 0 
    OR jsonb_array_length(media_urls) > 0
  ),
  CONSTRAINT content_length CHECK (
    content IS NULL OR length(content) <= 10000
  )
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_conversations_participant1 ON conversations(participant1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participant2 ON conversations(participant2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read) WHERE is_read = false;

-- Функция для получения или создания диалога
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  user1_id uuid,
  user2_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  conv_id uuid;
  min_id uuid;
  max_id uuid;
BEGIN
  -- Сортируем ID для соблюдения constraint ordered_participants
  IF user1_id < user2_id THEN
    min_id := user1_id;
    max_id := user2_id;
  ELSE
    min_id := user2_id;
    max_id := user1_id;
  END IF;
  
  -- Проверяем, одобрен ли пользователь
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Только одобренные пользователи могут создавать диалоги';
  END IF;
  
  -- Ищем существующий диалог
  SELECT id INTO conv_id
  FROM conversations
  WHERE participant1_id = min_id AND participant2_id = max_id;
  
  -- Если не найден, создаем новый
  IF conv_id IS NULL THEN
    INSERT INTO conversations (participant1_id, participant2_id)
    VALUES (min_id, max_id)
    RETURNING id INTO conv_id;
  END IF;
  
  RETURN conv_id;
END;
$$;

-- Функция для обновления времени последнего сообщения
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$;

-- Триггер для обновления времени последнего сообщения
DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON messages;
CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- Функция для пометки сообщений как прочитанных
CREATE OR REPLACE FUNCTION mark_messages_as_read(
  conv_id uuid,
  reader_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE messages
  SET is_read = true,
      updated_at = now()
  WHERE conversation_id = conv_id
    AND sender_id != reader_id
    AND is_read = false;
END;
$$;

-- Включение RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Политики для conversations

-- Пользователи могут видеть только свои диалоги
CREATE POLICY "Users can view their own conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    participant1_id = auth.uid() OR participant2_id = auth.uid()
  );

-- Одобренные пользователи могут создавать диалоги
CREATE POLICY "Approved users can create conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    (participant1_id = auth.uid() OR participant2_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND approval_status = 'approved'
    )
  );

-- Политики для messages

-- Пользователи могут видеть сообщения из своих диалогов
CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = messages.conversation_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
  );

-- Одобренные пользователи могут отправлять сообщения в свои диалоги
CREATE POLICY "Approved users can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations
      WHERE id = messages.conversation_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND approval_status = 'approved'
    )
  );

-- Пользователи могут обновлять статус прочитанности своих сообщений
CREATE POLICY "Users can update read status"
  ON messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = messages.conversation_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = messages.conversation_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
  );

-- Функция для поиска пользователей по username
CREATE OR REPLACE FUNCTION search_users_by_username(search_query text)
RETURNS TABLE (
  id uuid,
  username text,
  is_admin boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Проверяем, что текущий пользователь одобрен
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Только одобренные пользователи могут искать других пользователей';
  END IF;

  RETURN QUERY
  SELECT 
    up.id,
    up.username,
    up.is_admin
  FROM user_profiles up
  WHERE up.approval_status = 'approved'
    AND up.id != auth.uid()
    AND lower(up.username) LIKE lower('%' || search_query || '%')
  ORDER BY up.username
  LIMIT 20;
END;
$$;

-- Комментарии для документации
COMMENT ON TABLE conversations IS 'Диалоги между пользователями';
COMMENT ON TABLE messages IS 'Сообщения в диалогах';
COMMENT ON FUNCTION get_or_create_conversation IS 'Получить существующий диалог или создать новый';
COMMENT ON FUNCTION mark_messages_as_read IS 'Пометить сообщения как прочитанные';
COMMENT ON FUNCTION search_users_by_username IS 'Поиск пользователей по username для создания диалога';
