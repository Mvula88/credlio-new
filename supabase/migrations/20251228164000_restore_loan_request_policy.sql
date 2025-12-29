-- Restore proper loan request policy with security checks
-- The previous simplification removed important country and role checks

-- Drop the oversimplified policy
DROP POLICY IF EXISTS "Borrowers can create requests in their country" ON public.loan_requests;

-- Restore proper policy with all security checks
-- Uses user_roles table for multi-role support (users can be both lender and borrower)
CREATE POLICY "Borrowers can create requests in their country" ON public.loan_requests
  FOR INSERT WITH CHECK (
    country_code = jwt_country() AND
    borrower_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'borrower'
    )
  );

COMMENT ON POLICY "Borrowers can create requests in their country" ON public.loan_requests IS
  'Borrowers can create loan requests in their country only. Checks user_roles table for multi-role support.';
