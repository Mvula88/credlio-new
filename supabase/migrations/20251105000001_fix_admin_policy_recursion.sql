-- Fix infinite recursion in admin policies
-- The issue: admin policies were checking profiles table, which itself has admin policies, causing recursion

-- Step 1: Create a security definer function to check admin status without triggering RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This function bypasses RLS to check if current user is admin
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND app_role = 'admin'
  );
END;
$$;

-- Step 2: Drop the problematic admin policies that use EXISTS subqueries
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all lenders" ON public.lenders;
DROP POLICY IF EXISTS "Admins can view all borrowers" ON public.borrowers;
DROP POLICY IF EXISTS "Admins can view all borrower scores" ON public.borrower_scores;
DROP POLICY IF EXISTS "Admins can view all risk flags" ON public.risk_flags;
DROP POLICY IF EXISTS "Admins can view all loans" ON public.loans;
DROP POLICY IF EXISTS "Admins can view all repayment schedules" ON public.repayment_schedules;
DROP POLICY IF EXISTS "Admins can view all repayment events" ON public.repayment_events;
DROP POLICY IF EXISTS "Admins can view all lender scores" ON public.lender_scores;
DROP POLICY IF EXISTS "Admins can view all disputes" ON public.disputes;
DROP POLICY IF EXISTS "Admins can view all fraud signals" ON public.fraud_signals;
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view all search logs" ON public.search_logs;

-- Step 3: Recreate admin policies using the is_admin() function instead of EXISTS subqueries

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    auth.uid() = user_id OR is_admin()
  );

-- Admins can view all lenders
CREATE POLICY "Admins can view all lenders" ON public.lenders
  FOR SELECT USING (is_admin());

-- Admins can view all borrowers
CREATE POLICY "Admins can view all borrowers" ON public.borrowers
  FOR SELECT USING (is_admin());

-- Admins can view all borrower scores
CREATE POLICY "Admins can view all borrower scores" ON public.borrower_scores
  FOR SELECT USING (is_admin());

-- Admins can view all risk flags
CREATE POLICY "Admins can view all risk flags" ON public.risk_flags
  FOR SELECT USING (is_admin());

-- Admins can view all loans
CREATE POLICY "Admins can view all loans" ON public.loans
  FOR SELECT USING (is_admin());

-- Admins can view all repayment schedules
CREATE POLICY "Admins can view all repayment schedules" ON public.repayment_schedules
  FOR SELECT USING (is_admin());

-- Admins can view all repayment events
CREATE POLICY "Admins can view all repayment events" ON public.repayment_events
  FOR SELECT USING (is_admin());

-- Admins can view all lender scores
CREATE POLICY "Admins can view all lender scores" ON public.lender_scores
  FOR SELECT USING (is_admin());

-- Admins can view all disputes
CREATE POLICY "Admins can view all disputes" ON public.disputes
  FOR SELECT USING (is_admin());

-- Admins can view all fraud signals
CREATE POLICY "Admins can view all fraud signals" ON public.fraud_signals
  FOR SELECT USING (is_admin());

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
  FOR SELECT USING (is_admin());

-- Admins can view all search logs
CREATE POLICY "Admins can view all search logs" ON public.search_logs
  FOR SELECT USING (is_admin());
