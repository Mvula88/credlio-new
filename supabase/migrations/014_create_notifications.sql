-- In-app notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('loan_offer', 'loan_accepted', 'payment_due', 'payment_received', 'kyc_approved', 'kyc_rejected', 'risk_flag', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Admin policies for notifications
CREATE POLICY "Admins can view all notifications" ON public.notifications
  FOR SELECT USING (jwt_role() = 'admin');

CREATE POLICY "Admins can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (jwt_role() = 'admin');

CREATE POLICY "Admins can update notifications" ON public.notifications
  FOR UPDATE USING (jwt_role() = 'admin');

CREATE POLICY "Admins can delete notifications" ON public.notifications
  FOR DELETE USING (jwt_role() = 'admin');

-- Function to create notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT DEFAULT NULL
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
    created_at
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_link,
    NOW()
  ) RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.notifications
  SET
    read = TRUE,
    read_at = NOW()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND read = FALSE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

-- Function to mark all notifications as read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
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
    AND read = FALSE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
