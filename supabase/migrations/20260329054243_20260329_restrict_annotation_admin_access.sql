/*
  # Исправление RLS политик для annotations, hashtags и persons (только админы)

  1. Проблема
    - Любой аутентифицированный пользователь может создавать, обновлять и удалять аннотации
    - Любой может управлять хэштегами и персонами
    - Это позволяет пользователям испортить базу данных

  2. Решение
    - Только адміны могут создавать/обновлять/удалять аннотации
    - Только адміны могут управлять хэштегами и персонами
    - Обычные пользователи могут только читать

  3. Безопасность
    - Данные защищены от несанкционированных изменений
    - Только доверенные администраторы могут менять справочники
*/

-- Удаление старых permissive политик для annotations
DROP POLICY IF EXISTS "Authenticated users can create annotations" ON annotations;
DROP POLICY IF EXISTS "Authenticated users can update annotations" ON annotations;
DROP POLICY IF EXISTS "Authenticated users can delete annotations" ON annotations;
DROP POLICY IF EXISTS "All users can view annotations" ON annotations;

-- Новые политики для annotations (только админы могут писать)
CREATE POLICY "Anyone can read annotations"
  ON annotations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can create annotations"
  ON annotations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can update annotations"
  ON annotations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can delete annotations"
  ON annotations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Удаление старых политик для hashtags
DROP POLICY IF EXISTS "Authenticated users can create hashtags" ON hashtags;
DROP POLICY IF EXISTS "Authenticated users can update hashtags" ON hashtags;
DROP POLICY IF EXISTS "Authenticated users can delete hashtags" ON hashtags;
DROP POLICY IF EXISTS "All users can view hashtags" ON hashtags;

-- Новые политики для hashtags (только админы могут писать)
CREATE POLICY "Anyone can read hashtags"
  ON hashtags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can create hashtags"
  ON hashtags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can update hashtags"
  ON hashtags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can delete hashtags"
  ON hashtags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Удаление старых политик для persons
DROP POLICY IF EXISTS "Authenticated users can create persons" ON persons;
DROP POLICY IF EXISTS "Authenticated users can update persons" ON persons;
DROP POLICY IF EXISTS "Authenticated users can delete persons" ON persons;
DROP POLICY IF EXISTS "All users can view persons" ON persons;

-- Новые политики для persons (только админы могут писать)
CREATE POLICY "Anyone can read persons"
  ON persons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can create persons"
  ON persons FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can update persons"
  ON persons FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can delete persons"
  ON persons FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );
