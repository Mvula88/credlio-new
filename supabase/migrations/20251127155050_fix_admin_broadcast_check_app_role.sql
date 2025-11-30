-- Fix admin broadcast notification functions to check both user_roles and profiles.app_role
-- This ensures admins can send broadcasts regardless of which table has their admin role

-- Function to send notification to all users
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title TEXT,
  p_message TEXT,
  p_target TEXT DEFAULT 'all', -- 'all', 'lenders', 'borrowers'
  p_priority TEXT DEFAULT 'normal',
  p_link TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_count INTEGER := 0;
  v_user_record RECORD;
BEGIN
  -- Verify caller is admin (check both user_roles table and profiles.app_role)
  SELECT p.user_id INTO v_admin_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  AND (
    p.app_role = 'admin'
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'admin')
  );

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Only admins can broadcast notifications';
  END IF;

  -- Send to appropriate users based on target
  IF p_target = 'all' THEN
    -- Send to all users with profiles
    FOR v_user_record IN
      SELECT DISTINCT user_id FROM public.profiles WHERE user_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, priority, created_at)
      VALUES (v_user_record.user_id, 'admin_broadcast', p_title, p_message, p_link, p_priority, NOW());
      v_count := v_count + 1;
    END LOOP;

  ELSIF p_target = 'lenders' THEN
    -- Send to all lenders
    FOR v_user_record IN
      SELECT user_id FROM public.lenders WHERE user_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, priority, created_at)
      VALUES (v_user_record.user_id, 'admin_broadcast', p_title, p_message, p_link, p_priority, NOW());
      v_count := v_count + 1;
    END LOOP;

  ELSIF p_target = 'borrowers' THEN
    -- Send to all borrowers (via borrower_user_links)
    FOR v_user_record IN
      SELECT DISTINCT user_id FROM public.borrower_user_links WHERE user_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, priority, created_at)
      VALUES (v_user_record.user_id, 'admin_broadcast', p_title, p_message, p_link, p_priority, NOW());
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

-- Function to send notification to a specific user
CREATE OR REPLACE FUNCTION public.admin_send_notification(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_link TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_notification_id UUID;
BEGIN
  -- Verify caller is admin (check both user_roles table and profiles.app_role)
  SELECT p.user_id INTO v_admin_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  AND (
    p.app_role = 'admin'
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'admin')
  );

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Only admins can send notifications';
  END IF;

  -- Create the notification
  INSERT INTO public.notifications (user_id, type, title, message, link, priority, created_at)
  VALUES (p_user_id, 'admin_message', p_title, p_message, p_link, p_priority, NOW())
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Comments
COMMENT ON FUNCTION public.admin_broadcast_notification IS 'Allows admin to broadcast notifications to all users, lenders only, or borrowers only';
COMMENT ON FUNCTION public.admin_send_notification IS 'Allows admin to send a notification to a specific user';
