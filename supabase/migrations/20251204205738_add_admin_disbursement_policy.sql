-- Add admin policy to view all disbursement proofs
-- Admins need to see all disbursements to monitor disputes and issues

CREATE POLICY "Admins can view all disbursement proofs"
  ON public.disbursement_proofs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Added admin policy for disbursement_proofs table';
END $$;
