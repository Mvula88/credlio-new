-- Allow lenders to view all borrowers for risk checking
-- This enables lenders to see warnings from other lenders before extending credit

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Lenders/admins can view borrowers in their country" ON public.borrowers;

-- Create new policy that allows lenders to view all borrowers
CREATE POLICY "Lenders can view all borrowers for risk checking" ON public.borrowers
  FOR SELECT USING (
    -- Admins can view all borrowers in their country
    (jwt_role() = 'admin' AND country_code = jwt_country()) OR
    -- Lenders can view all borrowers (to check risk flags from other lenders)
    jwt_role() = 'lender' OR
    -- Borrowers can view their own record
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrowers.id AND user_id = auth.uid()
    )
  );
