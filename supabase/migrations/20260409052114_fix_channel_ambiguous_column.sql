/*
  # Исправление ошибки ambiguous column reference в функции create_channel

  1. Проблема
    - В функции create_channel есть ошибка "column reference "channel_id" is ambiguous"
    - Нужно уточнить таблицы в SELECT запросе

  2. Решение
    - Переписать функцию с явным указанием таблиц
    - Исправить функцию toggle_channel_subscription
*/

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
  new_channel_id uuid;
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

  -- Создаем канал
  INSERT INTO channels (username, name, description, created_by)
  VALUES (LOWER(username_param), name_param, description_param, auth.uid())
  RETURNING channels.id INTO new_channel_id;

  -- Автоматически подписываем создателя
  INSERT INTO channel_subscribers (channel_id, user_id)
  VALUES (new_channel_id, auth.uid())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  -- Возвращаем данные канала
  SELECT json_build_object(
    'id', c.id,
    'username', c.username,
    'name', c.name,
    'description', c.description,
    'created_by', c.created_by,
    'created_at', c.created_at
  ) INTO result
  FROM channels c
  WHERE c.id = new_channel_id;

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
  is_creator boolean;
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

  -- Проверяем подписку
  SELECT EXISTS (
    SELECT 1 FROM channel_subscribers cs
    WHERE cs.channel_id = channel_id_param
    AND cs.user_id = current_user_id
  ) INTO is_currently_subscribed;

  -- Проверяем, является ли пользователь создателем канала
  SELECT EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = channel_id_param
    AND c.created_by = current_user_id
  ) INTO is_creator;

  IF is_currently_subscribed THEN
    -- Отписываемся (только если не создатель)
    IF is_creator THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Channel creator cannot unsubscribe'
      );
    END IF;

    DELETE FROM channel_subscribers cs
    WHERE cs.channel_id = channel_id_param
    AND cs.user_id = current_user_id;
  ELSE
    -- Подписываемся
    INSERT INTO channel_subscribers (channel_id, user_id)
    VALUES (channel_id_param, current_user_id)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  -- Получаем количество подписчиков
  SELECT COUNT(*) INTO new_subscriber_count
  FROM channel_subscribers cs
  WHERE cs.channel_id = channel_id_param;

  RETURN json_build_object(
    'success', true,
    'subscribed', NOT is_currently_subscribed,
    'subscriber_count', new_subscriber_count
  );
END;
$$;
