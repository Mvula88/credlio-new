-- Add target_role to notifications to properly filter by user context
-- This prevents dual-role users from seeing lender notifications in borrower dashboard and vice versa

-- Add target_role column
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS target_role TEXT;

-- Add check constraint for target_role
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_target_role_check CHECK (target_role IS NULL OR target_role IN ('borrower', 'lender', 'admin', 'all'));

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_notifications_user_role ON public.notifications(user_id, target_role) WHERE read = FALSE;

-- Update existing notifications to have target_role = 'all' (backward compatibility)
UPDATE public.notifications
SET target_role = 'all'
WHERE target_role IS NULL;

-- Update admin_broadcast_notification to set target_role appropriately
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
  v_target_role TEXT;
BEGIN
  -- Verify caller is admin
  SELECT user_id INTO v_admin_id
  FROM public.user_roles
  WHERE user_id = auth.uid() AND role = 'admin';

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Only admins can broadcast notifications';
  END IF;

  -- Determine target_role based on target parameter
  IF p_target = 'lenders' THEN
    v_target_role := 'lender';
  ELSIF p_target = 'borrowers' THEN
    v_target_role := 'borrower';
  ELSE
    v_target_role := 'all';
  END IF;

  -- Send to appropriate users based on target
  IF p_target = 'all' THEN
    -- Send to all users with profiles
    FOR v_user_record IN
      SELECT DISTINCT user_id FROM public.profiles WHERE user_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, priority, target_role, created_at)
      VALUES (v_user_record.user_id, 'admin_broadcast', p_title, p_message, p_link, p_priority, v_target_role, NOW());
      v_count := v_count + 1;
    END LOOP;

  ELSIF p_target = 'lenders' THEN
    -- Send to all lenders with target_role = 'lender'
    FOR v_user_record IN
      SELECT user_id FROM public.lenders WHERE user_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, priority, target_role, created_at)
      VALUES (v_user_record.user_id, 'admin_broadcast', p_title, p_message, p_link, p_priority, v_target_role, NOW());
      v_count := v_count + 1;
    END LOOP;

  ELSIF p_target = 'borrowers' THEN
    -- Send to all borrowers with target_role = 'borrower'
    FOR v_user_record IN
      SELECT DISTINCT user_id FROM public.borrower_user_links WHERE user_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, priority, target_role, created_at)
      VALUES (v_user_record.user_id, 'admin_broadcast', p_title, p_message, p_link, p_priority, v_target_role, NOW());
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

-- Update create_notification function to support target_role
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal',
  p_action_label TEXT DEFAULT NULL,
  p_action_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_target_role TEXT DEFAULT 'all'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    link,
    priority,
    action_label,
    action_link,
    metadata,
    expires_at,
    target_role,
    created_at
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_link,
    p_priority,
    p_action_label,
    p_action_link,
    p_metadata,
    p_expires_at,
    p_target_role,
    NOW()
  ) RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Grant execute permission for updated function
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, TEXT) TO authenticated;

-- Comments
COMMENT ON COLUMN public.notifications.target_role IS 'Target user role context: borrower, lender, admin, or all. Prevents dual-role users from seeing wrong notifications.';
COMMENT ON CONSTRAINT notifications_target_role_check ON public.notifications IS 'Ensures target_role is valid';
