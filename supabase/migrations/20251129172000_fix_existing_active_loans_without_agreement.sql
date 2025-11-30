-- Fix existing active loans that have unsigned agreements
-- This migration runs AFTER the enum value has been committed

-- Update existing active loans that were accepted but agreement not fully signed
-- Set them back to pending_signatures
UPDATE public.loans
SET status = 'pending_signatures'
WHERE status = 'active'
  AND borrower_accepted_at IS NOT NULL
  AND id IN (
    SELECT loan_id FROM public.loan_agreements WHERE fully_signed = FALSE OR fully_signed IS NULL
  );

-- Also handle any active loans that don't even have an agreement yet
UPDATE public.loans
SET status = 'pending_signatures'
WHERE status = 'active'
  AND borrower_accepted_at IS NOT NULL
  AND id NOT IN (
    SELECT loan_id FROM public.loan_agreements WHERE loan_id IS NOT NULL
  );

-- Log how many loans were affected (for debugging)
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.loans
  WHERE status = 'pending_signatures';

  RAISE NOTICE 'Loans now in pending_signatures status: %', v_count;
END $$;
