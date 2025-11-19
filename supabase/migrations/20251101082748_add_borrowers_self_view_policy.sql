-- Add policy for users to view their own borrower record
-- Users need to be able to read their borrower data to use the borrower portal

CREATE POLICY "Users can view their own borrower record" ON public.borrowers
  FOR SELECT
  USING (
    id IN (
      SELECT borrower_id
      FROM public.borrower_user_links
      WHERE user_id = auth.uid()
    )
  );
