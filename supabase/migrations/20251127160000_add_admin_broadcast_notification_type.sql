-- Add 'admin_broadcast' to allowed notification types
-- This type is used by the admin_broadcast_notification function

-- Drop existing type constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Recreate constraint with admin_broadcast included
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
  'admin_broadcast',  -- Added this type for broadcast notifications
  'account_review',
  'platform_announcement',
  'system',
  'system_maintenance',
  'feature_announcement'
));

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS 'Allowed notification types including admin_broadcast for platform-wide announcements';
