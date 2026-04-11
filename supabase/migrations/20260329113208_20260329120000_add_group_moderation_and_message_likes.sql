/*
  # Добавление модерации групп и лайков на сообщения

  1. Изменения в таблицах
    - Добавлено поле `is_moderator` в `group_members` для назначения модераторов
    - Создана таблица `group_banned_users` для черного списка выгнанных участников
    - Создана таблица `message_likes` для лайков на личные сообщения
    - Создана таблица `group_message_likes` для лайков на сообщения в группах

  2. Новые функции
    - `promote_to_moderator` - назначить модератора группы
    - `demote_from_moderator` - снять роль модератора
    - `kick_user_from_group` - выгнать участника из группы (в черный список)
    - `unban_user_from_group` - убрать пользователя из черного списка
    - `delete_group_message` - удалить сообщение в группе
    - `delete_private_message` - удалить личное сообщение
    - `is_group_admin_or_moderator` - проверка прав модератора/создателя
    - `toggle_message_like` - поставить/убрать лайк на личное сообщение
    - `toggle_group_message_like` - поставить/убрать лайк на сообщение в группе

  3. Безопасность
    - RLS политики для всех новых таблиц
    - Проверка прав доступа для всех операций модерации
    - Защита от самомодерации
*/

-- Добавляем поле is_moderator в group_members
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS is_moderator BOOLEAN DEFAULT false;

-- Создаем таблицу черного списка групп
CREATE TABLE IF NOT EXISTS group_banned_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  banned_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  reason TEXT,
  banned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Создаем таблицу лайков на личные сообщения
CREATE TABLE IF NOT EXISTS message_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Создаем таблицу лайков на сообщения в группах
CREATE TABLE IF NOT EXISTS group_message_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Добавляем поля для подсчета лайков в сообщения
ALTER TABLE messages ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;

-- Создаем индексы
CREATE INDEX IF NOT EXISTS idx_group_banned_users_group_id ON group_banned_users(group_id);
CREATE INDEX IF NOT EXISTS idx_group_banned_users_user_id ON group_banned_users(user_id);
CREATE INDEX IF NOT EXISTS idx_message_likes_message_id ON message_likes(message_id);
CREATE INDEX IF NOT EXISTS idx_message_likes_user_id ON message_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_group_message_likes_message_id ON group_message_likes(message_id);
CREATE INDEX IF NOT EXISTS idx_group_message_likes_user_id ON group_message_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_is_moderator ON group_members(group_id, is_moderator);

-- Функция проверки прав администратора или модератора группы
CREATE OR REPLACE FUNCTION is_group_admin_or_moderator(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  group_creator UUID;
  is_mod BOOLEAN;
BEGIN
  SELECT created_by INTO group_creator
  FROM groups
  WHERE id = check_group_id;
  
  IF group_creator = check_user_id THEN
    RETURN true;
  END IF;
  
  SELECT is_moderator INTO is_mod
  FROM group_members
  WHERE group_id = check_group_id AND user_id = check_user_id;
  
  RETURN COALESCE(is_mod, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция назначения модератора (только для создателя группы)
CREATE OR REPLACE FUNCTION promote_to_moderator(
  target_group_id UUID,
  target_user_id UUID,
  promoting_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  group_creator UUID;
BEGIN
  SELECT created_by INTO group_creator
  FROM groups
  WHERE id = target_group_id;
  
  IF group_creator IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Группа не найдена');
  END IF;
  
  IF group_creator != promoting_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Только создатель группы может назначать модераторов');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = target_group_id AND user_id = target_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Пользователь не является участником группы');
  END IF;
  
  UPDATE group_members
  SET is_moderator = true
  WHERE group_id = target_group_id AND user_id = target_user_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция снятия роли модератора (только для создателя группы)
CREATE OR REPLACE FUNCTION demote_from_moderator(
  target_group_id UUID,
  target_user_id UUID,
  demoting_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  group_creator UUID;
BEGIN
  SELECT created_by INTO group_creator
  FROM groups
  WHERE id = target_group_id;
  
  IF group_creator IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Группа не найдена');
  END IF;
  
  IF group_creator != demoting_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Только создатель группы может снимать модераторов');
  END IF;
  
  UPDATE group_members
  SET is_moderator = false
  WHERE group_id = target_group_id AND user_id = target_user_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция выгнать участника из группы (в черный список)
CREATE OR REPLACE FUNCTION kick_user_from_group(
  target_group_id UUID,
  target_user_id UUID,
  kicking_user_id UUID,
  kick_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  group_creator UUID;
BEGIN
  IF NOT is_group_admin_or_moderator(target_group_id, kicking_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Недостаточно прав');
  END IF;
  
  IF target_user_id = kicking_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Вы не можете выгнать самого себя');
  END IF;
  
  SELECT created_by INTO group_creator
  FROM groups
  WHERE id = target_group_id;
  
  IF target_user_id = group_creator THEN
    RETURN json_build_object('success', false, 'error', 'Нельзя выгнать создателя группы');
  END IF;
  
  DELETE FROM group_members
  WHERE group_id = target_group_id AND user_id = target_user_id;
  
  INSERT INTO group_banned_users (group_id, user_id, banned_by, reason)
  VALUES (target_group_id, target_user_id, kicking_user_id, kick_reason)
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция убрать пользователя из черного списка
CREATE OR REPLACE FUNCTION unban_user_from_group(
  target_group_id UUID,
  target_user_id UUID,
  unbanning_user_id UUID
)
RETURNS JSON AS $$
BEGIN
  IF NOT is_group_admin_or_moderator(target_group_id, unbanning_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Недостаточно прав');
  END IF;
  
  DELETE FROM group_banned_users
  WHERE group_id = target_group_id AND user_id = target_user_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Удаляем старую функцию join_group_by_code
DROP FUNCTION IF EXISTS join_group_by_code(text, uuid);

-- Создаем новую версию функции с проверкой черного списка
CREATE OR REPLACE FUNCTION join_group_by_code(code TEXT, joining_user_id UUID)
RETURNS JSON AS $$
DECLARE
  target_group_id UUID;
BEGIN
  SELECT id INTO target_group_id
  FROM groups
  WHERE invite_code = code;
  
  IF target_group_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Неверный код приглашения');
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM group_banned_users
    WHERE group_id = target_group_id AND user_id = joining_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Вы не можете присоединиться к этой группе');
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = target_group_id AND user_id = joining_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Вы уже состоите в этой группе');
  END IF;
  
  INSERT INTO group_members (group_id, user_id, is_admin, is_moderator)
  VALUES (target_group_id, joining_user_id, false, false);
  
  RETURN json_build_object('success', true, 'group_id', target_group_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция удаления сообщения в группе
CREATE OR REPLACE FUNCTION delete_group_message(
  target_message_id UUID,
  deleting_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  msg_group_id UUID;
  msg_sender_id UUID;
BEGIN
  SELECT group_id, sender_id INTO msg_group_id, msg_sender_id
  FROM group_messages
  WHERE id = target_message_id;
  
  IF msg_group_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Сообщение не найдено');
  END IF;
  
  IF msg_sender_id != deleting_user_id AND NOT is_group_admin_or_moderator(msg_group_id, deleting_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Недостаточно прав');
  END IF;
  
  DELETE FROM group_messages WHERE id = target_message_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция удаления личного сообщения
CREATE OR REPLACE FUNCTION delete_private_message(
  target_message_id UUID,
  deleting_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  msg_conversation_id UUID;
  msg_sender_id UUID;
  participant1 UUID;
  participant2 UUID;
BEGIN
  SELECT conversation_id, sender_id INTO msg_conversation_id, msg_sender_id
  FROM messages
  WHERE id = target_message_id;
  
  IF msg_conversation_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Сообщение не найдено');
  END IF;
  
  SELECT participant1_id, participant2_id INTO participant1, participant2
  FROM conversations
  WHERE id = msg_conversation_id;
  
  IF msg_sender_id != deleting_user_id AND participant1 != deleting_user_id AND participant2 != deleting_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Недостаточно прав');
  END IF;
  
  DELETE FROM messages WHERE id = target_message_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция лайка на личное сообщение
CREATE OR REPLACE FUNCTION toggle_message_like(
  target_message_id UUID,
  user_id_param UUID
)
RETURNS JSON AS $$
DECLARE
  like_exists BOOLEAN;
  new_like_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM message_likes
    WHERE message_id = target_message_id AND user_id = user_id_param
  ) INTO like_exists;
  
  IF like_exists THEN
    DELETE FROM message_likes
    WHERE message_id = target_message_id AND user_id = user_id_param;
    
    UPDATE messages
    SET like_count = GREATEST(like_count - 1, 0)
    WHERE id = target_message_id
    RETURNING like_count INTO new_like_count;
    
    RETURN json_build_object('liked', false, 'like_count', COALESCE(new_like_count, 0));
  ELSE
    INSERT INTO message_likes (message_id, user_id)
    VALUES (target_message_id, user_id_param)
    ON CONFLICT (message_id, user_id) DO NOTHING;
    
    UPDATE messages
    SET like_count = like_count + 1
    WHERE id = target_message_id
    RETURNING like_count INTO new_like_count;
    
    RETURN json_build_object('liked', true, 'like_count', COALESCE(new_like_count, 0));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция лайка на сообщение в группе
CREATE OR REPLACE FUNCTION toggle_group_message_like(
  target_message_id UUID,
  user_id_param UUID
)
RETURNS JSON AS $$
DECLARE
  like_exists BOOLEAN;
  new_like_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM group_message_likes
    WHERE message_id = target_message_id AND user_id = user_id_param
  ) INTO like_exists;
  
  IF like_exists THEN
    DELETE FROM group_message_likes
    WHERE message_id = target_message_id AND user_id = user_id_param;
    
    UPDATE group_messages
    SET like_count = GREATEST(like_count - 1, 0)
    WHERE id = target_message_id
    RETURNING like_count INTO new_like_count;
    
    RETURN json_build_object('liked', false, 'like_count', COALESCE(new_like_count, 0));
  ELSE
    INSERT INTO group_message_likes (message_id, user_id)
    VALUES (target_message_id, user_id_param)
    ON CONFLICT (message_id, user_id) DO NOTHING;
    
    UPDATE group_messages
    SET like_count = like_count + 1
    WHERE id = target_message_id
    RETURNING like_count INTO new_like_count;
    
    RETURN json_build_object('liked', true, 'like_count', COALESCE(new_like_count, 0));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS для group_banned_users
ALTER TABLE group_banned_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Создатель и модераторы могут просматривать черный список"
  ON group_banned_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = auth.uid()
      WHERE g.id = group_banned_users.group_id
      AND (g.created_by = auth.uid() OR gm.is_moderator = true)
    )
  );

-- RLS для message_likes
ALTER TABLE message_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Пользователи могут видеть лайки на сообщения в своих диалогах"
  ON message_likes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_likes.message_id
      AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
  );

CREATE POLICY "Пользователи могут ставить лайки на сообщения в своих диалогах"
  ON message_likes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_likes.message_id
      AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
  );

CREATE POLICY "Пользователи могут удалять свои лайки"
  ON message_likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS для group_message_likes
ALTER TABLE group_message_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Участники группы могут видеть лайки на сообщения"
  ON group_message_likes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_messages gm
      JOIN group_members gmem ON gmem.group_id = gm.group_id
      WHERE gm.id = group_message_likes.message_id
      AND gmem.user_id = auth.uid()
    )
  );

CREATE POLICY "Участники группы могут ставить лайки на сообщения"
  ON group_message_likes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM group_messages gm
      JOIN group_members gmem ON gmem.group_id = gm.group_id
      WHERE gm.id = group_message_likes.message_id
      AND gmem.user_id = auth.uid()
    )
  );

CREATE POLICY "Пользователи могут удалять свои лайки"
  ON group_message_likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
