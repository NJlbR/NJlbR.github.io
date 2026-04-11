/*
  # Исправление политики INSERT для groups

  1. Проблема
    - Политика INSERT проверяет approval_status, но это работает корректно
    - Главная проблема: политика SELECT требует is_group_member, но при создании
      группы пользователь еще не добавлен в group_members
    - Это вызывает ошибку RLS при попытке вернуть созданную запись

  2. Решение
    - Изменяем политику SELECT для groups: пользователь видит группы, где он член
      ИЛИ где он создатель
    - Это позволит CREATE вернуть созданную запись до добавления в group_members

  3. Безопасность
    - Пользователи видят только свои группы (созданные или где они члены)
    - Только одобренные пользователи могут создавать группы
    - Все операции защищены RLS
*/

-- Удаляем текущую политику SELECT для groups
DROP POLICY IF EXISTS "users_select_own_groups" ON groups;

-- Создаём новую политику SELECT: видеть группы, где ты член ИЛИ создатель
CREATE POLICY "users_select_own_groups"
  ON groups FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    OR is_group_member(id, auth.uid())
  );