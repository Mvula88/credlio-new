-- Fix register_borrower function to check lenders table instead of JWT role
-- This is more reliable since JWT claims may not always be set correctly

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
  v_lender_record RECORD;
  v_tier TEXT;
  v_borrower_count INT;
BEGIN
  -- Get the current user ID
  v_lender_id := auth.uid();
  IF v_lender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is a lender by checking the lenders table (more reliable than JWT)
  SELECT user_id, country_code
  INTO v_lender_record
  FROM public.lenders
  WHERE user_id = v_lender_id;

  IF v_lender_record IS NULL THEN
    RAISE EXCEPTION 'Only lenders can register borrowers';
  END IF;

  -- Use provided country or lender's country
  v_country := COALESCE(p_country_code, v_lender_record.country_code);

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Country code is required';
  END IF;

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

-- Add comment
COMMENT ON FUNCTION public.register_borrower IS 'Allows lenders to register borrowers. Validates lender via lenders table (not JWT). Enforces country isolation and freemium limits.';
