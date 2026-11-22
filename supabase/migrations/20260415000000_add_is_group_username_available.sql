-- Add is_group_username_available RPC function for robust group username availability checking
CREATE OR REPLACE FUNCTION is_group_username_available(username_to_check text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.groups WHERE lower(username) = lower(username_to_check)
  );
END;
$$;
