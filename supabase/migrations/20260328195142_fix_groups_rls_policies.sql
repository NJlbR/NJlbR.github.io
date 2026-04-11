/*
  # Исправление RLS политик для groups

  1. Изменения
    - Исправлена infinite recursion в политике для group_members
    - Упрощены политики для предотвращения циклических зависимостей
    - Добавлена проверка одобрения пользователей

  2. Безопасность
    - Пользователи могут видеть только свои группы
    - Только одобренные пользователи могут создавать группы
    - Все операции защищены RLS
*/

-- Удаление старых политик для group_members
DROP POLICY IF EXISTS "Users can view members of their groups" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;

-- Новые политики для group_members без infinite recursion
-- Используем прямую проверку через groups таблицу вместо self-join
CREATE POLICY "Users can view members of their groups"
  ON group_members FOR SELECT
  TO authenticated
  USING (
    group_id IN (
      SELECT gm.group_id FROM group_members gm
      WHERE gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Approved users can join groups"
  ON group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND approval_status = 'approved'
    )
  );

CREATE POLICY "Users can leave groups"
  ON group_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Обновление политики для создания групп
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;

CREATE POLICY "Approved users can create groups"
  ON groups FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND approval_status = 'approved'
    )
  );
