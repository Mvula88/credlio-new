-- Fix: Lenders should see ALL borrowers IN THEIR COUNTRY ONLY
-- NOT borrowers from other countries

-- Update borrowers policy to restrict by country
DROP POLICY IF EXISTS "Lenders can view all borrowers for risk checking" ON public.borrowers;

CREATE POLICY "Lenders can view all borrowers in their country" ON public.borrowers
  FOR SELECT USING (
    -- Admins can view all borrowers in their country
    (jwt_role() = 'admin' AND country_code = jwt_country()) OR
    -- Lenders can view ALL borrowers in THEIR country (but not other countries)
    (jwt_role() = 'lender' AND country_code = jwt_country()) OR
    -- Borrowers can view their own record
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrowers.id AND user_id = auth.uid()
    )
  );

-- Update borrower_scores policy to restrict by country
DROP POLICY IF EXISTS "Lenders can view all borrower scores for risk checking" ON public.borrower_scores;

CREATE POLICY "Lenders can view all borrower scores in their country" ON public.borrower_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_scores.borrower_id
        AND (
          -- Admins can view scores in their country
          (jwt_role() = 'admin' AND b.country_code = jwt_country()) OR
          -- Lenders can view all scores in their country
          (jwt_role() = 'lender' AND b.country_code = jwt_country()) OR
          -- Borrowers can view their own score
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = b.id AND user_id = auth.uid()
          )
        )
    )
  );

-- Update risk_flags policy to restrict by country
DROP POLICY IF EXISTS "Lenders can view all risk flags" ON public.risk_flags;

CREATE POLICY "Lenders can view all risk flags in their country" ON public.risk_flags
  FOR SELECT USING (
    -- Flags are country-scoped
    country_code = jwt_country() AND (
      jwt_role() IN ('lender', 'admin')
    )
  );
