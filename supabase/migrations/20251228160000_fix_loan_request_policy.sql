-- Fix loan request policy to allow all verified borrowers to create requests
-- Previously required PRO_PLUS tier which was too restrictive for freemium model
-- Also fixed to check user_roles table instead of jwt_role() since users can have multiple roles

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Borrowers can create requests in their country" ON public.loan_requests;

-- Create new policy that allows all verified borrowers to create requests
-- Check user_roles table instead of jwt_role() since users can have multiple roles (lender + borrower)
-- Verification is enforced by the trigger, so we just need basic checks here
CREATE POLICY "Borrowers can create requests in their country" ON public.loan_requests
  FOR INSERT WITH CHECK (
    country_code = jwt_country() AND
    borrower_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'borrower'
    )
  );

-- Add comment
COMMENT ON POLICY "Borrowers can create requests in their country" ON public.loan_requests IS
  'All verified borrowers can create loan requests (checks user_roles table, verification enforced by trigger)';
