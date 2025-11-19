-- Fix RLS policies to check both user_roles AND lenders table
-- This ensures lenders can access borrower data even if they don't have 'lender' role in user_roles
--
-- Root Cause: Users in 'lenders' table don't automatically have 'lender' role in 'user_roles' table
-- Solution: Update RLS policies to check BOTH tables

-- Update jwt_has_role function to also check lenders table for 'lender' role
CREATE OR REPLACE FUNCTION public.jwt_has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- If checking for 'lender' role, also check lenders table
  IF p_role = 'lender' THEN
    RETURN (
      -- Check user_roles table
      EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role = 'lender'
      )
      OR
      -- Also check lenders table
      EXISTS (
        SELECT 1
        FROM public.lenders
        WHERE user_id = auth.uid()
      )
    );
  END IF;

  -- For other roles, just check user_roles table
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = p_role
  );
END;
$$;

COMMENT ON FUNCTION public.jwt_has_role IS 'Check if current user has specific role (checks both user_roles and lenders table for lender role)';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.jwt_has_role(TEXT) TO authenticated;

-- No need to recreate policies since they already use jwt_has_role() function
-- The existing policies will automatically use the updated function logic
