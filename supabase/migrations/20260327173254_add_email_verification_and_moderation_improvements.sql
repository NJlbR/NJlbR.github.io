/*
  # Email Verification and Moderation Improvements

  1. Changes to user_moderation
    - Add `is_active` boolean to track if moderation is still active
    - Add index for faster searches
    - Add constraint to prevent self-moderation

  2. Add banned_emails and banned_usernames tracking
    - Prevent re-registration with banned credentials

  3. Security Improvements
    - Add function to automatically clean up expired moderations
    - Add trigger to prevent self-moderation
    - Add unique constraint for active moderations per user

  ## Important Notes
  - Email verification will be handled by Supabase Auth settings
  - Banned users cannot re-register with same email/username
*/

-- Add is_active column to user_moderation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_moderation' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE user_moderation ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;

-- Create index for searching by email in auth.users (admin only can access this)
CREATE INDEX IF NOT EXISTS idx_user_moderation_created_at ON user_moderation(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_moderation_is_active ON user_moderation(is_active) WHERE is_active = true;

-- Function to automatically deactivate expired moderations
CREATE OR REPLACE FUNCTION deactivate_expired_moderations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_moderation
  SET is_active = false
  WHERE is_active = true
    AND moderation_type != 'ban'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;

-- Trigger to prevent admin from moderating themselves
CREATE OR REPLACE FUNCTION prevent_admin_self_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id = NEW.moderated_by THEN
    RAISE EXCEPTION 'Админ не может модерировать самого себя';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_self_moderation ON user_moderation;
CREATE TRIGGER check_self_moderation
  BEFORE INSERT ON user_moderation
  FOR EACH ROW
  EXECUTE FUNCTION prevent_admin_self_moderation();

-- Add constraint to ensure only one active moderation per user
-- (Deactivate old moderations when new one is added)
CREATE OR REPLACE FUNCTION deactivate_old_moderations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_moderation
  SET is_active = false
  WHERE user_id = NEW.user_id
    AND id != NEW.id
    AND is_active = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deactivate_previous_moderations ON user_moderation;
CREATE TRIGGER deactivate_previous_moderations
  AFTER INSERT ON user_moderation
  FOR EACH ROW
  EXECUTE FUNCTION deactivate_old_moderations();

-- Update comments policy to check is_active flag
DROP POLICY IF EXISTS "Authenticated users can create comments" ON comments;
CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM user_moderation
      WHERE user_moderation.user_id = auth.uid()
      AND user_moderation.is_active = true
      AND (
        moderation_type = 'ban'
        OR (expires_at IS NOT NULL AND expires_at > now())
      )
    )
  );

-- Function to check if username or email is banned
CREATE OR REPLACE FUNCTION is_banned(check_username text DEFAULT NULL, check_email text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if username is banned
  IF check_username IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_moderation um
      JOIN user_profiles up ON um.user_id = up.id
      WHERE LOWER(up.username) = LOWER(check_username)
      AND um.moderation_type = 'ban'
      AND um.is_active = true
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- Check if email is banned (through auth.users)
  IF check_email IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_moderation um
      JOIN auth.users au ON um.user_id = au.id
      WHERE LOWER(au.email) = LOWER(check_email)
      AND um.moderation_type = 'ban'
      AND um.is_active = true
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Add CHECK constraint to prevent banned users from creating profile
-- This will be checked in application code during registration

-- Update is_user_moderated function to use is_active
CREATE OR REPLACE FUNCTION is_user_moderated(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_moderation
    WHERE user_id = check_user_id
    AND is_active = true
    AND (
      moderation_type = 'ban'
      OR (expires_at IS NOT NULL AND expires_at > now())
    )
  );
END;
$$;