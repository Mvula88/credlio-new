-- Fix notification marking functions to work with target_role
-- When a user is both a lender and borrower, notifications are split by target_role
-- The mark functions should respect this split

-- Update mark_all_notifications_read to accept optional target_role parameter
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_target_role TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.notifications
  SET
    read = TRUE,
    read_at = NOW()
  WHERE user_id = auth.uid()
    AND read = FALSE
    AND type NOT IN ('new_message', 'message_reply')
    AND (
      p_target_role IS NULL
      OR target_role = p_target_role
      OR target_role = 'all'
      OR target_role IS NULL
    );
END;
$$;

-- Grant permission
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(TEXT) TO authenticated;

-- Also create a function to get unread count by role
CREATE OR REPLACE FUNCTION public.get_notification_count_by_role(p_target_role TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND read = FALSE
    AND type NOT IN ('new_message', 'message_reply')
    AND (target_role = p_target_role OR target_role = 'all' OR target_role IS NULL);

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_notification_count_by_role(TEXT) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Fixed notification functions to respect target_role';
END $$;
