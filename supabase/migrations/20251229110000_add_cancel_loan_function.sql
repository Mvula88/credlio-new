-- Allow borrowers to cancel a loan ONLY if they haven't signed the agreement yet
-- Once the borrower uploads their signed agreement, cancellation is no longer possible

CREATE OR REPLACE FUNCTION public.cancel_loan_by_borrower(p_loan_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan RECORD;
  v_agreement RECORD;
  v_borrower_user_id UUID;
BEGIN
  -- Get the loan details
  SELECT l.*, b.id as borrower_id
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE l.id = p_loan_id AND bul.user_id = auth.uid()
  FOR UPDATE;

  -- Check if loan exists and belongs to this borrower
  IF v_loan.id IS NULL THEN
    RAISE EXCEPTION 'Loan not found or you do not have permission to cancel it';
  END IF;

  -- Check loan status - can only cancel if pending_signatures
  IF v_loan.status != 'pending_signatures' THEN
    RAISE EXCEPTION 'Can only cancel loans that are awaiting signatures. Current status: %', v_loan.status;
  END IF;

  -- Check if borrower has already signed
  SELECT * INTO v_agreement
  FROM public.loan_agreements
  WHERE loan_id = p_loan_id;

  IF v_agreement.borrower_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot cancel this loan because you have already signed the agreement';
  END IF;

  -- All checks passed - cancel the loan
  UPDATE public.loans
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_loan_id;

  -- Also update the original loan request back to 'open' so borrower can accept other offers
  UPDATE public.loan_requests
  SET status = 'open',
      accepted_offer_id = NULL,
      updated_at = NOW()
  WHERE id = v_loan.request_id;

  -- Mark the offer as declined
  UPDATE public.loan_offers
  SET status = 'declined',
      updated_at = NOW()
  WHERE request_id = v_loan.request_id
    AND status = 'accepted';

  -- Delete the loan agreement record
  DELETE FROM public.loan_agreements WHERE loan_id = p_loan_id;

  -- Delete repayment schedules
  DELETE FROM public.repayment_schedules WHERE loan_id = p_loan_id;

  -- Log the cancellation
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    auth.uid(),
    'cancel',
    'loan',
    p_loan_id,
    jsonb_build_object(
      'reason', 'borrower_cancelled_before_signing',
      'previous_status', v_loan.status
    ),
    NOW()
  );

  -- Notify the lender
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    target_type,
    target_id,
    created_at
  ) VALUES (
    v_loan.lender_id,
    'loan_status',
    'Loan Cancelled by Borrower',
    'The borrower has cancelled the loan before signing the agreement.',
    'loan',
    p_loan_id,
    NOW()
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_loan_by_borrower(UUID) TO authenticated;

COMMENT ON FUNCTION public.cancel_loan_by_borrower(UUID) IS
  'Allows a borrower to cancel a loan ONLY if they have not yet signed the agreement.
   Once signed, the loan cannot be cancelled by the borrower.';
