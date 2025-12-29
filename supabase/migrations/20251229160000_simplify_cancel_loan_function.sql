-- Simplified cancel_loan_by_borrower - don't touch loan_offers status
-- Just cancel the loan and request

CREATE OR REPLACE FUNCTION public.cancel_loan_by_borrower(p_loan_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan RECORD;
  v_agreement RECORD;
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

  IF v_agreement IS NOT NULL AND v_agreement.borrower_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot cancel this loan because you have already signed the agreement';
  END IF;

  -- Cancel the loan
  UPDATE public.loans
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_loan_id;

  -- Mark the loan request as cancelled
  UPDATE public.loan_requests
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = v_loan.request_id;

  -- Delete the loan agreement record if exists
  DELETE FROM public.loan_agreements WHERE loan_id = p_loan_id;

  -- Delete repayment schedules
  DELETE FROM public.repayment_schedules WHERE loan_id = p_loan_id;

  -- Log the cancellation
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to log cancellation: %', SQLERRM;
  END;

  -- Notify the lender
  BEGIN
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
      'The borrower has cancelled the loan before signing.',
      'loan',
      p_loan_id,
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create notification: %', SQLERRM;
  END;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_loan_by_borrower(UUID) TO authenticated;

COMMENT ON FUNCTION public.cancel_loan_by_borrower(UUID) IS
  'Cancels a loan before the borrower signs. Loan and request are cancelled.';
