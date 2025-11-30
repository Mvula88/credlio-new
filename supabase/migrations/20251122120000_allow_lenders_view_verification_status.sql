-- Allow lenders to view borrower verification status
-- This enables lenders to see whether a borrower has completed self-verification
-- when viewing borrower profiles for credit assessment

-- Create policy to allow lenders to view verification status
CREATE POLICY "Lenders can view borrower verification status"
  ON public.borrower_self_verification_status
  FOR SELECT
  USING (
    -- Lenders can view all borrower verification statuses
    jwt_has_role('lender')
  );

COMMENT ON POLICY "Lenders can view borrower verification status" ON public.borrower_self_verification_status IS
  'Allows lenders to view borrower self-verification status for credit assessment';
