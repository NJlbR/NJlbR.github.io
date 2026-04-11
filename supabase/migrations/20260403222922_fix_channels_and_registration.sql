/*
  # Исправление каналов и регистрации

  1. Функции
    - Создаем функцию toggle_channel_subscription для подписки на каналы
    - Создаем функцию для проверки существования username

  2. Безопасность
    - Только одобренные пользователи могут подписываться на каналы
    - Проверка существования username перед регистрацией
*/

-- Функция для проверки существования username
CREATE OR REPLACE FUNCTION is_username_taken(check_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Проверяем user_profiles
  IF EXISTS (
    SELECT 1 FROM user_profiles
    WHERE username = check_username
  ) THEN
    RETURN true;
  END IF;

  -- Проверяем channels
  IF EXISTS (
    SELECT 1 FROM channels
    WHERE username = check_username
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Функция для подписки/отписки от канала
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
  -- Получаем ID текущего пользователя
  current_user_id := auth.uid();

  -- Проверяем авторизацию
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Требуется авторизация');
  END IF;

  -- Проверяем одобрение пользователя
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = current_user_id
    AND approval_status = 'approved'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Только одобренные пользователи могут подписываться на каналы');
  END IF;

  -- Проверяем, подписан ли пользователь
  SELECT EXISTS (
    SELECT 1 FROM channel_subscribers
    WHERE channel_id = channel_id_param
    AND user_id = current_user_id
  ) INTO is_currently_subscribed;

  IF is_currently_subscribed THEN
    -- Отписываемся
    DELETE FROM channel_subscribers
    WHERE channel_id = channel_id_param
    AND user_id = current_user_id;
  ELSE
    -- Подписываемся
    INSERT INTO channel_subscribers (channel_id, user_id)
    VALUES (channel_id_param, current_user_id)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  -- Получаем новое количество подписчиков
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
