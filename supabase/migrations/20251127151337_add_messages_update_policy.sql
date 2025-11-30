-- Add UPDATE policy for messages so users can mark messages as read
-- Users can only update messages in threads they are part of

CREATE POLICY "Users can update messages in their threads" ON public.messages
  FOR UPDATE
  USING (
    thread_id IN (
      SELECT id FROM public.message_threads
      WHERE lender_id = auth.uid()
         OR borrower_id IN (
           SELECT id FROM public.borrowers WHERE user_id = auth.uid()
         )
         OR borrower_id IN (
           SELECT borrower_id FROM public.borrower_user_links WHERE user_id = auth.uid()
         )
    )
  )
  WITH CHECK (
    thread_id IN (
      SELECT id FROM public.message_threads
      WHERE lender_id = auth.uid()
         OR borrower_id IN (
           SELECT id FROM public.borrowers WHERE user_id = auth.uid()
         )
         OR borrower_id IN (
           SELECT borrower_id FROM public.borrower_user_links WHERE user_id = auth.uid()
         )
    )
  );
