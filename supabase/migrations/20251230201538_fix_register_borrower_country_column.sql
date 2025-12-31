-- Fix register_borrower function - lenders table uses 'country' not 'country_code'

CREATE OR REPLACE FUNCTION public.register_borrower(
  p_full_name TEXT,
  p_national_id TEXT,
  p_phone TEXT,
  p_date_of_birth DATE,
  p_country_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_id UUID;
  v_id_hash TEXT;
  v_country TEXT;
  v_phone_e164 TEXT;
  v_lender_id UUID;
  v_lender_country TEXT;
  v_tier TEXT;
  v_borrower_count INT;
BEGIN
  -- Get the current user ID
  v_lender_id := auth.uid();
  IF v_lender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is a lender and get their country
  -- Note: lenders table uses 'country' column, not 'country_code'
  SELECT country
  INTO v_lender_country
  FROM public.lenders
  WHERE user_id = v_lender_id;

  IF v_lender_country IS NULL THEN
    -- Check if lender exists but has no country
    IF EXISTS (SELECT 1 FROM public.lenders WHERE user_id = v_lender_id) THEN
      RAISE EXCEPTION 'Lender country not set. Please complete your profile.';
    ELSE
      RAISE EXCEPTION 'Only lenders can register borrowers';
    END IF;
  END IF;

  -- Use provided country or lender's country
  v_country := COALESCE(p_country_code, v_lender_country);

  -- Check subscription tier and enforce limits
  SELECT COALESCE(s.tier, 'BASIC') INTO v_tier
  FROM subscriptions s
  WHERE s.user_id = v_lender_id
    AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no active subscription found, default to BASIC (free)
  v_tier := COALESCE(v_tier, 'BASIC');

  -- Enforce 5-borrower limit for free tier
  IF v_tier = 'BASIC' THEN
    SELECT COUNT(*) INTO v_borrower_count
    FROM borrowers
    WHERE created_by_lender = v_lender_id;

    IF v_borrower_count >= 5 THEN
      RAISE EXCEPTION 'Free plan limit reached. You can only register 5 borrowers on the free plan. Upgrade to LENDER ACCESS (N$260/month) for unlimited borrowers.';
    END IF;
  END IF;

  -- Hash the national ID
  v_id_hash := hash_id(p_national_id);

  -- Format phone to E.164
  v_phone_e164 := p_phone;

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
    v_lender_id,
    NOW()
  )
  RETURNING id INTO v_borrower_id;

  -- Initialize credit score
  INSERT INTO public.borrower_scores (borrower_id, score)
  VALUES (v_borrower_id, 500);

  RETURN v_borrower_id;
END;
$$;

-- Also fix flag_borrower function - uses 'country' not 'country_code' for lenders
CREATE OR REPLACE FUNCTION public.flag_borrower(
  p_borrower_id UUID,
  p_type TEXT,
  p_reason TEXT,
  p_amount_at_issue_minor INTEGER DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL,
  p_proof_sha256 TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_lender_country TEXT;
  v_borrower_record RECORD;
  v_flag_id UUID;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if user is a lender and get their country
  -- Note: lenders table uses 'country' column, not 'country_code'
  SELECT country
  INTO v_lender_country
  FROM public.lenders
  WHERE user_id = v_user_id;

  IF v_lender_country IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.lenders WHERE user_id = v_user_id) THEN
      RETURN json_build_object('success', false, 'error', 'Lender country not set. Please complete your profile.');
    ELSE
      RETURN json_build_object('success', false, 'error', 'Only lenders can flag borrowers');
    END IF;
  END IF;

  -- Get borrower and their country
  SELECT id, country_code
  INTO v_borrower_record
  FROM public.borrowers
  WHERE id = p_borrower_id;

  IF v_borrower_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Borrower not found');
  END IF;

  -- COUNTRY ISOLATION: Lender can only flag borrowers in their own country
  IF v_borrower_record.country_code IS NULL OR v_borrower_record.country_code != v_lender_country THEN
    RETURN json_build_object('success', false, 'error', 'You can only flag borrowers in your country');
  END IF;

  -- Validate type
  IF p_type NOT IN ('LATE_1_7', 'LATE_8_30', 'LATE_31_60', 'DEFAULT', 'CLEARED') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid risk type');
  END IF;

  -- Insert the risk flag using the BORROWER's country (for proper country isolation)
  INSERT INTO public.risk_flags (
    borrower_id,
    country_code,
    origin,
    type,
    reason,
    amount_at_issue_minor,
    proof_url,
    proof_sha256,
    created_by
  ) VALUES (
    p_borrower_id,
    v_borrower_record.country_code,
    'LENDER_REPORTED',
    p_type,
    p_reason,
    p_amount_at_issue_minor,
    p_proof_url,
    p_proof_sha256,
    v_user_id
  )
  RETURNING id INTO v_flag_id;

  RETURN json_build_object(
    'success', true,
    'flag_id', v_flag_id,
    'message', 'Borrower flagged successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.flag_borrower TO authenticated;
