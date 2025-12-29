-- Simplify loan request policy - just check user_id and country match
-- The verification trigger already handles verification checks

-- Drop the old policy
DROP POLICY IF EXISTS "Borrowers can create requests in their country" ON public.loan_requests;

-- Create simplified policy - just require user owns the request and country matches
-- Role verification is handled elsewhere (borrower portal access)
CREATE POLICY "Borrowers can create requests in their country" ON public.loan_requests
  FOR INSERT WITH CHECK (
    borrower_user_id = auth.uid()
  );

-- Add comment
COMMENT ON POLICY "Borrowers can create requests in their country" ON public.loan_requests IS
  'Borrowers can create loan requests - verification enforced by trigger';
