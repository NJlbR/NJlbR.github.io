/*
  # Fix ambiguous column reference in create_channel
*/

DROP FUNCTION IF EXISTS create_channel(text, text, text, boolean);
DROP FUNCTION IF EXISTS create_channel(text, text, text);

CREATE OR REPLACE FUNCTION create_channel(
  username_param text,
  name_param text,
  description_param text DEFAULT NULL,
  is_private_param boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_channel_id uuid;
  result json;
  invite_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
    AND up.approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only approved users can create channels';
  END IF;

  IF LENGTH(username_param) < 4 THEN
    RAISE EXCEPTION 'Channel username must be at least 4 characters';
  END IF;

  IF NOT username_param ~ '^[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Channel username can only contain letters, numbers, and underscores';
  END IF;

  IF NOT is_channel_username_available(username_param) THEN
    RAISE EXCEPTION 'Channel username is already taken';
  END IF;

  IF is_private_param THEN
    invite_code := generate_channel_access_code();
  END IF;

  INSERT INTO channels (username, name, description, created_by, is_private, access_code)
  VALUES (LOWER(username_param), name_param, description_param, auth.uid(), is_private_param, invite_code)
  RETURNING id INTO new_channel_id;

  INSERT INTO channel_subscribers (channel_id, user_id)
  VALUES (new_channel_id, auth.uid())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  SELECT json_build_object(
    'id', c.id,
    'username', c.username,
    'name', c.name,
    'description', c.description,
    'created_by', c.created_by,
    'created_at', c.created_at,
    'is_private', c.is_private,
    'access_code', c.access_code
  ) INTO result
  FROM channels c
  WHERE c.id = new_channel_id;

  RETURN result;
END;
$$;
