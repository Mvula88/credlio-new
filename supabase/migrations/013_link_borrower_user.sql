-- Drop existing function to avoid parameter name conflicts
DROP FUNCTION IF EXISTS public.link_borrower_user(TEXT, TEXT, DATE);

-- Function to link a borrower user after onboarding
CREATE OR REPLACE FUNCTION public.link_borrower_user(
  p_national_id TEXT,
  p_phone TEXT,
  p_date_of_birth DATE
)
RETURNS UUID -- Returns borrower_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_id UUID;
  v_user_id UUID;
  v_id_hash TEXT;
  v_country TEXT;
  v_full_name TEXT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Get user's country and name from profile
  SELECT country_code, full_name 
  INTO v_country, v_full_name
  FROM public.profiles
  WHERE user_id = v_user_id;
  
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
  
  -- Hash the national ID
  v_id_hash := hash_id(p_national_id);
  
  -- Check if borrower already exists
  SELECT id INTO v_borrower_id
  FROM public.borrowers
  WHERE country_code = v_country
    AND (national_id_hash = v_id_hash OR phone_e164 = p_phone);
  
  IF v_borrower_id IS NULL THEN
    -- Create new borrower record
    INSERT INTO public.borrowers (
      country_code,
      full_name,
      national_id_hash,
      phone_e164,
      date_of_birth,
      created_at
    ) VALUES (
      v_country,
      v_full_name,
      v_id_hash,
      p_phone,
      p_date_of_birth,
      NOW()
    ) RETURNING id INTO v_borrower_id;
    
    -- Initialize borrower score
    INSERT INTO public.borrower_scores (
      borrower_id,
      score,
      updated_at
    ) VALUES (
      v_borrower_id,
      600,
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
      p_phone,
      p_date_of_birth
    );
  ELSE
    -- Update existing borrower with latest info
    UPDATE public.borrowers
    SET 
      full_name = v_full_name,
      phone_e164 = p_phone,
      date_of_birth = p_date_of_birth,
      updated_at = NOW()
    WHERE id = v_borrower_id;
  END IF;
  
  -- Link borrower to user account
  INSERT INTO public.borrower_user_links (
    borrower_id,
    user_id,
    linked_at
  ) VALUES (
    v_borrower_id,
    v_user_id,
    NOW()
  ) ON CONFLICT (user_id) DO UPDATE
    SET linked_at = NOW();
  
  -- Log the action
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    v_user_id,
    'create',
    'borrower_link',
    v_borrower_id,
    jsonb_build_object(
      'action', 'onboarding_complete',
      'id_hash', v_id_hash
    ),
    NOW()
  );
  
  RETURN v_borrower_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.link_borrower_user(TEXT, TEXT, DATE) TO authenticated;

-- Drop existing function to avoid parameter name conflicts
DROP FUNCTION IF EXISTS public.list_borrower_as_risky(UUID, risk_type, TEXT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.list_borrower_as_risky(UUID, risk_type, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.list_borrower_as_risky(UUID, risk_type, TEXT);

-- Function to list a borrower as risky
CREATE OR REPLACE FUNCTION public.list_borrower_as_risky(
  p_borrower_id UUID,
  p_risk_type risk_type,
  p_reason TEXT,
  p_amount_minor BIGINT DEFAULT NULL,
  p_proof_hash TEXT DEFAULT NULL
)
RETURNS UUID -- Returns risk_flag_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_risk_id UUID;
  v_lender_id UUID;
  v_country TEXT;
BEGIN
  -- Verify caller is a lender
  IF jwt_role() != 'lender' THEN
    RAISE EXCEPTION 'Only lenders can list borrowers as risky';
  END IF;
  
  v_lender_id := auth.uid();
  v_country := jwt_country();
  
  -- Verify borrower exists in the same country
  IF NOT EXISTS (
    SELECT 1 FROM public.borrowers 
    WHERE id = p_borrower_id AND country_code = v_country
  ) THEN
    RAISE EXCEPTION 'Borrower not found in your country';
  END IF;
  
  -- Require proof for manual listings
  IF p_proof_hash IS NULL OR length(p_proof_hash) < 64 THEN
    RAISE EXCEPTION 'Proof document hash is required for risk listings';
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
    created_by,
    created_at
  ) VALUES (
    p_borrower_id,
    v_country,
    'LENDER_REPORTED',
    p_risk_type,
    p_reason,
    p_amount_minor,
    p_proof_hash,
    v_lender_id,
    NOW()
  ) RETURNING id INTO v_risk_id;
  
  -- Recalculate borrower score
  PERFORM public.refresh_borrower_score(p_borrower_id);
  
  -- Log the action
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    v_lender_id,
    'list_risk',
    'borrower',
    p_borrower_id,
    jsonb_build_object(
      'risk_type', p_risk_type::TEXT,
      'reason', p_reason,
      'amount', p_amount_minor
    ),
    NOW()
  );
  
  RETURN v_risk_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.list_borrower_as_risky(UUID, risk_type, TEXT, BIGINT, TEXT) TO authenticated;

-- Drop existing function to avoid parameter name conflicts
DROP FUNCTION IF EXISTS public.resolve_risk_flag(UUID, TEXT);

-- Function to resolve a risk flag
CREATE OR REPLACE FUNCTION public.resolve_risk_flag(
  p_risk_id UUID,
  p_resolution_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_id UUID;
  v_resolver_id UUID;
BEGIN
  -- Verify caller is a lender or admin
  IF jwt_role() NOT IN ('lender', 'admin') THEN
    RAISE EXCEPTION 'Only lenders and admins can resolve risk flags';
  END IF;
  
  v_resolver_id := auth.uid();
  
  -- Get borrower_id from risk flag
  SELECT borrower_id INTO v_borrower_id
  FROM public.risk_flags
  WHERE id = p_risk_id;
  
  IF v_borrower_id IS NULL THEN
    RAISE EXCEPTION 'Risk flag not found';
  END IF;
  
  -- Update risk flag
  UPDATE public.risk_flags
  SET 
    resolved_at = NOW(),
    resolved_by = v_resolver_id,
    resolution_reason = p_resolution_reason,
    type = 'CLEARED'
  WHERE id = p_risk_id
    AND resolved_at IS NULL;
  
  -- Recalculate borrower score
  PERFORM public.refresh_borrower_score(v_borrower_id);
  
  -- Log the action
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    v_resolver_id,
    'resolve_risk',
    'risk_flag',
    p_risk_id,
    jsonb_build_object(
      'borrower_id', v_borrower_id,
      'resolution_reason', p_resolution_reason
    ),
    NOW()
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.resolve_risk_flag(UUID, TEXT) TO authenticated;