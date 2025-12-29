-- Fix accept_offer function to call generate_loan_agreement instead of inserting empty record
-- The loan_agreements table has NOT NULL constraints on agreement_html and agreement_text

CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id UUID)
RETURNS UUID -- Returns the new loan_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id UUID;
  v_borrower_id UUID;
  v_borrower_user_id UUID;
  v_country TEXT;
  v_currency TEXT;
  v_lender_id UUID;
  v_principal BIGINT;
  v_apr_bps INT;
  v_term_months INT;
  v_fees_minor BIGINT;
  v_new_loan_id UUID;
  v_monthly_payment BIGINT;
  v_total_interest BIGINT;
  v_total_amount BIGINT;
  v_monthly_principal BIGINT;
  v_monthly_interest BIGINT;
BEGIN
  -- Lock the offer and its request to avoid races
  SELECT
    o.request_id,
    o.lender_id,
    o.amount_minor,
    o.apr_bps,
    o.term_months,
    o.fees_minor,
    r.borrower_id,
    r.borrower_user_id,
    r.country_code,
    r.currency
  INTO
    v_request_id,
    v_lender_id,
    v_principal,
    v_apr_bps,
    v_term_months,
    v_fees_minor,
    v_borrower_id,
    v_borrower_user_id,
    v_country,
    v_currency
  FROM public.loan_offers o
  JOIN public.loan_requests r ON r.id = o.request_id
  WHERE o.id = p_offer_id
  FOR UPDATE;

  -- Validate offer exists
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  -- Verify the caller is the borrower who made the request
  IF v_borrower_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the borrower who made the request can accept offers';
  END IF;

  -- Check if offer is still pending
  IF NOT EXISTS (
    SELECT 1 FROM public.loan_offers
    WHERE id = p_offer_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Offer is no longer available';
  END IF;

  -- Accept this offer
  UPDATE public.loan_offers
    SET status = 'accepted',
        updated_at = NOW()
  WHERE id = p_offer_id;

  -- Decline all other pending offers for this request
  UPDATE public.loan_offers
    SET status = 'declined',
        updated_at = NOW()
  WHERE request_id = v_request_id
    AND id != p_offer_id
    AND status = 'pending';

  -- Create the loan with status pending_signatures
  v_new_loan_id := uuid_generate_v4();

  INSERT INTO public.loans (
    id,
    borrower_id,
    lender_id,
    request_id,
    country_code,
    currency,
    principal_minor,
    apr_bps,
    fees_minor,
    term_months,
    start_date,
    end_date,
    status,
    total_repaid_minor,
    created_at
  ) VALUES (
    v_new_loan_id,
    v_borrower_id,
    v_lender_id,
    v_request_id,
    v_country,
    v_currency,
    v_principal,
    v_apr_bps,
    COALESCE(v_fees_minor, 0),
    v_term_months,
    CURRENT_DATE,
    CURRENT_DATE + make_interval(months => v_term_months),
    'pending_signatures',
    0,
    NOW()
  );

  -- Generate the loan agreement (this function creates the agreement with HTML/text)
  PERFORM public.generate_loan_agreement(v_new_loan_id);

  -- Calculate using SIMPLE INTEREST:
  -- Interest = Principal × Rate%
  -- apr_bps is in basis points (100 bps = 1%), so divide by 10000 to get decimal
  v_total_interest := (v_principal * v_apr_bps) / 10000;

  -- Total amount = Principal + Interest + Fees
  v_total_amount := v_principal + v_total_interest + COALESCE(v_fees_minor, 0);

  -- Monthly payment = Total / Number of months
  v_monthly_payment := v_total_amount / v_term_months;
  v_monthly_principal := v_principal / v_term_months;
  v_monthly_interest := v_total_interest / v_term_months;

  -- Generate repayment schedule
  FOR i IN 1..v_term_months LOOP
    INSERT INTO public.repayment_schedules (
      loan_id,
      installment_no,
      due_date,
      amount_due_minor,
      principal_minor,
      interest_minor,
      created_at
    ) VALUES (
      v_new_loan_id,
      i,
      CURRENT_DATE + make_interval(months => i),
      v_monthly_payment,
      v_monthly_principal,
      v_monthly_interest,
      NOW()
    );
  END LOOP;

  -- Close the request
  UPDATE public.loan_requests
    SET status = 'accepted',
        accepted_offer_id = p_offer_id,
        updated_at = NOW()
  WHERE id = v_request_id;

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
      v_lender_id,
      'loan_accepted',
      'Loan offer accepted',
      'Your loan offer has been accepted. Please sign the agreement.',
      'loan',
      v_new_loan_id,
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create notification: %', SQLERRM;
  END;

  RETURN v_new_loan_id;
END;
$$;
