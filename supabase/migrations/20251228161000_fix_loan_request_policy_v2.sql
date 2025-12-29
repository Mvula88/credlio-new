-- Fix loan request policy to check user_roles table instead of jwt_role()
-- This allows users with multiple roles (lender + borrower) to create loan requests

-- Drop the old policy
DROP POLICY IF EXISTS "Borrowers can create requests in their country" ON public.loan_requests;

-- Create new policy that checks user_roles table
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
  'All verified borrowers can create loan requests (checks user_roles table for multi-role users)';
