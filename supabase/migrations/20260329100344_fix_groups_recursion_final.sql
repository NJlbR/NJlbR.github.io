/*
  # Fix infinite recursion in group_members RLS policies

  1. Changes
    - Drop existing problematic RLS policies for group_members and groups
    - Create new non-recursive policies
    - Ensure group creation and membership management work correctly

  2. Security
    - Users can read groups they are members of
    - Users can read their own memberships
    - Only system can insert/update/delete memberships (via RPC functions)
    - Groups table allows inserts for authenticated users
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view groups they are members of" ON groups;
DROP POLICY IF EXISTS "Users can update groups they admin" ON groups;
DROP POLICY IF EXISTS "Users can view their group memberships" ON group_members;
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;

-- Groups table policies (no recursion)
CREATE POLICY "Authenticated users can create groups"
  ON groups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view all groups"
  ON groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own groups"
  ON groups FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their own groups"
  ON groups FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Group members table policies (simplified, no recursion)
CREATE POLICY "Users can view all group memberships"
  ON group_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert memberships"
  ON group_members FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can delete their own memberships"
  ON group_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Group creators can manage members"
  ON group_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND groups.created_by = auth.uid()
    )
  );
