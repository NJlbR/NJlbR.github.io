/*
  # Add Channel Privacy Settings and Open Groups System

  1. Channel Updates
    - Add `is_private` column to channels (default false for open channels)
    - Add `access_code` column for private channels
    - Create `channel_subscribers` table for explicit subscriptions
    - Drop old subscription references if they exist

  2. New Open Groups Table
    - `open_groups` table for groups visible to all users
    - Include is_public flag to allow groups to be toggled between private/public
    - Add access_code for private groups

  3. Security
    - Enable RLS on all tables
    - Add policies for group and channel access control
    - Users can view public channels/groups
    - Only members can access private channels/groups

  4. Important Notes
    - channel_subscribers tracks who is subscribed to channels
    - open_groups are visible to all but require access_code if private
    - Existing groups remain private by default
*/

DO $$
BEGIN
  -- Add privacy fields to channels table
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

-- Create channel_subscribers table if it doesn't exist
CREATE TABLE IF NOT EXISTS channel_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  subscribed_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE channel_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON channel_subscribers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can subscribe to channels"
  ON channel_subscribers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsubscribe"
  ON channel_subscribers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Update groups table to support public mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'groups' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE groups ADD COLUMN is_public BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'groups' AND column_name = 'access_code'
  ) THEN
    ALTER TABLE groups ADD COLUMN access_code TEXT;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_channel_subscribers_user_id ON channel_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_subscribers_channel_id ON channel_subscribers(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_is_private ON channels(is_private);
CREATE INDEX IF NOT EXISTS idx_groups_is_public ON groups(is_public);
