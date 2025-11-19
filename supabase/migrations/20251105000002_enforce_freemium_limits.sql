-- Enforce freemium limits for lenders
-- Free tier: 5 borrowers max
-- Paid tiers: Unlimited

-- Update register_borrower function to check subscription limits
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
  v_tier TEXT;
  v_borrower_count INT;
BEGIN
  -- Verify caller is a lender
  IF jwt_role() != 'lender' THEN
    RAISE EXCEPTION 'Only lenders can register borrowers';
  END IF;

  -- Get lender ID
  v_lender_id := auth.uid();

  -- Use provided country or JWT country
  v_country := COALESCE(p_country_code, jwt_country());

  -- Check subscription tier and enforce limits
  SELECT COALESCE(s.tier, 'BASIC') INTO v_tier
  FROM subscriptions s
  WHERE s.user_id = v_lender_id
    AND s.status = 'active'
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

  -- Check if borrower already exists (by ID hash or phone)
  SELECT id INTO v_borrower_id
  FROM borrowers
  WHERE country_code = v_country
    AND (national_id_hash = v_id_hash OR phone_e164 = v_phone_e164);

  IF v_borrower_id IS NOT NULL THEN
    -- Borrower exists, just update invited_by if needed
    UPDATE borrowers
    SET invited_by_lender = COALESCE(invited_by_lender, v_lender_id),
        updated_at = NOW()
    WHERE id = v_borrower_id;

    RETURN v_borrower_id;
  END IF;

  -- Create new borrower
  INSERT INTO borrowers (
    country_code,
    full_name,
    national_id_hash,
    phone_e164,
    date_of_birth,
    created_by_lender,
    invited_by_lender,
    created_at,
    updated_at
  ) VALUES (
    v_country,
    p_full_name,
    v_id_hash,
    v_phone_e164,
    p_date_of_birth,
    v_lender_id,
    v_lender_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_borrower_id;

  -- Initialize borrower score
  INSERT INTO borrower_scores (
    borrower_id,
    score,
    payment_history_months,
    total_loans,
    defaults_count,
    updated_at
  ) VALUES (
    v_borrower_id,
    600, -- Default starting score
    0,
    0,
    0,
    NOW()
  );

  -- Add to identity index
  INSERT INTO borrower_identity_index (
    borrower_id,
    id_hash,
    phone_e164,
    country_code
  ) VALUES (
    v_borrower_id,
    v_id_hash,
    v_phone_e164,
    v_country
  );

  -- Log the action
  INSERT INTO audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    v_lender_id,
    'create',
    'borrower',
    v_borrower_id,
    jsonb_build_object(
      'full_name', p_full_name,
      'country', v_country,
      'tier', v_tier
    ),
    NOW()
  );

  RETURN v_borrower_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.register_borrower(TEXT, TEXT, TEXT, DATE, TEXT) TO authenticated;
