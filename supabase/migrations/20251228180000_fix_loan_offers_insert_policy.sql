-- Fix loan offers INSERT policy for lenders
-- Remove PRO_PLUS tier requirement to allow all lenders to submit offers
-- This aligns with the freemium model where all lenders can participate in the marketplace

-- Drop old restrictive policy
DROP POLICY IF EXISTS "Lenders can create offers" ON public.loan_offers;

-- Create updated policy without tier restriction
CREATE POLICY "Lenders can create offers" ON public.loan_offers
  FOR INSERT WITH CHECK (
    -- Lender must be inserting their own offer
    lender_id = auth.uid() AND
    -- Must have lender role
    (jwt_role() = 'lender' OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'lender'
    ))
  );

-- Also fix the SELECT policy to remove PRO_PLUS requirement
DROP POLICY IF EXISTS "Strict country isolation for loan offers" ON public.loan_offers;

CREATE POLICY "Strict country isolation for loan offers" ON public.loan_offers
  FOR SELECT USING (
    -- Admins can view ALL offers
    jwt_role() = 'admin' OR
    -- Lenders can view their own offers
    lender_id = auth.uid() OR
    -- Borrowers can view offers on their requests
    EXISTS (
      SELECT 1 FROM public.loan_requests lr
      WHERE lr.id = loan_offers.request_id
        AND lr.borrower_user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Lenders can create offers" ON public.loan_offers IS
  'All lenders can create offers on open loan requests. No tier requirement.';

COMMENT ON POLICY "Strict country isolation for loan offers" ON public.loan_offers IS
  'Lenders see their own offers. Borrowers see offers on their requests. No tier requirement.';
