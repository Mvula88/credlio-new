-- Fix RLS policies to support multi-role users
-- Users can have multiple roles (lender, borrower, admin) so we need to check user_roles table
-- not just jwt_role() which only returns one role

-- Create helper function to check if current user has a specific role
CREATE OR REPLACE FUNCTION public.current_user_has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Check if user has the role in user_roles table
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = p_role
  );
END;
$$;

COMMENT ON FUNCTION public.current_user_has_role IS 'Check if the current authenticated user has a specific role (supports multi-role)';

-- Update borrowers RLS policy to allow lenders to view all borrowers
DROP POLICY IF EXISTS "Lenders can view all borrowers for risk checking" ON public.borrowers;

CREATE POLICY "Lenders can view all borrowers for risk checking" ON public.borrowers
  FOR SELECT USING (
    -- Admins can view all borrowers in their country
    (jwt_role() = 'admin' AND country_code = jwt_country()) OR
    -- Users with lender role can view all borrowers (multi-role support)
    current_user_has_role('lender') OR
    -- Borrowers can view their own record
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrowers.id AND user_id = auth.uid()
    )
  );

-- Update borrower_scores RLS policy
DROP POLICY IF EXISTS "Lenders can view all borrower scores for risk checking" ON public.borrower_scores;

CREATE POLICY "Lenders can view all borrower scores for risk checking" ON public.borrower_scores
  FOR SELECT USING (
    -- Admins can view scores in their country
    (jwt_role() = 'admin' AND EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_scores.borrower_id AND b.country_code = jwt_country()
    )) OR
    -- Users with lender role can view all borrower scores (multi-role support)
    current_user_has_role('lender') OR
    -- Borrowers can view their own score
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrower_scores.borrower_id AND user_id = auth.uid()
    )
  );

-- Update risk_flags RLS policy
DROP POLICY IF EXISTS "Lenders can view all risk flags" ON public.risk_flags;

CREATE POLICY "Lenders can view all risk flags" ON public.risk_flags
  FOR SELECT USING (
    -- Admins can view flags in their country
    (jwt_role() = 'admin' AND country_code = jwt_country()) OR
    -- Users with lender role can view all risk flags (multi-role support)
    current_user_has_role('lender') OR
    -- Borrowers can view their own flags
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = risk_flags.borrower_id AND user_id = auth.uid()
    )
  );

-- Update loans RLS policy to support multi-role
DROP POLICY IF EXISTS "Loans viewable by parties or admins in country" ON public.loans;

CREATE POLICY "Loans viewable by parties or admins in country" ON public.loans
  FOR SELECT USING (
    country_code = jwt_country() AND
    (
      lender_id = auth.uid() OR
      jwt_role() = 'admin' OR
      current_user_has_role('lender') OR
      EXISTS (
        SELECT 1 FROM public.borrower_user_links
        WHERE borrower_id = loans.borrower_id AND user_id = auth.uid()
      )
    )
  );

-- Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION public.current_user_has_role(TEXT) TO authenticated;
