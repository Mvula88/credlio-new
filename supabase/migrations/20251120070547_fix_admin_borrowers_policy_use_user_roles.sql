-- FIX ADMIN BORROWERS POLICY TO USE USER_ROLES TABLE
-- The jwt_role() function may not work reliably, so use user_roles table directly

-- Drop the existing policy that uses jwt_role()
DROP POLICY IF EXISTS "Strict country isolation for borrowers" ON public.borrowers;

-- Create new policy using user_roles table
CREATE POLICY "Strict country isolation for borrowers" ON public.borrowers
  FOR SELECT USING (
    -- Admins can view ALL borrowers from ALL countries
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) OR
    -- Lenders can ONLY view borrowers in THEIR country
    EXISTS (
      SELECT 1 FROM public.lenders
      WHERE user_id = auth.uid() AND country_code = borrowers.country_code
    ) OR
    -- Borrowers can view their own record
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrowers.id AND user_id = auth.uid()
    )
  );

-- Fix borrower_scores policy for admins
DROP POLICY IF EXISTS "Strict country isolation for borrower scores" ON public.borrower_scores;

CREATE POLICY "Strict country isolation for borrower scores" ON public.borrower_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_scores.borrower_id
      AND (
        -- Admins can view all
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role = 'admin'
        ) OR
        -- Lenders can view scores in their country
        EXISTS (
          SELECT 1 FROM public.lenders
          WHERE user_id = auth.uid() AND country_code = b.country_code
        ) OR
        -- Borrowers can view their own
        EXISTS (
          SELECT 1 FROM public.borrower_user_links
          WHERE borrower_id = b.id AND user_id = auth.uid()
        )
      )
    )
  );

-- Fix loans policy for admins
DROP POLICY IF EXISTS "Strict country isolation for loans" ON public.loans;

CREATE POLICY "Strict country isolation for loans" ON public.loans
  FOR SELECT USING (
    -- Admins can view ALL loans from ALL countries
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) OR
    -- Lenders can ONLY view their own loans
    lender_id = auth.uid() OR
    -- Borrowers can view their own loans
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = loans.borrower_id AND user_id = auth.uid()
    )
  );

-- Fix repayment_schedules policy for admins
DROP POLICY IF EXISTS "Strict country isolation for repayment schedules" ON public.repayment_schedules;

CREATE POLICY "Strict country isolation for repayment schedules" ON public.repayment_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      JOIN public.borrowers b ON l.borrower_id = b.id
      WHERE l.id = repayment_schedules.loan_id
      AND (
        -- Admins can view all
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role = 'admin'
        ) OR
        -- Lenders can view schedules for their own loans
        l.lender_id = auth.uid() OR
        -- Borrowers can view their own
        EXISTS (
          SELECT 1 FROM public.borrower_user_links
          WHERE borrower_id = b.id AND user_id = auth.uid()
        )
      )
    )
  );

-- Fix repayment_events policy for admins
DROP POLICY IF EXISTS "Strict country isolation for repayment events" ON public.repayment_events;

CREATE POLICY "Strict country isolation for repayment events" ON public.repayment_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.repayment_schedules rs
      JOIN public.loans l ON l.id = rs.loan_id
      JOIN public.borrowers b ON l.borrower_id = b.id
      WHERE rs.id = repayment_events.schedule_id
      AND (
        -- Admins can view all
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role = 'admin'
        ) OR
        -- Lenders can view events for their own loans
        l.lender_id = auth.uid() OR
        -- Borrowers can view their own
        EXISTS (
          SELECT 1 FROM public.borrower_user_links
          WHERE borrower_id = b.id AND user_id = auth.uid()
        )
      )
    )
  );
