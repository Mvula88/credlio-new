-- Add admin DELETE policies for messages and message_threads
-- This allows admins to permanently delete any message or thread from the system

-- Admin can delete any message
DROP POLICY IF EXISTS "Admin can delete any message" ON public.messages;
CREATE POLICY "Admin can delete any message" ON public.messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Admin can delete any message thread
DROP POLICY IF EXISTS "Admin can delete any thread" ON public.message_threads;
CREATE POLICY "Admin can delete any thread" ON public.message_threads
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Users can delete their own notifications (not just admins)
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON POLICY "Admin can delete any message" ON public.messages IS 'Allows admins to permanently delete any message from the system';
COMMENT ON POLICY "Admin can delete any thread" ON public.message_threads IS 'Allows admins to permanently delete any message thread from the system';
COMMENT ON POLICY "Users can delete own notifications" ON public.notifications IS 'Allows users to delete their own notifications';
