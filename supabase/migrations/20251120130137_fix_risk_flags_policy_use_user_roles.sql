-- FIX RISK FLAGS POLICY TO USE USER_ROLES TABLE
-- The jwt_role() function may not work reliably, so use user_roles table directly

-- Drop the existing policy that uses jwt_role()
DROP POLICY IF EXISTS "Strict country isolation for risk flags" ON public.risk_flags;
DROP POLICY IF EXISTS "Allow lenders and admins to view risk flags" ON public.risk_flags;
DROP POLICY IF EXISTS "Multi-role: Lenders view all risk flags" ON public.risk_flags;
DROP POLICY IF EXISTS "Lenders can view all risk flags" ON public.risk_flags;
DROP POLICY IF EXISTS "Lenders view country flags, admins view all" ON public.risk_flags;
DROP POLICY IF EXISTS "Risk flags viewable in country" ON public.risk_flags;

-- Create new policy using user_roles table
CREATE POLICY "Strict country isolation for risk flags" ON public.risk_flags
  FOR SELECT USING (
    -- Admins can view ALL risk flags from ALL countries
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) OR
    -- Lenders can ONLY view risk flags in THEIR country
    EXISTS (
      SELECT 1 FROM public.lenders
      WHERE user_id = auth.uid() AND country_code = risk_flags.country_code
    ) OR
    -- Borrowers can view flags on their own record
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = risk_flags.borrower_id AND user_id = auth.uid()
    )
  );
