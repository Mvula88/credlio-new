-- Allow lenders to re-submit disbursement proof after borrower disputes
-- This clears the dispute and notifies the borrower to check again

CREATE OR REPLACE FUNCTION public.submit_disbursement_proof(
  p_loan_id UUID,
  p_amount DECIMAL,
  p_method TEXT,
  p_reference TEXT DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
  v_was_disputed BOOLEAN := FALSE;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get loan details
  SELECT l.*, b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE l.id = p_loan_id;

  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Check caller is the lender
  IF v_loan.lender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the lender can submit disbursement proof';
  END IF;

  -- Check loan is in pending_disbursement status
  IF v_loan.status != 'pending_disbursement' THEN
    RAISE EXCEPTION 'Loan is not awaiting disbursement (status: %)', v_loan.status;
  END IF;

  -- Get currency symbol
  v_currency_symbol := CASE
    WHEN v_loan.currency = 'USD' THEN '$'
    WHEN v_loan.currency = 'KES' THEN 'KSh'
    WHEN v_loan.currency = 'UGX' THEN 'USh'
    WHEN v_loan.currency = 'TZS' THEN 'TSh'
    WHEN v_loan.currency = 'RWF' THEN 'FRw'
    WHEN v_loan.currency = 'NGN' THEN 'N'
    WHEN v_loan.currency = 'GHS' THEN 'GHC'
    WHEN v_loan.currency = 'ZAR' THEN 'R'
    WHEN v_loan.currency = 'NAD' THEN 'N$'
    ELSE v_loan.currency || ' '
  END;

  -- Check if there was a previous dispute (so we know this is a resubmission)
  SELECT borrower_disputed INTO v_was_disputed
  FROM public.disbursement_proofs
  WHERE loan_id = p_loan_id;

  -- Update disbursement proof record (or insert if not exists)
  -- This also clears any previous dispute!
  UPDATE public.disbursement_proofs
  SET
    lender_proof_url = p_proof_url,
    lender_proof_method = p_method,
    lender_proof_reference = p_reference,
    lender_proof_amount = p_amount,
    lender_proof_date = CURRENT_DATE,
    lender_proof_notes = p_notes,
    lender_submitted_at = NOW(),
    -- Clear any previous dispute
    borrower_disputed = FALSE,
    borrower_dispute_reason = NULL,
    borrower_disputed_at = NULL,
    -- Clear previous confirmation (if any)
    borrower_confirmed = FALSE,
    borrower_confirmed_at = NULL,
    borrower_confirmation_notes = NULL,
    updated_at = NOW()
  WHERE loan_id = p_loan_id;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.disbursement_proofs (
      loan_id,
      lender_proof_url,
      lender_proof_method,
      lender_proof_reference,
      lender_proof_amount,
      lender_proof_date,
      lender_proof_notes,
      lender_submitted_at
    ) VALUES (
      p_loan_id,
      p_proof_url,
      p_method,
      p_reference,
      p_amount,
      CURRENT_DATE,
      p_notes,
      NOW()
    );
  END IF;

  -- Get borrower user_id for notification
  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id
  LIMIT 1;

  IF v_borrower_user_id IS NOT NULL THEN
    IF v_was_disputed THEN
      -- This is a resubmission after dispute
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        v_borrower_user_id,
        'disbursement_sent',
        'Lender Sent New Proof of Payment',
        'Your lender has uploaded new proof showing they sent ' || v_currency_symbol || p_amount::TEXT || '. Please check again and confirm if you received it.',
        '/b/loans/' || p_loan_id::TEXT,
        'borrower'
      );
    ELSE
      -- First time submission
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        v_borrower_user_id,
        'disbursement_sent',
        'Funds Sent - Please Confirm',
        'Your lender has sent ' || v_currency_symbol || p_amount::TEXT || '. Please confirm once you receive the funds.',
        '/b/loans/' || p_loan_id::TEXT,
        'borrower'
      );
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Updated submit_disbursement_proof to allow resubmission after dispute';
END $$;
