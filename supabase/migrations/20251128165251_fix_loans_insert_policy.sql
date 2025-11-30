-- Fix loans insert policy to use profile country instead of JWT country
-- The JWT country_code may not be synced properly, so we check against the lender's profile

-- Drop existing insert policies for loans
DROP POLICY IF EXISTS "Lenders can create loans in their country" ON public.loans;

-- Create new policy that checks lender's profile country
CREATE POLICY "Lenders can create loans" ON public.loans
  FOR INSERT WITH CHECK (
    lender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.country_code = loans.country_code
    )
  );

-- Also ensure lenders can update their own loans
DROP POLICY IF EXISTS "Lenders can update own loans" ON public.loans;
CREATE POLICY "Lenders can update own loans" ON public.loans
  FOR UPDATE USING (
    lender_id = auth.uid()
  );
