-- Allow admins to view borrower verification status
-- This fixes the issue where admins cannot see borrower_self_verification_status in the admin borrowers page

-- Drop existing policy and recreate with admin support
DROP POLICY IF EXISTS "Lenders can view borrower verification status" ON public.borrower_self_verification_status;

-- Create policy that allows both lenders and admins to view verification status
CREATE POLICY "Lenders and admins can view borrower verification status"
  ON public.borrower_self_verification_status
  FOR SELECT
  USING (
    -- Admins can view all verification statuses
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) OR
    -- Lenders can view all borrower verification statuses
    EXISTS (
      SELECT 1 FROM public.lenders
      WHERE user_id = auth.uid()
    ) OR
    -- Borrowers can view their own verification status
    EXISTS (
      SELECT 1 FROM public.borrower_user_links bul
      WHERE bul.user_id = auth.uid() AND bul.borrower_id = borrower_self_verification_status.borrower_id
    )
  );

COMMENT ON POLICY "Lenders and admins can view borrower verification status" ON public.borrower_self_verification_status IS
  'Allows lenders and admins to view borrower self-verification status for credit assessment';
