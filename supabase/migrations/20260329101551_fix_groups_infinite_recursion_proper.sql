/*
  # Правильное исправление infinite recursion в группах

  1. Проблема
    - Политики group_members обращаются к самой таблице group_members, создавая рекурсию
    - Postgres не может определить доступ, так как проверка доступа требует доступа

  2. Решение
    - Создаём security definer функцию для проверки membership
    - Функция выполняется с правами создателя и обходит RLS
    - Используем эту функцию в политиках вместо прямых запросов

  3. Безопасность
    - Пользователи видят только свои группы и членство
    - Только одобренные пользователи могут создавать группы
    - Все операции защищены правильными RLS политиками
*/

-- Создаём security definer функцию для проверки членства в группе
-- Эта функция обходит RLS и позволяет избежать рекурсии
CREATE OR REPLACE FUNCTION is_group_member(
  check_group_id uuid,
  check_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = check_group_id
    AND user_id = check_user_id
  );
$$;

-- Удаляем ВСЕ существующие политики для groups
DROP POLICY IF EXISTS "Users can view groups they are members of" ON groups;
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
DROP POLICY IF EXISTS "Approved users can create groups" ON groups;
DROP POLICY IF EXISTS "Group creators can update their groups" ON groups;
DROP POLICY IF EXISTS "Group creators can delete their groups" ON groups;
DROP POLICY IF EXISTS "Select groups" ON groups;
DROP POLICY IF EXISTS "Insert groups" ON groups;
DROP POLICY IF EXISTS "Update groups" ON groups;
DROP POLICY IF EXISTS "Delete groups" ON groups;
DROP POLICY IF EXISTS "Users can view all groups" ON groups;
DROP POLICY IF EXISTS "Users can update their own groups" ON groups;
DROP POLICY IF EXISTS "Users can delete their own groups" ON groups;

-- Удаляем ВСЕ существующие политики для group_members
DROP POLICY IF EXISTS "Users can view members of their groups" ON group_members;
DROP POLICY IF EXISTS "Approved users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave their groups" ON group_members;
DROP POLICY IF EXISTS "View group members in own groups" ON group_members;
DROP POLICY IF EXISTS "Select group members" ON group_members;
DROP POLICY IF EXISTS "Insert group members" ON group_members;
DROP POLICY IF EXISTS "Delete group members" ON group_members;
DROP POLICY IF EXISTS "Users can view all group memberships" ON group_members;
DROP POLICY IF EXISTS "Authenticated users can insert memberships" ON group_members;
DROP POLICY IF EXISTS "Users can delete their own memberships" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage members" ON group_members;
DROP POLICY IF EXISTS "Users can view their group memberships" ON group_members;
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;

-- Удаляем ВСЕ политики для group_messages
DROP POLICY IF EXISTS "Group members can view messages" ON group_messages;
DROP POLICY IF EXISTS "Group members can send messages" ON group_messages;

-- ========================================
-- НОВЫЕ БЕЗОПАСНЫЕ ПОЛИТИКИ ДЛЯ GROUPS
-- ========================================

-- SELECT: пользователи видят только группы, в которых они состоят
CREATE POLICY "users_select_own_groups"
  ON groups FOR SELECT
  TO authenticated
  USING (is_group_member(id, auth.uid()));

-- INSERT: только одобренные пользователи могут создавать группы
CREATE POLICY "approved_users_insert_groups"
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

-- UPDATE: только создатель может обновлять группу
CREATE POLICY "creators_update_groups"
  ON groups FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- DELETE: только создатель может удалять группу
CREATE POLICY "creators_delete_groups"
  ON groups FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ========================================
-- НОВЫЕ БЕЗОПАСНЫЕ ПОЛИТИКИ ДЛЯ GROUP_MEMBERS
-- ========================================

-- SELECT: видеть участников только тех групп, где ты состоишь
CREATE POLICY "users_select_members_of_own_groups"
  ON group_members FOR SELECT
  TO authenticated
  USING (is_group_member(group_id, auth.uid()));

-- INSERT: только одобренные пользователи могут вступать в группы
-- Вставлять можно только себя
CREATE POLICY "approved_users_insert_memberships"
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

-- DELETE: удалять можно только своё членство
CREATE POLICY "users_delete_own_membership"
  ON group_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ========================================
-- НОВЫЕ БЕЗОПАСНЫЕ ПОЛИТИКИ ДЛЯ GROUP_MESSAGES
-- ========================================

-- SELECT: видеть сообщения только из групп, где ты состоишь
CREATE POLICY "members_select_group_messages"
  ON group_messages FOR SELECT
  TO authenticated
  USING (is_group_member(group_id, auth.uid()));

-- INSERT: отправлять сообщения могут только участники группы
CREATE POLICY "members_insert_group_messages"
  ON group_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND is_group_member(group_id, auth.uid())
  );

-- Даём права на выполнение функции всем authenticated пользователям
GRANT EXECUTE ON FUNCTION is_group_member(uuid, uuid) TO authenticated;
