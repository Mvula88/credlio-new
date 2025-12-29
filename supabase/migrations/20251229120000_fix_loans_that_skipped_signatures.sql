-- Fix loans that were created before the signature flow was implemented
-- These loans went directly to 'active' or 'pending_disbursement' without signatures

-- Reset active/pending_disbursement loans to pending_signatures if they have NO signatures
UPDATE public.loans
SET status = 'pending_signatures',
    updated_at = NOW()
WHERE status IN ('active', 'pending_disbursement')
AND NOT EXISTS (
  -- Check if there's a loan_agreement with at least one signature
  SELECT 1 FROM public.loan_agreements la
  WHERE la.loan_id = loans.id
  AND (la.borrower_signed_at IS NOT NULL OR la.lender_signed_at IS NOT NULL)
);

-- Also reset loans that have no agreement record at all
UPDATE public.loans
SET status = 'pending_signatures',
    updated_at = NOW()
WHERE status IN ('active', 'pending_disbursement')
AND NOT EXISTS (
  SELECT 1 FROM public.loan_agreements la WHERE la.loan_id = loans.id
);

-- Log what was fixed
DO $$
DECLARE
  fixed_count INT;
BEGIN
  SELECT COUNT(*) INTO fixed_count
  FROM public.loans
  WHERE status = 'pending_signatures';

  RAISE NOTICE 'Loans now in pending_signatures status: %', fixed_count;
END $$;
