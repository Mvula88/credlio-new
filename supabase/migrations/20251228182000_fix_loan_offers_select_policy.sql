-- Fix loan offers SELECT policy - ensure lenders can see their own offers
-- This ensures the policy works without requiring complex checks

-- Drop all existing SELECT policies on loan_offers to start clean
DROP POLICY IF EXISTS "Offers viewable by request owner or offer maker" ON public.loan_offers;
DROP POLICY IF EXISTS "Strict country isolation for loan offers" ON public.loan_offers;

-- Create a simple, working SELECT policy
CREATE POLICY "Users can view relevant offers" ON public.loan_offers
  FOR SELECT USING (
    -- Admins can view ALL offers
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) OR
    -- Lenders can view their own offers
    lender_id = auth.uid() OR
    -- Borrowers can view offers on their requests
    EXISTS (
      SELECT 1 FROM public.loan_requests lr
      WHERE lr.id = request_id
        AND lr.borrower_user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Users can view relevant offers" ON public.loan_offers IS
  'Lenders see their own offers. Borrowers see offers on their requests. Admins see all.';
