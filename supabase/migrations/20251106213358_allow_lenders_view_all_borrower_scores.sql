-- Allow lenders to view all borrower scores for risk checking
-- This enables lenders to see credit scores from all borrowers

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Scores viewable by lenders/admins in country or linked borrower" ON public.borrower_scores;

-- Create new policy that allows lenders to view all borrower scores
CREATE POLICY "Lenders can view all borrower scores for risk checking" ON public.borrower_scores
  FOR SELECT USING (
    -- Admins can view scores in their country
    (jwt_role() = 'admin' AND EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_scores.borrower_id AND b.country_code = jwt_country()
    )) OR
    -- Lenders can view all borrower scores
    jwt_role() = 'lender' OR
    -- Borrowers can view their own score
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrower_scores.borrower_id AND user_id = auth.uid()
    )
  );

-- Also update risk_flags policy to allow lenders to view all flags
DROP POLICY IF EXISTS "Risk flags viewable in country" ON public.risk_flags;

CREATE POLICY "Lenders can view all risk flags" ON public.risk_flags
  FOR SELECT USING (
    -- Admins can view flags in their country
    (jwt_role() = 'admin' AND country_code = jwt_country()) OR
    -- Lenders can view all risk flags
    jwt_role() = 'lender'
  );
