-- Expand notification system for comprehensive in-app notifications
-- NOTE: Messages system already exists in 20251108170559_add_platform_wide_enhancements.sql

-- Drop existing type constraint to add more notification types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add new notification types for all platform events
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'loan_offer',
  'loan_accepted',
  'loan_rejected',
  'loan_funded',
  'loan_disbursed',
  'loan_completed',
  'loan_defaulted',
  'payment_due',
  'payment_received',
  'payment_confirmed',
  'payment_overdue',
  'payment_reminder',
  'kyc_approved',
  'kyc_rejected',
  'kyc_pending_review',
  'identity_verified',
  'verification_required',
  'risk_flag',
  'risk_flag_added',
  'fraud_warning',
  'account_suspended',
  'account_restored',
  'agreement_generated',
  'agreement_signed_lender',
  'agreement_signed_borrower',
  'agreement_fully_signed',
  'dispute_filed',
  'dispute_response',
  'dispute_resolved',
  'dispute_escalated',
  'new_message',
  'message_reply',
  'admin_action',
  'account_review',
  'platform_announcement',
  'system',
  'system_maintenance',
  'feature_announcement'
));

-- Add priority field for urgent notifications
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

-- Add metadata field for additional data
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add action buttons support
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS action_label TEXT,
ADD COLUMN IF NOT EXISTS action_link TEXT;

-- Add expiry for time-sensitive notifications
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Create index for priority and unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(user_id, priority, read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON public.notifications(expires_at) WHERE expires_at IS NOT NULL;

-- Add check constraint for priority
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_priority_check'
  ) THEN
    ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

-- Update create_notification function to support new fields
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
  p_expires_at TIMESTAMPTZ DEFAULT NULL
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
    NOW()
  ) RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Grant execute permission for extended function
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND read = FALSE
    AND (expires_at IS NULL OR expires_at > NOW());

  RETURN v_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;

-- Function to get unread message count (works with existing messages table structure)
CREATE OR REPLACE FUNCTION public.get_unread_message_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_lender_id UUID;
  v_borrower_id UUID;
BEGIN
  -- Check if user is a lender
  SELECT user_id INTO v_lender_id
  FROM public.lenders
  WHERE user_id = auth.uid();

  -- Check if user is a borrower (through borrower_user_links)
  SELECT borrower_id INTO v_borrower_id
  FROM public.borrower_user_links
  WHERE user_id = auth.uid();

  IF v_lender_id IS NOT NULL THEN
    -- Count unread messages from borrowers in lender threads
    SELECT COUNT(*)::INTEGER INTO v_count
    FROM public.messages m
    JOIN public.message_threads t ON m.thread_id = t.id
    WHERE t.lender_id = v_lender_id
      AND m.sender_type = 'borrower'
      AND m.read_at IS NULL;
  ELSIF v_borrower_id IS NOT NULL THEN
    -- Count unread messages from lenders in borrower threads
    SELECT COUNT(*)::INTEGER INTO v_count
    FROM public.messages m
    JOIN public.message_threads t ON m.thread_id = t.id
    WHERE t.borrower_id = v_borrower_id
      AND m.sender_type = 'lender'
      AND m.read_at IS NULL;
  ELSE
    v_count := 0;
  END IF;

  RETURN v_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_unread_message_count() TO authenticated;

-- Clean up expired notifications (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- Grant execute permission to service role for cron jobs
GRANT EXECUTE ON FUNCTION public.cleanup_expired_notifications() TO authenticated;

-- Add notification trigger for new messages in existing message system
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipient_user_id UUID;
  v_sender_name TEXT;
BEGIN
  -- Get thread info and determine recipient
  IF NEW.sender_type = 'lender' THEN
    -- Lender sent message, notify borrower
    SELECT
      bul.user_id,
      COALESCE(l.business_name, l.full_name, 'A lender')
    INTO v_recipient_user_id, v_sender_name
    FROM public.message_threads t
    JOIN public.borrowers b ON t.borrower_id = b.id
    JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
    LEFT JOIN public.lenders l ON t.lender_id = l.user_id
    WHERE t.id = NEW.thread_id;
  ELSIF NEW.sender_type = 'borrower' THEN
    -- Borrower sent message, notify lender
    SELECT
      t.lender_id,
      COALESCE(b.full_name, 'A borrower')
    INTO v_recipient_user_id, v_sender_name
    FROM public.message_threads t
    JOIN public.borrowers b ON t.borrower_id = b.id
    WHERE t.id = NEW.thread_id;
  END IF;

  -- Create notification if recipient found
  IF v_recipient_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_recipient_user_id,
      'new_message',
      'New message from ' || v_sender_name,
      SUBSTRING(NEW.message FROM 1 FOR 100) || CASE WHEN LENGTH(NEW.message) > 100 THEN '...' ELSE '' END,
      CASE
        WHEN NEW.sender_type = 'lender' THEN '/b/messages'
        ELSE '/l/messages'
      END,
      'normal',
      'View Message',
      CASE
        WHEN NEW.sender_type = 'lender' THEN '/b/messages'
        ELSE '/l/messages'
      END
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for message notifications (drop first if exists)
DROP TRIGGER IF EXISTS trigger_notify_on_new_message ON public.messages;
CREATE TRIGGER trigger_notify_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_message();

-- Comments
COMMENT ON COLUMN public.notifications.priority IS 'Notification urgency: low, normal, high, urgent';
COMMENT ON COLUMN public.notifications.metadata IS 'Additional structured data for notifications';
COMMENT ON COLUMN public.notifications.action_label IS 'Label for primary action button';
COMMENT ON COLUMN public.notifications.action_link IS 'Link for primary action button';
COMMENT ON COLUMN public.notifications.expires_at IS 'When notification should be automatically removed';
