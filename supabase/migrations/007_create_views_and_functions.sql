-- Helper functions for JWT claims
CREATE OR REPLACE FUNCTION public.jwt_uid()
RETURNS UUID AS $$
  SELECT auth.uid()
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS app_role AS $$
  SELECT (auth.jwt() ->> 'app_role')::app_role
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.jwt_country()
RETURNS TEXT AS $$
  SELECT auth.jwt() ->> 'country_code'
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.jwt_tier()
RETURNS sub_tier AS $$
  SELECT COALESCE((auth.jwt() ->> 'tier')::sub_tier, 'PRO'::sub_tier)
$$ LANGUAGE SQL STABLE;

-- Borrower directory view (country-scoped)
CREATE OR REPLACE VIEW public.v_borrower_directory AS
SELECT 
  b.id as borrower_id,
  b.country_code,
  b.full_name,
  b.phone_e164,
  b.created_at,
  bs.score,
  -- Count open risk flags by origin
  COUNT(DISTINCT rf1.id) FILTER (WHERE rf1.origin = 'LENDER_REPORTED' AND rf1.resolved_at IS NULL) as lender_reported_open,
  COUNT(DISTINCT rf1.id) FILTER (WHERE rf1.origin = 'SYSTEM_AUTO' AND rf1.resolved_at IS NULL) as system_auto_open,
  COUNT(DISTINCT rf1.id) FILTER (WHERE rf1.resolved_at IS NULL) as total_listings_open,
  -- Count distinct lenders who have reported this borrower
  COUNT(DISTINCT rf1.created_by) FILTER (WHERE rf1.origin = 'LENDER_REPORTED' AND rf1.resolved_at IS NULL) as listed_by_n_lenders,
  -- Latest loan status
  (SELECT status FROM public.loans WHERE borrower_id = b.id ORDER BY created_at DESC LIMIT 1) as latest_loan_status,
  -- Total loans
  (SELECT COUNT(*) FROM public.loans WHERE borrower_id = b.id) as total_loans_count
FROM public.borrowers b
LEFT JOIN public.borrower_scores bs ON b.id = bs.borrower_id
LEFT JOIN public.risk_flags rf1 ON b.id = rf1.borrower_id
GROUP BY b.id, b.country_code, b.full_name, b.phone_e164, b.created_at, bs.score;

-- Function to hash national ID (client should use this same algorithm)
CREATE OR REPLACE FUNCTION public.hash_national_id(raw_id TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(digest(LOWER(TRIM(raw_id)), 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to register a new borrower (lender use)
CREATE OR REPLACE FUNCTION public.register_borrower(
  p_full_name TEXT,
  p_national_id TEXT, -- Raw ID, will be hashed
  p_phone_e164 TEXT,
  p_date_of_birth DATE,
  p_country_code TEXT
)
RETURNS UUID AS $$
DECLARE
  v_borrower_id UUID;
  v_id_hash TEXT;
  v_lender_id UUID;
BEGIN
  -- Check caller is a lender
  IF jwt_role() != 'lender' THEN
    RAISE EXCEPTION 'Only lenders can register borrowers';
  END IF;
  
  -- Check country matches
  IF p_country_code != jwt_country() THEN
    RAISE EXCEPTION 'Cannot register borrower in different country';
  END IF;
  
  -- Hash the national ID
  v_id_hash := hash_national_id(p_national_id);
  
  -- Get lender ID
  SELECT user_id INTO v_lender_id FROM public.lenders WHERE user_id = jwt_uid();
  
  -- Check if borrower already exists
  SELECT id INTO v_borrower_id 
  FROM public.borrowers 
  WHERE country_code = p_country_code 
    AND (national_id_hash = v_id_hash OR phone_e164 = p_phone_e164);
  
  IF v_borrower_id IS NOT NULL THEN
    RETURN v_borrower_id; -- Return existing borrower
  END IF;
  
  -- Create new borrower
  INSERT INTO public.borrowers (
    country_code,
    full_name,
    national_id_hash,
    phone_e164,
    date_of_birth,
    created_by_lender
  ) VALUES (
    p_country_code,
    p_full_name,
    v_id_hash,
    p_phone_e164,
    p_date_of_birth,
    v_lender_id
  ) RETURNING id INTO v_borrower_id;
  
  -- Create initial credit score
  INSERT INTO public.borrower_scores (borrower_id, score)
  VALUES (v_borrower_id, (SELECT default_credit_score FROM public.country_policies WHERE country_code = p_country_code));
  
  -- Create identity index entry
  INSERT INTO public.borrower_identity_index (borrower_id, id_hash, phone_e164, date_of_birth)
  VALUES (v_borrower_id, v_id_hash, p_phone_e164, p_date_of_birth);
  
  -- Log the registration
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target, target_id, country_code)
  VALUES (jwt_uid(), jwt_role(), 'create', 'borrower', v_borrower_id, p_country_code);
  
  RETURN v_borrower_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search borrowers
CREATE OR REPLACE FUNCTION public.search_borrowers(
  p_national_id TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  borrower_id UUID,
  full_name TEXT,
  phone_e164 TEXT,
  score INT,
  risk_level TEXT,
  listed_by_n_lenders BIGINT
) AS $$
DECLARE
  v_id_hash TEXT;
BEGIN
  -- Check caller is lender or admin
  IF jwt_role() NOT IN ('lender', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized to search borrowers';
  END IF;
  
  -- Log the search
  INSERT INTO public.search_logs (lender_id, query_type, query_params, purpose, country_code)
  VALUES (
    CASE WHEN jwt_role() = 'lender' THEN jwt_uid() ELSE NULL END,
    'borrower_search',
    jsonb_build_object('has_id', p_national_id IS NOT NULL, 'has_phone', p_phone IS NOT NULL, 'has_name', p_name IS NOT NULL),
    'loan_assessment',
    jwt_country()
  );
  
  -- If national ID provided, hash it
  IF p_national_id IS NOT NULL THEN
    v_id_hash := hash_national_id(p_national_id);
    
    -- Exact match on ID hash
    RETURN QUERY
    SELECT 
      v.borrower_id,
      v.full_name,
      v.phone_e164,
      v.score,
      CASE 
        WHEN v.total_listings_open > 0 THEN 'HIGH_RISK'
        WHEN v.score < 500 THEN 'MEDIUM_RISK'
        ELSE 'LOW_RISK'
      END as risk_level,
      v.listed_by_n_lenders
    FROM v_borrower_directory v
    JOIN public.borrowers b ON v.borrower_id = b.id
    WHERE b.country_code = jwt_country()
      AND b.national_id_hash = v_id_hash;
  ELSE
    -- Fuzzy search on phone/name
    RETURN QUERY
    SELECT 
      v.borrower_id,
      v.full_name,
      v.phone_e164,
      v.score,
      CASE 
        WHEN v.total_listings_open > 0 THEN 'HIGH_RISK'
        WHEN v.score < 500 THEN 'MEDIUM_RISK'
        ELSE 'LOW_RISK'
      END as risk_level,
      v.listed_by_n_lenders
    FROM v_borrower_directory v
    WHERE v.country_code = jwt_country()
      AND (
        (p_phone IS NOT NULL AND v.phone_e164 LIKE '%' || p_phone || '%')
        OR
        (p_name IS NOT NULL AND LOWER(v.full_name) LIKE '%' || LOWER(p_name) || '%')
      )
    LIMIT 50;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;