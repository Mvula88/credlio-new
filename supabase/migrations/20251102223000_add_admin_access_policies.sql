-- Add admin access policies for cross-country data access
-- This allows users with app_role = 'admin' to view all data across countries

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all lenders
CREATE POLICY "Admins can view all lenders" ON public.lenders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all borrowers (cross-country)
CREATE POLICY "Admins can view all borrowers" ON public.borrowers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all borrower scores
CREATE POLICY "Admins can view all borrower scores" ON public.borrower_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all risk flags
CREATE POLICY "Admins can view all risk flags" ON public.risk_flags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all loans
CREATE POLICY "Admins can view all loans" ON public.loans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all repayment schedules
CREATE POLICY "Admins can view all repayment schedules" ON public.repayment_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all repayment events
CREATE POLICY "Admins can view all repayment events" ON public.repayment_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all lender scores
CREATE POLICY "Admins can view all lender scores" ON public.lender_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all disputes
CREATE POLICY "Admins can view all disputes" ON public.disputes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all fraud signals
CREATE POLICY "Admins can view all fraud signals" ON public.fraud_signals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );

-- Admins can view all search logs
CREATE POLICY "Admins can view all search logs" ON public.search_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.app_role = 'admin'
    )
  );
