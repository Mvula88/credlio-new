-- Fix create_notification function - type column is TEXT not enum
-- Remove the ::notification_type cast that was causing errors

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal',
  p_action_label TEXT DEFAULT NULL,
  p_action_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
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
    target_role
  ) VALUES (
    p_user_id,
    p_type,  -- No cast needed, type column is TEXT
    p_title,
    p_message,
    p_link,
    COALESCE(p_priority, 'normal'),
    p_action_label,
    p_action_link,
    COALESCE(p_metadata, '{}'),
    p_expires_at,
    COALESCE(p_target_role, 'all')
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;
