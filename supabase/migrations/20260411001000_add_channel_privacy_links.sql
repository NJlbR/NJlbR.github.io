/*
  # Channel Privacy Links And Public Lists

  1. Columns
    - Ensure `is_private` and `access_code` exist on `channels`

  2. Functions
    - `generate_channel_access_code()` generates unique invite codes for private channels
    - `list_visible_channels(viewer_id)` returns open channels + private channels for subscribers
    - `get_channel_preview(access_code, channel_id, viewer_id)` returns channel info for open or valid code
    - `join_public_channel(target_channel_id, joining_user_id)` subscribes to open channel
    - `join_channel_by_code(code, joining_user_id)` subscribes to private channel by code

  3. Policies
    - Restrict channel SELECT to public or subscribed/owner
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channels' AND column_name = 'is_private'
  ) THEN
    ALTER TABLE channels ADD COLUMN is_private BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channels' AND column_name = 'access_code'
  ) THEN
    ALTER TABLE channels ADD COLUMN access_code TEXT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_channel_access_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  result text := '';
  i integer;
  code_exists boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..10 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    SELECT EXISTS(SELECT 1 FROM channels WHERE access_code = result) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION is_channel_subscriber(check_channel_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM channel_subscribers
    WHERE channel_id = check_channel_id
      AND user_id = check_user_id
  );
$$;

DROP POLICY IF EXISTS "Anyone can view channels" ON channels;

CREATE POLICY "Users can view public or subscribed channels"
  ON channels FOR SELECT
  USING (
    COALESCE(is_private, false) = false
    OR created_by = auth.uid()
    OR is_channel_subscriber(id, auth.uid())
  );

CREATE OR REPLACE FUNCTION list_visible_channels(viewer_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  username text,
  name text,
  description text,
  avatar_url text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_private boolean,
  access_code text,
  subscriber_count bigint,
  is_subscribed boolean,
  is_owner boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    c.id,
    c.username,
    c.name,
    c.description,
    c.avatar_url,
    c.created_by,
    c.created_at,
    c.updated_at,
    COALESCE(c.is_private, false) AS is_private,
    c.access_code,
    (
      SELECT COUNT(*)
      FROM channel_subscribers cs_count
      WHERE cs_count.channel_id = c.id
    ) AS subscriber_count,
    CASE
      WHEN viewer_id IS NULL THEN false
      ELSE EXISTS (
        SELECT 1
        FROM channel_subscribers cs_member
        WHERE cs_member.channel_id = c.id
          AND cs_member.user_id = viewer_id
      )
    END AS is_subscribed,
    CASE
      WHEN viewer_id IS NULL THEN false
      ELSE c.created_by = viewer_id
    END AS is_owner
  FROM channels c
  WHERE COALESCE(c.is_private, false) = false
     OR (
       viewer_id IS NOT NULL
       AND (
         c.created_by = viewer_id
         OR EXISTS (
           SELECT 1
           FROM channel_subscribers cs_visible
           WHERE cs_visible.channel_id = c.id
             AND cs_visible.user_id = viewer_id
         )
       )
     )
  ORDER BY c.updated_at DESC, c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_channel_preview(
  access_code_param text DEFAULT NULL,
  channel_id_param uuid DEFAULT NULL,
  viewer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  target_channel channels%ROWTYPE;
  viewer_is_subscribed boolean := false;
BEGIN
  IF access_code_param IS NULL AND channel_id_param IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Не передан код или идентификатор канала'
    );
  END IF;

  IF access_code_param IS NOT NULL THEN
    SELECT *
    INTO target_channel
    FROM channels
    WHERE access_code = access_code_param
    LIMIT 1;
  ELSE
    SELECT *
    INTO target_channel
    FROM channels
    WHERE id = channel_id_param
    LIMIT 1;
  END IF;

  IF target_channel.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Канал не найден'
    );
  END IF;

  IF viewer_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM channel_subscribers
      WHERE channel_id = target_channel.id
        AND user_id = viewer_id
    )
    INTO viewer_is_subscribed;
  END IF;

  IF COALESCE(target_channel.is_private, false) = true
     AND access_code_param IS NULL
     AND viewer_is_subscribed = false
     AND (viewer_id IS NULL OR target_channel.created_by != viewer_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Канал недоступен'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'channel', jsonb_build_object(
      'id', target_channel.id,
      'username', target_channel.username,
      'name', target_channel.name,
      'description', target_channel.description,
      'avatar_url', target_channel.avatar_url,
      'created_by', target_channel.created_by,
      'created_at', target_channel.created_at,
      'updated_at', target_channel.updated_at,
      'is_private', COALESCE(target_channel.is_private, false),
      'access_code', target_channel.access_code,
      'subscriber_count', (
        SELECT COUNT(*)
        FROM channel_subscribers cs_count
        WHERE cs_count.channel_id = target_channel.id
      ),
      'is_subscribed', viewer_is_subscribed
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION join_public_channel(target_channel_id uuid, joining_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_channel channels%ROWTYPE;
  already_subscribed boolean := false;
BEGIN
  SELECT *
  INTO target_channel
  FROM channels
  WHERE id = target_channel_id
  LIMIT 1;

  IF target_channel.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Канал не найден'
    );
  END IF;

  IF COALESCE(target_channel.is_private, false) = true THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Этот канал закрыт. Нужен код приглашения'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
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
    FROM channel_subscribers
    WHERE channel_id = target_channel_id
      AND user_id = joining_user_id
  )
  INTO already_subscribed;

  IF already_subscribed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Вы уже подписаны на этот канал',
      'channel_id', target_channel_id
    );
  END IF;

  INSERT INTO channel_subscribers (channel_id, user_id)
  VALUES (target_channel_id, joining_user_id)
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  UPDATE channels
  SET updated_at = now()
  WHERE id = target_channel_id;

  RETURN jsonb_build_object(
    'success', true,
    'channel_id', target_channel_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION join_channel_by_code(code text, joining_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_channel_id uuid;
  already_subscribed boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = joining_user_id
      AND approval_status = 'approved'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ваша учетная запись должна быть одобрена администратором'
    );
  END IF;

  SELECT id INTO target_channel_id
  FROM channels
  WHERE access_code = code;

  IF target_channel_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Канал с таким кодом не найден'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM channel_subscribers
    WHERE channel_id = target_channel_id
      AND user_id = joining_user_id
  )
  INTO already_subscribed;

  IF already_subscribed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Вы уже подписаны на этот канал'
    );
  END IF;

  INSERT INTO channel_subscribers (channel_id, user_id)
  VALUES (target_channel_id, joining_user_id)
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  UPDATE channels
  SET updated_at = now()
  WHERE id = target_channel_id;

  RETURN jsonb_build_object(
    'success', true,
    'channel_id', target_channel_id
  );
END;
$$;

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
  channel_id uuid;
  result json;
  invite_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND approval_status = 'approved'
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
  RETURNING id INTO channel_id;

  INSERT INTO channel_subscribers (channel_id, user_id)
  VALUES (channel_id, auth.uid())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  SELECT json_build_object(
    'id', channels.id,
    'username', channels.username,
    'name', channels.name,
    'description', channels.description,
    'created_by', channels.created_by,
    'created_at', channels.created_at,
    'is_private', channels.is_private,
    'access_code', channels.access_code
  ) INTO result
  FROM channels
  WHERE id = channel_id;

  RETURN result;
END;
$$;

DROP FUNCTION IF EXISTS toggle_channel_subscription(uuid);

CREATE OR REPLACE FUNCTION toggle_channel_subscription(channel_id_param uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  is_currently_subscribed boolean;
  new_subscriber_count integer;
  channel_is_private boolean;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = current_user_id
    AND approval_status = 'approved'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only approved users can subscribe to channels');
  END IF;

  SELECT COALESCE(is_private, false) INTO channel_is_private
  FROM channels
  WHERE id = channel_id_param;

  IF channel_is_private IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Channel not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM channel_subscribers
    WHERE channel_id = channel_id_param
    AND user_id = current_user_id
  ) INTO is_currently_subscribed;

  IF channel_is_private = true AND is_currently_subscribed = false THEN
    RETURN json_build_object('success', false, 'error', 'Private channel requires invite code');
  END IF;

  IF is_currently_subscribed THEN
    IF EXISTS (
      SELECT 1 FROM channels
      WHERE id = channel_id_param
      AND created_by = current_user_id
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Channel creator cannot unsubscribe'
      );
    END IF;

    DELETE FROM channel_subscribers
    WHERE channel_id = channel_id_param
    AND user_id = current_user_id;
  ELSE
    INSERT INTO channel_subscribers (channel_id, user_id)
    VALUES (channel_id_param, current_user_id)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  SELECT COUNT(*) INTO new_subscriber_count
  FROM channel_subscribers
  WHERE channel_id = channel_id_param;

  RETURN json_build_object(
    'success', true,
    'subscribed', NOT is_currently_subscribed,
    'subscriber_count', new_subscriber_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_channel_access_code() TO authenticated;
GRANT EXECUTE ON FUNCTION is_channel_subscriber(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION list_visible_channels(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_channel_preview(text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION join_public_channel(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION join_channel_by_code(text, uuid) TO authenticated;
