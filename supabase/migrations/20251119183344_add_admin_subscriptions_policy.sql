-- ADD ADMIN ACCESS TO SUBSCRIPTIONS TABLE
-- Allows admin to view all subscriptions for the lenders management page

-- Add policy for admins to view all subscriptions
CREATE POLICY "Admins can view all subscriptions" ON public.subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Also ensure admins can view loans for the lenders page
-- Check if policy exists first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'loans'
    AND policyname = 'Admins can view all loans globally'
  ) THEN
    CREATE POLICY "Admins can view all loans globally" ON public.loans
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;
