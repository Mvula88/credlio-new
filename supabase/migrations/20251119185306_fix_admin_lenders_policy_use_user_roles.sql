-- FIX ADMIN LENDERS POLICY TO USE USER_ROLES TABLE
-- The jwt_role() function may not work reliably, so use user_roles table directly

-- Drop the existing policy that uses jwt_role()
DROP POLICY IF EXISTS "Admins can view all lenders globally" ON public.lenders;

-- Create new policy using user_roles table (like subscriptions policy)
CREATE POLICY "Admins can view all lenders globally" ON public.lenders
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Also fix profiles policy for admins
DROP POLICY IF EXISTS "Admins can view all profiles globally" ON public.profiles;

CREATE POLICY "Admins can view all profiles globally" ON public.profiles
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Fix loans policy for admins (for the lenders page)
DROP POLICY IF EXISTS "Admins can view all loans globally" ON public.loans;

CREATE POLICY "Admins can view all loans globally" ON public.loans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
