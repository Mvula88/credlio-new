-- Fix loans that were fully signed but didn't transition to pending_disbursement
-- This can happen if the loan was signed before the disbursement system was added

-- Find all loans where:
-- 1. The loan_agreement is fully_signed = true
-- 2. The loan status is NOT 'active' (meaning it hasn't been disbursed yet)
-- 3. The loan status is still 'pending_signatures' or similar

DO $$
DECLARE
  v_fixed_count INT := 0;
  v_loan RECORD;
BEGIN
  -- Find loans with fully signed agreements but incorrect status
  FOR v_loan IN
    SELECT l.id, l.status, la.fully_signed, la.fully_signed_at
    FROM public.loans l
    JOIN public.loan_agreements la ON la.loan_id = l.id
    WHERE la.fully_signed = TRUE
    AND l.status IN ('pending_signatures', 'pending_offer')
    AND l.status != 'pending_disbursement'
    AND l.status != 'active'
    AND l.status != 'completed'
    AND l.status != 'defaulted'
  LOOP
    -- Update loan to pending_disbursement
    UPDATE public.loans
    SET
      status = 'pending_disbursement',
      updated_at = NOW()
    WHERE id = v_loan.id;

    -- Create disbursement_proofs record if not exists
    INSERT INTO public.disbursement_proofs (loan_id)
    VALUES (v_loan.id)
    ON CONFLICT DO NOTHING;

    v_fixed_count := v_fixed_count + 1;

    RAISE NOTICE 'Fixed loan % - was %, now pending_disbursement', v_loan.id, v_loan.status;
  END LOOP;

  RAISE NOTICE 'Total loans fixed: %', v_fixed_count;
END $$;

-- Also handle any loans that might be in 'active' status but were never properly disbursed
-- These loans were activated before the disbursement system was added
-- We'll leave them as active since they're already in progress, but create a disbursement_proofs record

INSERT INTO public.disbursement_proofs (loan_id, borrower_confirmed, borrower_confirmed_at, lender_submitted_at)
SELECT
  l.id,
  TRUE,
  COALESCE(l.disbursed_at, l.start_date, la.fully_signed_at, NOW()),
  COALESCE(l.disbursed_at, l.start_date, la.fully_signed_at, NOW())
FROM public.loans l
JOIN public.loan_agreements la ON la.loan_id = l.id
LEFT JOIN public.disbursement_proofs dp ON dp.loan_id = l.id
WHERE l.status = 'active'
AND la.fully_signed = TRUE
AND dp.id IS NULL
ON CONFLICT DO NOTHING;

-- Log how many active loans were backfilled
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.loans l
  JOIN public.disbursement_proofs dp ON dp.loan_id = l.id
  WHERE l.status = 'active';

  RAISE NOTICE 'Active loans with disbursement records: %', v_count;
END $$;
