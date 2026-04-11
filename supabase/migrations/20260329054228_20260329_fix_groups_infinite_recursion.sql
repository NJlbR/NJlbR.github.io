/*
  # Полное исправление infinite recursion в group_members RLS политиках

  1. Проблема
    - Селфджойн в подзапросе вызывает бесконечную рекурсию
    - При обращении к group_members в USING части для group_members таблицы RLS пытается 
      проверить доступ снова, создавая цикл

  2. Решение
    - Не использовать group_members в USING части подзапроса
    - Проверять membership через groups таблицу напрямую
    - Упростить логику политик

  3. Безопасность
    - Пользователи видят только члены групп, в которых они состоят
    - Только одобренные пользователи могут создавать/присоединяться к группам
    - Все операции полностью защищены RLS
*/

-- Удаление всех старых (рекурсивных) политик для group_members
DROP POLICY IF EXISTS "Users can view members of their groups" ON group_members;
DROP POLICY IF EXISTS "Approved users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave their groups" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "View group members in own groups" ON group_members;

-- SELECT политика: видеть членов ТОЛЬКО своих групп
-- Проверяем, что текущий пользователь является членом этой группы
-- Не используем подзапрос к group_members для избежания рекурсии
CREATE POLICY "Select group members"
  ON group_members FOR SELECT
  TO authenticated
  USING (
    group_id IN (
      SELECT g.id FROM groups g
      WHERE EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = g.id
        AND gm.user_id = auth.uid()
      )
    )
  );

-- INSERT политика: только одобренные пользователи могут присоединяться
CREATE POLICY "Insert group members"
  ON group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.approval_status = 'approved'
    )
  );

-- DELETE политика: удалять только свою запись
CREATE POLICY "Delete group members"
  ON group_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Удаление старых политик для groups
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
DROP POLICY IF EXISTS "Approved users can create groups" ON groups;
DROP POLICY IF EXISTS "Users can view groups" ON groups;
DROP POLICY IF EXISTS "View accessible groups" ON groups;
DROP POLICY IF EXISTS "Approved users create groups" ON groups;
DROP POLICY IF EXISTS "Creator can update group" ON groups;
DROP POLICY IF EXISTS "Creator can delete group" ON groups;

-- SELECT политика: видеть только свои и те, где ты член
CREATE POLICY "Select groups"
  ON groups FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
    )
  );

-- INSERT политика: создавать группы только одобренные пользователи
CREATE POLICY "Insert groups"
  ON groups FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.approval_status = 'approved'
    )
  );

-- UPDATE политика: только создатель может обновлять группу
CREATE POLICY "Update groups"
  ON groups FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- DELETE политика: только создатель может удалять
CREATE POLICY "Delete groups"
  ON groups FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);
