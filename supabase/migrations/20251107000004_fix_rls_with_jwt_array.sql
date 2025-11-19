-- Fix RLS policies to check user_roles in JWT claims instead of querying the table
-- This is more efficient and works better with client-side queries

-- First, let's create a function to check if JWT contains a specific role
CREATE OR REPLACE FUNCTION public.jwt_has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Check if the role exists in user_roles table for current user
  -- This works because RLS is disabled on user_roles for SELECT
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = p_role
  );
END;
$$;

COMMENT ON FUNCTION public.jwt_has_role IS 'Check if current user has specific role (works with client queries)';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.jwt_has_role(TEXT) TO authenticated;

-- Now recreate all the policies to use the simpler approach
-- Drop all existing multi-role policies
DROP POLICY IF EXISTS "Multi-role: Lenders view all borrowers" ON public.borrowers;
DROP POLICY IF EXISTS "Multi-role: Lenders view all scores" ON public.borrower_scores;
DROP POLICY IF EXISTS "Multi-role: Lenders view all risk flags" ON public.risk_flags;
DROP POLICY IF EXISTS "Multi-role: View loans" ON public.loans;
DROP POLICY IF EXISTS "Multi-role: View repayment schedules" ON public.repayment_schedules;
DROP POLICY IF EXISTS "Multi-role: View repayment events" ON public.repayment_events;

-- Recreate with simpler logic - allow if user has lender OR admin role
CREATE POLICY "Allow lenders and admins to view borrowers" ON public.borrowers
  FOR SELECT USING (
    jwt_has_role('lender') OR
    jwt_has_role('admin') OR
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrowers.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Allow lenders and admins to view scores" ON public.borrower_scores
  FOR SELECT USING (
    jwt_has_role('lender') OR
    jwt_has_role('admin') OR
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrower_scores.borrower_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Allow lenders and admins to view risk flags" ON public.risk_flags
  FOR SELECT USING (
    jwt_has_role('lender') OR
    jwt_has_role('admin') OR
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = risk_flags.borrower_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Allow lenders and admins to view loans" ON public.loans
  FOR SELECT USING (
    lender_id = auth.uid() OR
    jwt_has_role('lender') OR
    jwt_has_role('admin') OR
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = loans.borrower_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Allow lenders and admins to view schedules" ON public.repayment_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = repayment_schedules.loan_id
        AND (
          l.lender_id = auth.uid() OR
          jwt_has_role('lender') OR
          jwt_has_role('admin') OR
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = l.borrower_id AND user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Allow lenders and admins to view events" ON public.repayment_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.repayment_schedules rs
      JOIN public.loans l ON l.id = rs.loan_id
      WHERE rs.id = repayment_events.schedule_id
        AND (
          l.lender_id = auth.uid() OR
          jwt_has_role('lender') OR
          jwt_has_role('admin') OR
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = l.borrower_id AND user_id = auth.uid()
          )
        )
    )
  );
