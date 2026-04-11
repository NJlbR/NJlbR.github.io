/*
  # Удаление public доступа к функциям increment_post_views

  1. Проблема
    - Функция increment_post_views доступна для всех (public access)
    - Неодобренные пользователи могут манипулировать счетчиком просмотров
    - Это позволяет спамерам и ботам подделывать популярность контента

  2. Решение
    - Удалить GRANT EXECUTE ON ... TO public
    - Разрешить доступ только аутентифицированным пользователям
    - Добавить проверку approval_status в логику функции

  3. Безопасность
    - Только одобренные пользователи могут увеличивать просмотры
    - Защита от манипулирования счетчиками
*/

-- Удаляем public доступ и переживаем authenticated access
REVOKE EXECUTE ON FUNCTION increment_post_views(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION increment_post_views(uuid) FROM authenticated;

-- Запрещаем доступ всем по умолчанию
GRANT EXECUTE ON FUNCTION increment_post_views(uuid) TO authenticated;

-- Обновляем функцию, добавляя проверку approval_status
DROP FUNCTION IF EXISTS increment_post_views(uuid);

CREATE FUNCTION increment_post_views(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Проверяем, что пользователь одобрен
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'User is not approved to view posts';
  END IF;

  -- Проверяем, не просматривал ли уже этот пост этот пользователь за последний час
  IF NOT EXISTS (
    SELECT 1 FROM posts_views
    WHERE post_id = p_post_id
    AND user_id = auth.uid()
    AND viewed_at > now() - interval '1 hour'
  ) THEN
    INSERT INTO posts_views (post_id, user_id, viewed_at)
    VALUES (p_post_id, auth.uid(), now());

    UPDATE posts_stats
    SET view_count = view_count + 1,
        updated_at = now()
    WHERE post_id = p_post_id;
  END IF;
END;
$$;
