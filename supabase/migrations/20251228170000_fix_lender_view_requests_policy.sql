-- Fix loan request SELECT policy for lenders
-- Remove PRO_PLUS tier requirement to allow all lenders to view requests in their country
-- This aligns with the freemium model

-- Drop old restrictive policy
DROP POLICY IF EXISTS "Strict country isolation for loan requests" ON public.loan_requests;

-- Create updated policy without tier restriction for lenders
CREATE POLICY "Strict country isolation for loan requests" ON public.loan_requests
  FOR SELECT USING (
    -- Admins can view ALL requests from ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can view requests in THEIR country (no tier requirement)
    (jwt_role() = 'lender' AND country_code = jwt_country()) OR
    -- Multi-role users with lender role can also view (checks user_roles table)
    (country_code = jwt_country() AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'lender'
    )) OR
    -- Borrowers can view their own requests
    (borrower_user_id = auth.uid())
  );

COMMENT ON POLICY "Strict country isolation for loan requests" ON public.loan_requests IS
  'Lenders can view open requests in their country. Borrowers can view their own requests. No tier requirement.';
