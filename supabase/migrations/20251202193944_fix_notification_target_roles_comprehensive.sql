-- Comprehensive fix for notification target_role filtering
-- This ensures lenders only see lender notifications and borrowers only see borrower notifications

-- Fix 1: Update existing notifications based on link path (most reliable)
-- Lender notifications have links starting with /l/
UPDATE public.notifications
SET target_role = 'lender'
WHERE link LIKE '/l/%'
  AND (target_role IS NULL OR target_role = 'all' OR target_role = '');

-- Borrower notifications have links starting with /b/
UPDATE public.notifications
SET target_role = 'borrower'
WHERE link LIKE '/b/%'
  AND (target_role IS NULL OR target_role = 'all' OR target_role = '');

-- Fix 2: Update based on notification type
-- Lender-specific notification types
UPDATE public.notifications
SET target_role = 'lender'
WHERE type IN (
    'loan_accepted',
    'loan_rejected',
    'loan_declined',
    'loan_disbursed',
    'loan_completed',
    'loan_defaulted',
    'payment_received',
    'risk_flag',
    'risk_flag_added',
    'fraud_warning',
    'agreement_signed_borrower',
    'account_suspended',
    'account_restored',
    'verification_required'
  )
  AND (target_role IS NULL OR target_role = 'all' OR target_role = '');

-- Borrower-specific notification types
UPDATE public.notifications
SET target_role = 'borrower'
WHERE type IN (
    'loan_offer_received',
    'loan_offer',
    'new_loan_offer',
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
  )
  AND (target_role IS NULL OR target_role = 'all' OR target_role = '');

-- Fix 3: Update based on title patterns
-- "Loan Offer Accepted" is FOR the lender (lender sees this when borrower accepts)
UPDATE public.notifications
SET target_role = 'lender'
WHERE (
    title LIKE '%Loan Offer Accepted%'
    OR title LIKE '%Loan Offer Declined%'
    OR title LIKE '%has accepted your loan%'
    OR title LIKE '%has declined your loan%'
    OR title LIKE '%Lender signed%'
    OR message LIKE '%has accepted your loan offer%'
    OR message LIKE '%has declined your loan offer%'
  )
  AND (target_role IS NULL OR target_role = 'all' OR target_role = '');

-- "New Loan Offer" is FOR the borrower (borrower sees this when lender creates offer)
UPDATE public.notifications
SET target_role = 'borrower'
WHERE (
    title LIKE '%New Loan Offer%'
    OR title LIKE '%offered you a loan%'
    OR title LIKE '%Borrower signed%'
    OR message LIKE '%offered you a loan%'
    OR message LIKE '%Review and accept or decline%'
  )
  AND (target_role IS NULL OR target_role = 'all' OR target_role = '');

-- Fix 4: Set any remaining without target_role based on user type
-- Check if the user_id is a lender or borrower
UPDATE public.notifications n
SET target_role = 'lender'
WHERE (n.target_role IS NULL OR n.target_role = 'all' OR n.target_role = '')
  AND EXISTS (
    SELECT 1 FROM public.lenders l WHERE l.user_id = n.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.borrower_user_links bul WHERE bul.user_id = n.user_id
  );

UPDATE public.notifications n
SET target_role = 'borrower'
WHERE (n.target_role IS NULL OR n.target_role = 'all' OR n.target_role = '')
  AND EXISTS (
    SELECT 1 FROM public.borrower_user_links bul WHERE bul.user_id = n.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.lenders l WHERE l.user_id = n.user_id
  );

-- Fix 5: For users who are BOTH lender and borrower, use link path as final decision
-- If link goes to /l/, it's a lender notification
-- If link goes to /b/, it's a borrower notification
UPDATE public.notifications
SET target_role = 'lender'
WHERE link LIKE '/l/%'
  AND target_role = 'all';

UPDATE public.notifications
SET target_role = 'borrower'
WHERE link LIKE '/b/%'
  AND target_role = 'all';

-- Log the fix
DO $$
DECLARE
  lender_count INT;
  borrower_count INT;
  all_count INT;
BEGIN
  SELECT COUNT(*) INTO lender_count FROM public.notifications WHERE target_role = 'lender';
  SELECT COUNT(*) INTO borrower_count FROM public.notifications WHERE target_role = 'borrower';
  SELECT COUNT(*) INTO all_count FROM public.notifications WHERE target_role = 'all' OR target_role IS NULL;

  RAISE NOTICE 'Notification target_role distribution: Lender=%, Borrower=%, All/NULL=%',
    lender_count, borrower_count, all_count;
END $$;
