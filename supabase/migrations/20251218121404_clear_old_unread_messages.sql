-- One-time cleanup: Mark all existing unread messages as read
-- This fixes the badge showing old unread messages

UPDATE public.messages
SET read_at = NOW()
WHERE read_at IS NULL;
