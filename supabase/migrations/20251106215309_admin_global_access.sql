-- Give admins GLOBAL access to see borrowers, lenders, and data from ALL countries

-- Update borrowers policy - admins see ALL countries
DROP POLICY IF EXISTS "Lenders can view all borrowers in their country" ON public.borrowers;

CREATE POLICY "Lenders view country borrowers, admins view all" ON public.borrowers
  FOR SELECT USING (
    -- Admins can view ALL borrowers in ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can view ALL borrowers in THEIR country only
    (jwt_role() = 'lender' AND country_code = jwt_country()) OR
    -- Borrowers can view their own record
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrowers.id AND user_id = auth.uid()
    )
  );

-- Update borrower_scores policy - admins see ALL countries
DROP POLICY IF EXISTS "Lenders can view all borrower scores in their country" ON public.borrower_scores;

CREATE POLICY "Lenders view country scores, admins view all" ON public.borrower_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_scores.borrower_id
        AND (
          -- Admins can view ALL scores in ALL countries
          jwt_role() = 'admin' OR
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

-- Update risk_flags policy - admins see ALL countries
DROP POLICY IF EXISTS "Lenders can view all risk flags in their country" ON public.risk_flags;

CREATE POLICY "Lenders view country flags, admins view all" ON public.risk_flags
  FOR SELECT USING (
    -- Admins can view ALL risk flags in ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can view risk flags in their country
    (jwt_role() = 'lender' AND country_code = jwt_country())
  );

-- Note: Lenders table doesn't have country_code, so admins already have full access via existing policies
