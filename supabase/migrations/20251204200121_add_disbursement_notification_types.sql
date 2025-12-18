-- Add disbursement-related notification types to the check constraint
-- The constraint is blocking new notification types like 'disbursement_sent', 'disbursement_required', etc.

-- First, drop the existing constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add new constraint with ALL notification types (existing + disbursement types)
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  -- Existing loan types
  'loan_offer',
  'loan_accepted',
  'loan_rejected',
  'loan_funded',
  'loan_disbursed',
  'loan_completed',
  'loan_defaulted',
  -- Payment types
  'payment_due',
  'payment_received',
  'payment_confirmed',
  'payment_overdue',
  'payment_reminder',
  -- KYC/Verification types
  'kyc_approved',
  'kyc_rejected',
  'kyc_pending_review',
  'identity_verified',
  'verification_required',
  -- Risk types
  'risk_flag',
  'risk_flag_added',
  'fraud_warning',
  -- Account types
  'account_suspended',
  'account_restored',
  'account_review',
  -- Agreement types
  'agreement_generated',
  'agreement_signed_lender',
  'agreement_signed_borrower',
  'agreement_fully_signed',
  'agreement_signed',
  'agreement_ready',
  -- Dispute types
  'dispute_filed',
  'dispute_response',
  'dispute_resolved',
  'dispute_escalated',
  -- Message types
  'new_message',
  'message_reply',
  -- Admin types
  'admin_action',
  'admin_broadcast',
  -- System types
  'platform_announcement',
  'system',
  'system_maintenance',
  'feature_announcement',
  -- NEW: Disbursement types
  'disbursement_required',
  'disbursement_sent',
  'disbursement_confirmed',
  'disbursement_disputed',
  'loan_activated',
  -- NEW: Payment proof types
  'payment_proof_submitted',
  'payment_rejected'
));

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS 'Allowed notification types including disbursement confirmation types';

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Added disbursement notification types to constraint';
END $$;
