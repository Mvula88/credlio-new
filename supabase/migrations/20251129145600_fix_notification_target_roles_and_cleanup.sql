-- Fix notification target_role for ALL existing notifications
-- This ensures proper separation between lender and borrower notifications

-- Step 1: Fix by notification type (more reliable than link path)
-- Borrower notifications types
UPDATE public.notifications
SET target_role = 'borrower'
WHERE target_role IS NULL OR target_role = 'all' OR target_role = ''
  AND type IN (
    'loan_offer_received',
    'loan_offer',
    'payment_due',
    'payment_confirmed',
    'kyc_approved',
    'kyc_rejected',
    'identity_verified',
    'kyc_pending_review',
    'agreement_signed_lender',
    'agreement_fully_signed',
    'dispute_filed',
    'dispute_resolved',
    'dispute_escalated'
  );

-- Lender notification types
UPDATE public.notifications
SET target_role = 'lender'
WHERE target_role IS NULL OR target_role = 'all' OR target_role = ''
  AND type IN (
    'loan_accepted',
    'loan_rejected',
    'loan_disbursed',
    'loan_completed',
    'loan_defaulted',
    'payment_received',
    'risk_flag',
    'risk_flag_added',
    'agreement_signed_borrower',
    'account_suspended',
    'account_restored'
  );

-- Step 2: Fix by link path for any remaining
UPDATE public.notifications
SET target_role = 'borrower'
WHERE (target_role IS NULL OR target_role = 'all' OR target_role = '')
  AND link LIKE '/b/%';

UPDATE public.notifications
SET target_role = 'lender'
WHERE (target_role IS NULL OR target_role = 'all' OR target_role = '')
  AND link LIKE '/l/%';

-- Step 3: Fix by title/message patterns for remaining edge cases
UPDATE public.notifications
SET target_role = 'borrower'
WHERE (target_role IS NULL OR target_role = 'all' OR target_role = '')
  AND (
    title LIKE '%New Loan Offer%'
    OR title LIKE '%offered you a loan%'
    OR message LIKE '%offered you a loan%'
    OR message LIKE '%Review and accept or decline%'
  );

UPDATE public.notifications
SET target_role = 'lender'
WHERE (target_role IS NULL OR target_role = 'all' OR target_role = '')
  AND (
    title LIKE '%Loan Offer Accepted%'
    OR title LIKE '%Loan Offer Declined%'
    OR message LIKE '%has accepted your loan offer%'
    OR message LIKE '%has declined your loan offer%'
  );

-- Step 4: Set any remaining without target_role to 'all' (default behavior)
UPDATE public.notifications
SET target_role = 'all'
WHERE target_role IS NULL OR target_role = '';
