-- Fix message_threads INSERT policy for lenders
-- Allow lenders to create message threads when making offers

-- Add INSERT policy for lenders to create threads
DROP POLICY IF EXISTS "Lenders can create message threads" ON public.message_threads;

CREATE POLICY "Lenders can create message threads" ON public.message_threads
  FOR INSERT WITH CHECK (
    -- Lender must be creating a thread with themselves as the lender
    lender_id = auth.uid() AND
    -- Must have lender role
    (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'lender'
      ) OR
      EXISTS (
        SELECT 1 FROM public.lenders
        WHERE user_id = auth.uid()
      )
    )
  );

-- Also add UPDATE policy so participants can update thread status
DROP POLICY IF EXISTS "Participants can update thread status" ON public.message_threads;

CREATE POLICY "Participants can update thread status" ON public.message_threads
  FOR UPDATE USING (
    lender_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.borrowers
      WHERE id = message_threads.borrower_id AND user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Lenders can create message threads" ON public.message_threads IS
  'Lenders can create message threads when making offers or initiating conversations';

COMMENT ON POLICY "Participants can update thread status" ON public.message_threads IS
  'Thread participants can update the thread status (active, closed, archived)';
