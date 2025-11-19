-- Clean up duplicate and conflicting RLS policies
-- Remove old policies that restrict access by country for lenders

-- Drop old conflicting policies on borrowers table
DROP POLICY IF EXISTS "Lenders view country borrowers, admins view all" ON public.borrowers;
DROP POLICY IF EXISTS "Lenders/admins can view borrowers in their country" ON public.borrowers;
DROP POLICY IF EXISTS "Admins can view all borrowers" ON public.borrowers;

-- Drop old conflicting policies on borrower_scores table
DROP POLICY IF EXISTS "Lenders view country scores, admins view all" ON public.borrower_scores;
DROP POLICY IF EXISTS "Scores viewable by lenders/admins in country or linked borrower" ON public.borrower_scores;
DROP POLICY IF EXISTS "Admins can view all borrower scores" ON public.borrower_scores;

-- Drop old conflicting policies on risk_flags table
DROP POLICY IF EXISTS "Risk flags viewable in country" ON public.risk_flags;

-- Drop old conflicting policy on loans table
DROP POLICY IF EXISTS "Loans viewable by parties or admins in country" ON public.loans;

-- Recreate the correct multi-role policies

-- Borrowers table - allow lenders to view all
CREATE POLICY "Multi-role: Lenders view all borrowers" ON public.borrowers
  FOR SELECT USING (
    current_user_has_role('lender') OR
    current_user_has_role('admin') OR
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrowers.id AND user_id = auth.uid()
    )
  );

-- Borrower scores table - allow lenders to view all
CREATE POLICY "Multi-role: Lenders view all scores" ON public.borrower_scores
  FOR SELECT USING (
    current_user_has_role('lender') OR
    current_user_has_role('admin') OR
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrower_scores.borrower_id AND user_id = auth.uid()
    )
  );

-- Risk flags table - allow lenders to view all
CREATE POLICY "Multi-role: Lenders view all risk flags" ON public.risk_flags
  FOR SELECT USING (
    current_user_has_role('lender') OR
    current_user_has_role('admin') OR
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = risk_flags.borrower_id AND user_id = auth.uid()
    )
  );

-- Loans table - lenders can view all loans in their country
CREATE POLICY "Multi-role: View loans" ON public.loans
  FOR SELECT USING (
    lender_id = auth.uid() OR
    current_user_has_role('lender') OR
    current_user_has_role('admin') OR
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = loans.borrower_id AND user_id = auth.uid()
    )
  );

-- Repayment schedules - match loan access
DROP POLICY IF EXISTS "Schedules viewable by loan parties" ON public.repayment_schedules;

CREATE POLICY "Multi-role: View repayment schedules" ON public.repayment_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = repayment_schedules.loan_id
        AND (
          l.lender_id = auth.uid() OR
          current_user_has_role('lender') OR
          current_user_has_role('admin') OR
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = l.borrower_id AND user_id = auth.uid()
          )
        )
    )
  );

-- Repayment events - match loan access
DROP POLICY IF EXISTS "Events viewable by loan parties" ON public.repayment_events;

CREATE POLICY "Multi-role: View repayment events" ON public.repayment_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.repayment_schedules rs
      JOIN public.loans l ON l.id = rs.loan_id
      WHERE rs.id = repayment_events.schedule_id
        AND (
          l.lender_id = auth.uid() OR
          current_user_has_role('lender') OR
          current_user_has_role('admin') OR
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = l.borrower_id AND user_id = auth.uid()
          )
        )
    )
  );
