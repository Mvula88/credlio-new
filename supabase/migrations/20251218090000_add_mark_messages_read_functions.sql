-- Add functions to properly mark messages as read
-- These use SECURITY DEFINER to ensure they work regardless of RLS policies

-- Function to mark messages as read for a specific thread
-- This marks all messages sent by the OTHER party as read (not your own messages)
CREATE OR REPLACE FUNCTION public.mark_thread_messages_read(p_thread_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_is_lender BOOLEAN;
  v_is_borrower BOOLEAN;
  v_borrower_id UUID;
  v_updated_count INTEGER;
BEGIN
  v_user_id := auth.uid();

  -- Check if user is a lender in this thread
  SELECT EXISTS (
    SELECT 1 FROM public.message_threads
    WHERE id = p_thread_id AND lender_id = v_user_id
  ) INTO v_is_lender;

  -- Check if user is a borrower in this thread
  SELECT EXISTS (
    SELECT 1 FROM public.message_threads mt
    WHERE mt.id = p_thread_id
    AND (
      mt.borrower_id IN (SELECT id FROM public.borrowers WHERE user_id = v_user_id)
      OR mt.borrower_id IN (SELECT borrower_id FROM public.borrower_user_links WHERE user_id = v_user_id)
    )
  ) INTO v_is_borrower;

  -- User must be either lender or borrower in this thread
  IF NOT v_is_lender AND NOT v_is_borrower THEN
    RAISE EXCEPTION 'User is not a participant in this thread';
  END IF;

  -- Mark messages as read based on user role
  -- Lenders mark borrower messages as read, borrowers mark lender messages as read
  IF v_is_lender THEN
    UPDATE public.messages
    SET read_at = NOW()
    WHERE thread_id = p_thread_id
      AND sender_type = 'borrower'
      AND read_at IS NULL;
  ELSE
    UPDATE public.messages
    SET read_at = NOW()
    WHERE thread_id = p_thread_id
      AND sender_type = 'lender'
      AND read_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.mark_thread_messages_read(UUID) TO authenticated;

-- Function to get unread message count for the current user
CREATE OR REPLACE FUNCTION public.get_unread_message_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_lender_count INTEGER := 0;
  v_borrower_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();

  -- Count unread messages for lender (messages from borrowers)
  SELECT COALESCE(COUNT(*), 0) INTO v_lender_count
  FROM public.messages m
  JOIN public.message_threads mt ON m.thread_id = mt.id
  WHERE mt.lender_id = v_user_id
    AND m.sender_type = 'borrower'
    AND m.read_at IS NULL;

  -- Count unread messages for borrower (messages from lenders)
  SELECT COALESCE(COUNT(*), 0) INTO v_borrower_count
  FROM public.messages m
  JOIN public.message_threads mt ON m.thread_id = mt.id
  WHERE (
    mt.borrower_id IN (SELECT id FROM public.borrowers WHERE user_id = v_user_id)
    OR mt.borrower_id IN (SELECT borrower_id FROM public.borrower_user_links WHERE user_id = v_user_id)
  )
    AND m.sender_type = 'lender'
    AND m.read_at IS NULL;

  RETURN v_lender_count + v_borrower_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_unread_message_count() TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.mark_thread_messages_read IS 'Marks all messages from the other party in a thread as read';
COMMENT ON FUNCTION public.get_unread_message_count IS 'Gets total unread message count for the current user across all their threads';
