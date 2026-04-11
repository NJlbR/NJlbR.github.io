/*
  # Public Groups And Invite Preview

  1. Groups
    - Ensure `is_public` exists on `groups`

  2. Functions
    - `list_visible_groups(viewer_id)` returns open groups for everyone and private groups for members
    - `get_group_preview(group_code, group_id, viewer_id)` returns group profile data for open groups or valid invite codes
    - `join_public_group(target_group_id, joining_user_id)` joins an open group

  3. Access
    - Preview/list functions are executable by `anon` and `authenticated`
    - Join function is executable by `authenticated`
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'groups' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE groups ADD COLUMN is_public BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION list_visible_groups(viewer_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  invite_code text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_public boolean,
  members_count bigint,
  is_member boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    g.id,
    g.name,
    g.invite_code,
    g.created_by,
    g.created_at,
    g.updated_at,
    COALESCE(g.is_public, false) AS is_public,
    (
      SELECT COUNT(*)
      FROM group_members gm_count
      WHERE gm_count.group_id = g.id
    ) AS members_count,
    CASE
      WHEN viewer_id IS NULL THEN false
      ELSE EXISTS (
        SELECT 1
        FROM group_members gm_member
        WHERE gm_member.group_id = g.id
          AND gm_member.user_id = viewer_id
      )
    END AS is_member
  FROM groups g
  WHERE COALESCE(g.is_public, false) = true
     OR (
       viewer_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM group_members gm_visible
         WHERE gm_visible.group_id = g.id
           AND gm_visible.user_id = viewer_id
       )
     )
  ORDER BY g.updated_at DESC, g.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_group_preview(
  group_code text DEFAULT NULL,
  group_id uuid DEFAULT NULL,
  viewer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  target_group groups%ROWTYPE;
  viewer_is_member boolean := false;
BEGIN
  IF group_code IS NULL AND group_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Не передан код или идентификатор группы'
    );
  END IF;

  IF group_code IS NOT NULL THEN
    SELECT *
    INTO target_group
    FROM groups
    WHERE invite_code = group_code
    LIMIT 1;
  ELSE
    SELECT *
    INTO target_group
    FROM groups
    WHERE id = group_id
    LIMIT 1;
  END IF;

  IF target_group.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Группа не найдена'
    );
  END IF;

  IF viewer_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM group_members
      WHERE group_members.group_id = target_group.id
        AND group_members.user_id = viewer_id
    )
    INTO viewer_is_member;
  END IF;

  IF COALESCE(target_group.is_public, false) = false
     AND group_code IS NULL
     AND viewer_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Группа недоступна'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'group', jsonb_build_object(
      'id', target_group.id,
      'name', target_group.name,
      'invite_code', target_group.invite_code,
      'created_by', target_group.created_by,
      'created_at', target_group.created_at,
      'updated_at', target_group.updated_at,
      'is_public', COALESCE(target_group.is_public, false),
      'members_count', (
        SELECT COUNT(*)
        FROM group_members gm_count
        WHERE gm_count.group_id = target_group.id
      ),
      'is_member', viewer_is_member
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION join_public_group(target_group_id uuid, joining_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_group groups%ROWTYPE;
  already_member boolean := false;
BEGIN
  SELECT *
  INTO target_group
  FROM groups
  WHERE id = target_group_id
  LIMIT 1;

  IF target_group.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Группа не найдена'
    );
  END IF;

  IF COALESCE(target_group.is_public, false) = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Это закрытая группа. Используйте ссылку или код приглашения'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE id = joining_user_id
      AND approval_status = 'approved'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ваша учетная запись должна быть одобрена администратором'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM group_members
    WHERE group_id = target_group_id
      AND user_id = joining_user_id
  )
  INTO already_member;

  IF already_member THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Вы уже состоите в этой группе',
      'group_id', target_group_id
    );
  END IF;

  INSERT INTO group_members (group_id, user_id, is_admin)
  VALUES (target_group_id, joining_user_id, false);

  UPDATE groups
  SET updated_at = now()
  WHERE id = target_group_id;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', target_group_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION list_visible_groups(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_group_preview(text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION join_public_group(uuid, uuid) TO authenticated;
