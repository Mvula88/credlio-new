-- Create a function to check for duplicate lender ID numbers
-- This function runs with SECURITY DEFINER to bypass RLS
-- so it can check ALL lenders, not just the current user's records

CREATE OR REPLACE FUNCTION public.check_lender_id_exists(
  p_id_number TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Check if any OTHER user has this ID number
  SELECT EXISTS(
    SELECT 1
    FROM lenders
    WHERE id_number = p_id_number
    AND user_id != p_user_id
    AND id_number IS NOT NULL
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- Create a function to check for duplicate phone numbers
CREATE OR REPLACE FUNCTION public.check_lender_phone_exists(
  p_phone_number TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Check if any OTHER user has this phone number
  SELECT EXISTS(
    SELECT 1
    FROM lenders
    WHERE contact_number = p_phone_number
    AND user_id != p_user_id
    AND contact_number IS NOT NULL
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.check_lender_id_exists(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_lender_phone_exists(TEXT, UUID) TO authenticated;
