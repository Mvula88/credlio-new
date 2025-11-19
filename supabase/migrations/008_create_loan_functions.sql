-- Function to accept an offer (with single active loan enforcement)
CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id UUID)
RETURNS UUID AS $$
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
  v_loan_id UUID;
  v_offer_status offer_status;
BEGIN
  -- Lock the offer and its request to avoid races
  SELECT 
    o.request_id, 
    o.lender_id, 
    o.status,
    o.amount_minor,
    o.apr_bps,
    o.term_months,
    r.borrower_id, 
    r.borrower_user_id,
    r.country_code, 
    r.currency
  INTO 
    v_request_id, 
    v_lender_id, 
    v_offer_status,
    v_principal,
    v_apr_bps,
    v_term_months,
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

  -- Check offer is still pending
  IF v_offer_status != 'pending' THEN
    RAISE EXCEPTION 'Offer is no longer available';
  END IF;

  -- Check caller is the borrower who created the request
  IF v_borrower_user_id != jwt_uid() THEN
    RAISE EXCEPTION 'Only the borrower can accept offers on their request';
  END IF;

  -- CRITICAL: Block if borrower already has an ACTIVE loan
  IF EXISTS (
    SELECT 1 FROM public.loans
    WHERE borrower_id = v_borrower_id 
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You already have an active loan. Please repay it before taking a new one.';
  END IF;

  -- Accept this offer
  UPDATE public.loan_offers
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_offer_id;

  -- Decline all other pending offers
  UPDATE public.loan_offers
  SET status = 'declined', updated_at = NOW()
  WHERE request_id = v_request_id 
    AND id != p_offer_id 
    AND status = 'pending';

  -- Create the loan
  INSERT INTO public.loans (
    borrower_id, 
    lender_id, 
    request_id, 
    country_code, 
    currency,
    principal_minor, 
    apr_bps, 
    term_months,
    start_date, 
    end_date, 
    status
  ) VALUES (
    v_borrower_id, 
    v_lender_id, 
    v_request_id, 
    v_country, 
    v_currency,
    v_principal, 
    v_apr_bps, 
    v_term_months,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '1 month' * v_term_months,
    'active'
  ) RETURNING id INTO v_loan_id;

  -- Generate repayment schedule
  PERFORM generate_repayment_schedule(v_loan_id, v_principal, v_apr_bps, v_term_months);

  -- Close the request
  UPDATE public.loan_requests
  SET status = 'accepted', updated_at = NOW()
  WHERE id = v_request_id;

  -- Log the action
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target, target_id, country_code)
  VALUES (jwt_uid(), jwt_role(), 'create', 'loan', v_loan_id, v_country);

  RETURN v_loan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate repayment schedule
CREATE OR REPLACE FUNCTION public.generate_repayment_schedule(
  p_loan_id UUID,
  p_principal BIGINT,
  p_apr_bps INT,
  p_term_months INT
)
RETURNS VOID AS $$
DECLARE
  v_monthly_rate DECIMAL;
  v_monthly_payment BIGINT;
  v_remaining_principal BIGINT;
  v_interest_amount BIGINT;
  v_principal_amount BIGINT;
  v_installment_no INT := 1;
  v_due_date DATE;
BEGIN
  -- Calculate monthly interest rate
  v_monthly_rate := p_apr_bps::DECIMAL / 10000 / 12;
  
  -- Calculate fixed monthly payment (using amortization formula)
  IF v_monthly_rate > 0 THEN
    v_monthly_payment := CEIL(
      p_principal * v_monthly_rate * POWER(1 + v_monthly_rate, p_term_months) / 
      (POWER(1 + v_monthly_rate, p_term_months) - 1)
    );
  ELSE
    -- No interest case
    v_monthly_payment := CEIL(p_principal::DECIMAL / p_term_months);
  END IF;
  
  v_remaining_principal := p_principal;
  v_due_date := CURRENT_DATE;
  
  -- Generate each installment
  WHILE v_installment_no <= p_term_months LOOP
    v_due_date := v_due_date + INTERVAL '1 month';
    
    -- Calculate interest for this period
    v_interest_amount := CEIL(v_remaining_principal * v_monthly_rate);
    
    -- Calculate principal portion
    IF v_installment_no = p_term_months THEN
      -- Last installment: pay off remaining balance
      v_principal_amount := v_remaining_principal;
      v_monthly_payment := v_principal_amount + v_interest_amount;
    ELSE
      v_principal_amount := v_monthly_payment - v_interest_amount;
    END IF;
    
    -- Insert the schedule
    INSERT INTO public.repayment_schedules (
      loan_id,
      installment_no,
      due_date,
      amount_due_minor,
      principal_minor,
      interest_minor
    ) VALUES (
      p_loan_id,
      v_installment_no,
      v_due_date,
      v_monthly_payment,
      v_principal_amount,
      v_interest_amount
    );
    
    -- Update remaining principal
    v_remaining_principal := v_remaining_principal - v_principal_amount;
    v_installment_no := v_installment_no + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to record a repayment
CREATE OR REPLACE FUNCTION public.record_repayment(
  p_schedule_id UUID,
  p_paid_at TIMESTAMPTZ,
  p_amount_minor BIGINT,
  p_method payment_method,
  p_reference TEXT DEFAULT NULL,
  p_evidence_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_loan_id UUID;
  v_lender_id UUID;
BEGIN
  -- Get loan details
  SELECT l.id, l.lender_id 
  INTO v_loan_id, v_lender_id
  FROM public.repayment_schedules rs
  JOIN public.loans l ON l.id = rs.loan_id
  WHERE rs.id = p_schedule_id;
  
  -- Check caller is the lender for this loan
  IF v_lender_id != jwt_uid() THEN
    RAISE EXCEPTION 'Only the lender can record repayments for their loans';
  END IF;
  
  -- Insert repayment event
  INSERT INTO public.repayment_events (
    schedule_id,
    paid_at,
    amount_paid_minor,
    method,
    reference_number,
    evidence_url,
    reported_by
  ) VALUES (
    p_schedule_id,
    p_paid_at,
    p_amount_minor,
    p_method,
    p_reference,
    p_evidence_url,
    jwt_uid()
  ) RETURNING id INTO v_event_id;
  
  -- Update lender reporting log
  UPDATE public.lender_reporting_logs
  SET reported_at = NOW(), status = 'on_time'
  WHERE schedule_id = p_schedule_id AND lender_id = v_lender_id;
  
  -- Check if loan is fully paid
  PERFORM check_loan_completion(v_loan_id);
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if loan is fully paid
CREATE OR REPLACE FUNCTION public.check_loan_completion(p_loan_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_due BIGINT;
  v_total_paid BIGINT;
BEGIN
  -- Calculate totals
  SELECT 
    SUM(rs.amount_due_minor),
    COALESCE(SUM(re.amount_paid_minor), 0)
  INTO v_total_due, v_total_paid
  FROM public.repayment_schedules rs
  LEFT JOIN public.repayment_events re ON re.schedule_id = rs.id
  WHERE rs.loan_id = p_loan_id;
  
  -- If fully paid, mark loan as completed
  IF v_total_paid >= v_total_due THEN
    UPDATE public.loans
    SET status = 'completed', completed_at = NOW()
    WHERE id = p_loan_id AND status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to list a borrower as risky (lender action)
CREATE OR REPLACE FUNCTION public.list_borrower_as_risky(
  p_borrower_id UUID,
  p_type risk_type,
  p_reason TEXT,
  p_amount_minor BIGINT,
  p_proof_hash TEXT
)
RETURNS UUID AS $$
DECLARE
  v_flag_id UUID;
  v_country TEXT;
BEGIN
  -- Check caller is lender
  IF jwt_role() != 'lender' THEN
    RAISE EXCEPTION 'Only lenders can list borrowers as risky';
  END IF;
  
  -- Get borrower country
  SELECT country_code INTO v_country 
  FROM public.borrowers 
  WHERE id = p_borrower_id;
  
  -- Check country match
  IF v_country != jwt_country() THEN
    RAISE EXCEPTION 'Cannot list borrower from different country';
  END IF;
  
  -- Require proof for manual listings
  IF p_proof_hash IS NULL OR LENGTH(p_proof_hash) != 64 THEN
    RAISE EXCEPTION 'Valid proof hash (SHA-256) required for manual risk listings';
  END IF;
  
  -- Create risk flag
  INSERT INTO public.risk_flags (
    borrower_id,
    country_code,
    origin,
    type,
    reason,
    amount_at_issue_minor,
    proof_sha256,
    created_by
  ) VALUES (
    p_borrower_id,
    v_country,
    'LENDER_REPORTED',
    p_type,
    p_reason,
    p_amount_minor,
    p_proof_hash,
    jwt_uid()
  ) RETURNING id INTO v_flag_id;
  
  -- Recalculate borrower score
  PERFORM calculate_borrower_score(p_borrower_id);
  
  -- Log the action
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target, target_id, country_code)
  VALUES (jwt_uid(), jwt_role(), 'list_risk', 'borrower', p_borrower_id, v_country);
  
  RETURN v_flag_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;