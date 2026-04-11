/*
  # Добавление системы групп

  1. Новые таблицы
    - `groups`
      - `id` (uuid, primary key)
      - `name` (text, название группы)
      - `invite_code` (text, уникальный код приглашения)
      - `created_by` (uuid, создатель группы)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `group_members`
      - `id` (uuid, primary key)
      - `group_id` (uuid, ссылка на groups)
      - `user_id` (uuid, ссылка на user_profiles)
      - `is_admin` (boolean, является ли администратором группы)
      - `joined_at` (timestamptz)
    
    - `group_messages`
      - `id` (uuid, primary key)
      - `group_id` (uuid, ссылка на groups)
      - `sender_id` (uuid, отправитель)
      - `content` (text, содержимое сообщения)
      - `media_urls` (jsonb, массив медиафайлов)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Безопасность
    - Включен RLS для всех таблиц
    - Пользователи могут видеть только свои группы
    - Только участники могут читать сообщения группы
    - Только участники могут отправлять сообщения
    - Только создатель может удалить группу

  3. Функции
    - `generate_invite_code()` - генерация уникального кода приглашения
    - `join_group_by_code()` - присоединение к группе по коду
    - `leave_group()` - выход из группы
*/

-- Создание таблицы groups
CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
  invite_code text UNIQUE NOT NULL,
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Создание таблицы group_members
CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  is_admin boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Создание таблицы group_messages
CREATE TABLE IF NOT EXISTS group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content text CHECK (content IS NULL OR char_length(content) <= 10000),
  media_urls jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON group_messages(created_at DESC);

-- Включение RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- Политики для groups
CREATE POLICY "Users can view groups they are members of"
  ON groups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create groups"
  ON groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group creators can update their groups"
  ON groups FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group creators can delete their groups"
  ON groups FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Политики для group_members
CREATE POLICY "Users can view members of their groups"
  ON group_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join groups"
  ON group_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave groups"
  ON group_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Политики для group_messages
CREATE POLICY "Group members can view messages"
  ON group_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_messages.group_id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can send messages"
  ON group_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_messages.group_id
      AND group_members.user_id = auth.uid()
    )
  );

-- Функция генерации уникального кода приглашения
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  result text := '';
  i integer;
  code_exists boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..10 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    SELECT EXISTS(SELECT 1 FROM groups WHERE invite_code = result) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN result;
END;
$$;

-- Функция присоединения к группе по коду
CREATE OR REPLACE FUNCTION join_group_by_code(
  code text,
  joining_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_group_id uuid;
  already_member boolean;
BEGIN
  -- Проверка одобрения пользователя
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = joining_user_id
    AND approval_status = 'approved'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ваша учетная запись должна быть одобрена администратором'
    );
  END IF;

  -- Поиск группы по коду
  SELECT id INTO target_group_id
  FROM groups
  WHERE invite_code = code;

  IF target_group_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Группа с таким кодом не найдена'
    );
  END IF;

  -- Проверка, не является ли пользователь уже участником
  SELECT EXISTS(
    SELECT 1 FROM group_members
    WHERE group_id = target_group_id
    AND user_id = joining_user_id
  ) INTO already_member;

  IF already_member THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Вы уже являетесь участником этой группы'
    );
  END IF;

  -- Добавление пользователя в группу
  INSERT INTO group_members (group_id, user_id, is_admin)
  VALUES (target_group_id, joining_user_id, false);

  RETURN jsonb_build_object(
    'success', true,
    'group_id', target_group_id
  );
END;
$$;

-- Функция выхода из группы
CREATE OR REPLACE FUNCTION leave_group(
  leaving_group_id uuid,
  leaving_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_creator boolean;
  members_count integer;
BEGIN
  -- Проверка, является ли пользователь создателем
  SELECT EXISTS(
    SELECT 1 FROM groups
    WHERE id = leaving_group_id
    AND created_by = leaving_user_id
  ) INTO is_creator;

  -- Подсчет участников
  SELECT COUNT(*) INTO members_count
  FROM group_members
  WHERE group_id = leaving_group_id;

  -- Если создатель и он не один, запретить выход
  IF is_creator AND members_count > 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Создатель не может покинуть группу, пока в ней есть другие участники. Удалите группу или передайте права администратора.'
    );
  END IF;

  -- Удаление участника
  DELETE FROM group_members
  WHERE group_id = leaving_group_id
  AND user_id = leaving_user_id;

  -- Если это был последний участник и создатель, удаляем группу
  IF is_creator AND members_count = 1 THEN
    DELETE FROM groups WHERE id = leaving_group_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true
  );
END;
$$;

-- Включение realtime для group_messages
ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;