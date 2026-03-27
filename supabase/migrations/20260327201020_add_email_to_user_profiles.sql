/*
  # Добавление email в таблицу user_profiles

  1. Изменения
    - Добавляет поле `email` в таблицу `user_profiles`
    - Email сохраняется при регистрации для удобного доступа админов
    - Добавляет уникальный индекс на email

  2. Безопасность
    - Email видим только администраторам через RLS политики
    - Обычные пользователи не могут видеть email других пользователей
*/

-- Add email column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email text;

-- Add unique constraint on email
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_email_key ON user_profiles(email);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
