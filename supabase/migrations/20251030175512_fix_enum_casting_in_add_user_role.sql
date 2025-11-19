-- Fix enum type casting error in add_user_role function
-- The function was trying to assign TEXT to app_role ENUM without casting

CREATE OR REPLACE FUNCTION public.add_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert into user_roles table
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Update profiles.app_role if it's null (for backward compatibility)
  -- Cast TEXT to app_role enum type to avoid type mismatch error
  UPDATE public.profiles
  SET app_role = p_role::app_role  -- Fixed: Added ::app_role cast
  WHERE user_id = p_user_id
  AND app_role IS NULL;
END;
$$;
