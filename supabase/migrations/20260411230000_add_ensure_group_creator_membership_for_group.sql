/*
  # Ensure creator membership for a specific group
*/

CREATE OR REPLACE FUNCTION ensure_group_creator_membership_for_group(
  target_group_id uuid,
  creator_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_group groups%ROWTYPE;
BEGIN
  SELECT * INTO target_group
  FROM groups
  WHERE id = target_group_id
  LIMIT 1;

  IF target_group.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group not found');
  END IF;

  IF target_group.created_by IS NULL OR target_group.created_by <> creator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not group creator');
  END IF;

  INSERT INTO group_members (group_id, user_id, is_admin, is_moderator)
  VALUES (target_group_id, creator_id, true, false)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_group_creator_membership_for_group(uuid, uuid) TO authenticated;
