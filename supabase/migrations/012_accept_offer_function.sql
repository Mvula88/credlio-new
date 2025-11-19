-- Function to accept a loan offer with single active loan enforcement
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

  -- CRITICAL: Block if borrower already has an ACTIVE loan
  IF EXISTS (
    SELECT 1 FROM public.loans
    WHERE borrower_id = v_borrower_id 
    AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You already have an active loan. Please complete it before taking a new one.';
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

  -- Create the loan with the request's country & local currency
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
    'active',
    0,
    NOW()
  );

  -- Calculate monthly payment (simple interest for now)
  v_total_interest := (v_principal * v_apr_bps * v_term_months) / (10000 * 12);
  v_monthly_payment := (v_principal + v_total_interest + COALESCE(v_fees_minor, 0)) / v_term_months;

  -- Generate repayment schedule
  FOR i IN 1..v_term_months LOOP
    INSERT INTO public.repayment_schedules (
      loan_id,
      installment_no,
      due_date,
      amount_due_minor,
      amount_paid_minor,
      status,
      created_at
    ) VALUES (
      v_new_loan_id,
      i,
      CURRENT_DATE + make_interval(months => i),
      v_monthly_payment,
      0,
      'pending',
      NOW()
    );
  END LOOP;

  -- Close the request
  UPDATE public.loan_requests
    SET status = 'accepted',
        updated_at = NOW()
  WHERE id = v_request_id;

  -- Log the action
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    auth.uid(),
    'create',
    'loan',
    v_new_loan_id,
    jsonb_build_object(
      'offer_id', p_offer_id,
      'request_id', v_request_id,
      'principal', v_principal,
      'apr_bps', v_apr_bps,
      'term_months', v_term_months
    ),
    NOW()
  );

  RETURN v_new_loan_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.accept_offer(UUID) TO authenticated;

-- Drop existing function to avoid parameter name conflicts
DROP FUNCTION IF EXISTS public.register_borrower(TEXT, TEXT, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS public.register_borrower(TEXT, TEXT, TEXT, DATE);

-- Function to register a borrower (for lenders)
CREATE OR REPLACE FUNCTION public.register_borrower(
  p_full_name TEXT,
  p_national_id TEXT, -- Raw ID, will be hashed
  p_phone TEXT,
  p_date_of_birth DATE,
  p_country_code TEXT DEFAULT NULL
)
RETURNS UUID -- Returns borrower_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_id UUID;
  v_id_hash TEXT;
  v_country TEXT;
  v_phone_e164 TEXT;
BEGIN
  -- Verify caller is a lender
  IF jwt_role() != 'lender' THEN
    RAISE EXCEPTION 'Only lenders can register borrowers';
  END IF;

  -- Use provided country or JWT country
  v_country := COALESCE(p_country_code, jwt_country());

  -- Hash the national ID
  v_id_hash := hash_id(p_national_id);

  -- Format phone to E.164
  v_phone_e164 := p_phone; -- TODO: Add proper E.164 formatting

  -- Check if borrower already exists in this country
  SELECT id INTO v_borrower_id
  FROM public.borrowers
  WHERE country_code = v_country
    AND (national_id_hash = v_id_hash OR phone_e164 = v_phone_e164);

  IF v_borrower_id IS NOT NULL THEN
    -- Return existing borrower
    RETURN v_borrower_id;
  END IF;

  -- Create new borrower
  INSERT INTO public.borrowers (
    country_code,
    full_name,
    national_id_hash,
    phone_e164,
    date_of_birth,
    created_by_lender,
    created_at
  ) VALUES (
    v_country,
    p_full_name,
    v_id_hash,
    v_phone_e164,
    p_date_of_birth,
    auth.uid(),
    NOW()
  ) RETURNING id INTO v_borrower_id;

  -- Initialize borrower score
  INSERT INTO public.borrower_scores (
    borrower_id,
    score,
    updated_at
  ) VALUES (
    v_borrower_id,
    600, -- Default score
    NOW()
  );

  -- Add to identity index
  INSERT INTO public.borrower_identity_index (
    borrower_id,
    id_hash,
    phone_e164,
    date_of_birth
  ) VALUES (
    v_borrower_id,
    v_id_hash,
    v_phone_e164,
    p_date_of_birth
  );

  -- Log the action
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    auth.uid(),
    'create',
    'borrower',
    v_borrower_id,
    jsonb_build_object(
      'country', v_country,
      'id_hash', v_id_hash
    ),
    NOW()
  );

  RETURN v_borrower_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.register_borrower(TEXT, TEXT, TEXT, DATE, TEXT) TO authenticated;

-- Function to search borrowers
CREATE OR REPLACE FUNCTION public.search_borrower(
  p_national_id TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_purpose TEXT DEFAULT 'loan_assessment'
)
RETURNS TABLE (
  borrower_id UUID,
  full_name TEXT,
  phone_e164 TEXT,
  date_of_birth DATE,
  credit_score INT,
  active_loan BOOLEAN,
  risk_flags_count INT,
  listed_by_lenders INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_country TEXT;
  v_id_hash TEXT;
BEGIN
  -- Verify caller is a lender or admin
  IF jwt_role() NOT IN ('lender', 'admin') THEN
    RAISE EXCEPTION 'Only lenders and admins can search borrowers';
  END IF;

  -- Get country from JWT
  v_country := jwt_country();

  -- Hash ID if provided
  IF p_national_id IS NOT NULL THEN
    v_id_hash := hash_id(p_national_id);
  END IF;

  -- Log the search
  INSERT INTO public.search_logs (
    lender_id,
    country_code,
    query_type,
    query_hash,
    purpose,
    created_at
  ) VALUES (
    auth.uid(),
    v_country,
    CASE 
      WHEN p_national_id IS NOT NULL THEN 'id_hash'
      WHEN p_phone IS NOT NULL THEN 'phone'
      ELSE 'name'
    END,
    CASE 
      WHEN p_national_id IS NOT NULL THEN v_id_hash
      WHEN p_phone IS NOT NULL THEN hash_id(p_phone)
      ELSE hash_id(p_name)
    END,
    p_purpose,
    NOW()
  );

  -- Search based on provided criteria
  RETURN QUERY
  SELECT 
    b.id,
    b.full_name,
    b.phone_e164,
    b.date_of_birth,
    COALESCE(bs.score, 600) as credit_score,
    EXISTS(
      SELECT 1 FROM public.loans l 
      WHERE l.borrower_id = b.id AND l.status = 'active'
    ) as active_loan,
    (
      SELECT COUNT(*) FROM public.risk_flags rf 
      WHERE rf.borrower_id = b.id AND rf.resolved_at IS NULL
    )::INT as risk_flags_count,
    (
      SELECT COUNT(DISTINCT created_by) FROM public.risk_flags rf 
      WHERE rf.borrower_id = b.id 
        AND rf.origin = 'LENDER_REPORTED' 
        AND rf.resolved_at IS NULL
    )::INT as listed_by_lenders
  FROM public.borrowers b
  LEFT JOIN public.borrower_scores bs ON bs.borrower_id = b.id
  WHERE b.country_code = v_country
    AND (
      (v_id_hash IS NOT NULL AND b.national_id_hash = v_id_hash) OR
      (p_phone IS NOT NULL AND b.phone_e164 LIKE '%' || p_phone || '%') OR
      (p_name IS NOT NULL AND b.full_name ILIKE '%' || p_name || '%')
    )
  LIMIT 50;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.search_borrower(TEXT, TEXT, TEXT, TEXT) TO authenticated;