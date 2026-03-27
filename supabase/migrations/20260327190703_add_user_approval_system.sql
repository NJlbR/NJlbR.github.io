/*
  # Система одобрения новых пользователей

  1. Изменения в таблицах
    - Добавлен статус одобрения в `user_profiles`
      - `approval_status` - статус одобрения (pending, approved, rejected)
      - `approved_by` - ID админа, одобрившего/отклонившего
      - `approval_date` - дата одобрения/отклонения
    
  2. Новая таблица `rejected_registrations`
    - Хранит отклоненные регистрации с временной блокировкой на 24 часа
    - `username` - заблокированный username
    - `email` - заблокированный email
    - `rejected_at` - время отклонения
    - `rejected_by` - ID админа, отклонившего
    - `expires_at` - время истечения блокировки (24 часа)

  3. Безопасность
    - Только админы могут изменять статус одобрения
    - Пользователи со статусом pending не могут оставлять комментарии
    - Автоматическая проверка заблокированных username/email при регистрации

  4. Функции
    - `is_registration_blocked` - проверяет, заблокирована ли регистрация
    - `approve_user` - одобряет пользователя
    - `reject_user` - отклоняет пользователя и блокирует на 24 часа
*/

-- Добавляем поля одобрения в user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN approval_status text DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    ADD COLUMN approved_by uuid REFERENCES auth.users(id),
    ADD COLUMN approval_date timestamptz;
  END IF;
END $$;

-- Создаем таблицу отклоненных регистраций
CREATE TABLE IF NOT EXISTS rejected_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  email text NOT NULL,
  rejected_at timestamptz DEFAULT now(),
  rejected_by uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rejected_registrations ENABLE ROW LEVEL SECURITY;

-- Только админы могут видеть отклоненные регистрации
CREATE POLICY "Admins can view rejected registrations"
  ON rejected_registrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Только админы могут добавлять отклоненные регистрации
CREATE POLICY "Admins can insert rejected registrations"
  ON rejected_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Обновляем политику комментариев - только одобренные пользователи могут комментировать
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON comments;

CREATE POLICY "Approved users can insert comments"
  ON comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.approval_status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM user_moderation
        WHERE user_moderation.user_id = auth.uid()
        AND user_moderation.is_active = true
        AND (
          user_moderation.moderation_type = 'ban'
          OR (user_moderation.expires_at IS NOT NULL AND user_moderation.expires_at > now())
        )
      )
    )
  );

-- Функция для проверки блокировки регистрации
CREATE OR REPLACE FUNCTION is_registration_blocked(
  check_username text,
  check_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM rejected_registrations
    WHERE (LOWER(username) = LOWER(check_username) OR LOWER(email) = LOWER(check_email))
    AND expires_at > now()
  );
END;
$$;

-- Функция для одобрения пользователя
CREATE OR REPLACE FUNCTION approve_user(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Проверяем, что вызывающий - админ
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can approve users';
  END IF;

  -- Одобряем пользователя
  UPDATE user_profiles
  SET 
    approval_status = 'approved',
    approved_by = auth.uid(),
    approval_date = now(),
    updated_at = now()
  WHERE id = user_id;
END;
$$;

-- Функция для отклонения пользователя
CREATE OR REPLACE FUNCTION reject_user(
  user_id uuid,
  block_username text,
  block_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Проверяем, что вызывающий - админ
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can reject users';
  END IF;

  -- Отклоняем пользователя
  UPDATE user_profiles
  SET 
    approval_status = 'rejected',
    approved_by = auth.uid(),
    approval_date = now(),
    updated_at = now()
  WHERE id = user_id;

  -- Добавляем в список заблокированных на 24 часа
  INSERT INTO rejected_registrations (
    username,
    email,
    rejected_by,
    expires_at
  ) VALUES (
    block_username,
    block_email,
    auth.uid(),
    now() + interval '24 hours'
  );
END;
$$;

-- Функция для автоматической очистки истекших блокировок
CREATE OR REPLACE FUNCTION cleanup_expired_rejections()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rejected_registrations
  WHERE expires_at < now();
END;
$$;

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_user_profiles_approval_status 
  ON user_profiles(approval_status) 
  WHERE approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_rejected_registrations_username_lower 
  ON rejected_registrations(LOWER(username));

CREATE INDEX IF NOT EXISTS idx_rejected_registrations_email_lower 
  ON rejected_registrations(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_rejected_registrations_expires_at 
  ON rejected_registrations(expires_at);

-- Одобряем существующих пользователей (миграция)
UPDATE user_profiles
SET approval_status = 'approved'
WHERE approval_status = 'pending';
