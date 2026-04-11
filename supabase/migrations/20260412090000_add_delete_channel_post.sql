/*
  # Delete channel post RPC
*/

CREATE OR REPLACE FUNCTION delete_channel_post(
  post_id uuid,
  deleter_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  post_owner uuid;
  post_channel_id uuid;
  can_delete boolean := false;
BEGIN
  SELECT author_id, channel_id
  INTO post_owner, post_channel_id
  FROM channel_posts
  WHERE id = post_id;

  IF post_channel_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Пост не найден');
  END IF;

  IF post_owner = deleter_user_id THEN
    can_delete := true;
  END IF;

  IF NOT can_delete THEN
    SELECT EXISTS (
      SELECT 1
      FROM channels c
      WHERE c.id = post_channel_id
        AND c.created_by = deleter_user_id
    )
    INTO can_delete;
  END IF;

  IF NOT can_delete THEN
    SELECT EXISTS (
      SELECT 1
      FROM channel_admins ca
      WHERE ca.channel_id = post_channel_id
        AND ca.user_id = deleter_user_id
        AND ca.can_post = true
    )
    INTO can_delete;
  END IF;

  IF NOT can_delete THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недостаточно прав');
  END IF;

  DELETE FROM channel_posts
  WHERE id = post_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_channel_post(uuid, uuid) TO authenticated;
