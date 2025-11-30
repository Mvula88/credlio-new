-- Allow borrowers to view lender information for loans they are part of
-- This is needed so borrowers can see who their lender is on their loan details

-- Create policy for borrowers to view lenders who have loans with them
CREATE POLICY "Borrowers can view lenders for their loans"
ON public.lenders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.loans l
    JOIN public.borrower_user_links bul ON bul.borrower_id = l.borrower_id
    WHERE l.lender_id = lenders.user_id
    AND bul.user_id = auth.uid()
  )
);
