/*
  # Заполнение email для существующих пользователей

  1. Назначение
    - Добавляет функцию для обновления email существующих пользователей
    - Эта функция может быть вызвана администратором для синхронизации email
    - Использует данные из auth.users для заполнения email в user_profiles

  2. Функции
    - `sync_user_emails()` - синхронизирует email из auth.users в user_profiles
*/

-- Create function to sync emails from auth.users to user_profiles
CREATE OR REPLACE FUNCTION sync_user_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update user_profiles with emails from auth.users
  UPDATE user_profiles
  SET email = auth_users.email
  FROM auth.users AS auth_users
  WHERE user_profiles.id = auth_users.id
  AND user_profiles.email IS NULL;
END;
$$;

-- Execute the function once to populate existing emails
SELECT sync_user_emails();

-- Grant execute permission to authenticated users (admins will use this)
GRANT EXECUTE ON FUNCTION sync_user_emails() TO authenticated;
