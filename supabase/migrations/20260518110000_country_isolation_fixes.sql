-- Country isolation enforcement on cross-lender RPCs.
--
-- WHY: the past week's work added several SECURITY DEFINER functions
-- (get_borrower_unpaid_summary, get_borrower_inflight_loans,
-- accept_loan_offer, check_duplicate_borrower) plus the perceptual-hash
-- triggers. SECURITY DEFINER bypasses RLS, so each function must
-- manually enforce country isolation — and none of them did. This
-- migration adds the missing checks.
--
-- Asymmetric model for duplicate detection:
--   - SAME-COUNTRY matches: handled as duplicates the way they always
--     were (cross_borrower_match_borrower_id is set, risk_score 90,
--     visible to lenders in that country). This is the borrowers'-own-
--     country fraud detection lenders rely on.
--   - CROSS-COUNTRY matches: written to a new admin-only table
--     `cross_country_dedup_alerts`. The lenders never see this. Only
--     admins can act on it (call both borrowers, decide who's real).
--     This preserves country isolation at the lender layer while still
--     catching the cross-border fraudster pattern Smile ID would
--     normally catch.

BEGIN;

-- =========================================================================
-- 1. Cross-country dedup alerts table (admin-only visibility)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.cross_country_dedup_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('selfie_phash', 'document_phash', 'national_id_hash', 'phone_e164', 'name_dob')),
  borrower_a_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  borrower_a_country_code TEXT NOT NULL,
  borrower_b_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  borrower_b_country_code TEXT NOT NULL,
  fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed_legit', 'reviewed_fraud', 'dismissed')),
  admin_notes TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  CONSTRAINT pair_is_canonical CHECK (borrower_a_id < borrower_b_id),
  UNIQUE(alert_type, borrower_a_id, borrower_b_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_cc_alerts_status ON public.cross_country_dedup_alerts(status);
CREATE INDEX IF NOT EXISTS idx_cc_alerts_borrower_a ON public.cross_country_dedup_alerts(borrower_a_id);
CREATE INDEX IF NOT EXISTS idx_cc_alerts_borrower_b ON public.cross_country_dedup_alerts(borrower_b_id);
CREATE INDEX IF NOT EXISTS idx_cc_alerts_type ON public.cross_country_dedup_alerts(alert_type);

ALTER TABLE public.cross_country_dedup_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cross-country alerts"
  ON public.cross_country_dedup_alerts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role manages cross-country alerts"
  ON public.cross_country_dedup_alerts FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.cross_country_dedup_alerts IS
  'Cross-country fingerprint matches (same selfie / same ID hash / same phone across two country accounts). Admin-only visibility — lenders never see these, preserving country isolation. Replaces what Smile ID government registry lookup would otherwise catch.';

-- =========================================================================
-- 2. Helper: write a cross-country alert idempotently, in canonical order
-- =========================================================================
CREATE OR REPLACE FUNCTION public.log_cross_country_alert(
  p_alert_type TEXT,
  p_borrower_a UUID,
  p_country_a TEXT,
  p_borrower_b UUID,
  p_country_b TEXT,
  p_fingerprint TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first UUID;
  v_second UUID;
  v_first_country TEXT;
  v_second_country TEXT;
BEGIN
  IF p_borrower_a < p_borrower_b THEN
    v_first := p_borrower_a;  v_first_country := p_country_a;
    v_second := p_borrower_b; v_second_country := p_country_b;
  ELSE
    v_first := p_borrower_b;  v_first_country := p_country_b;
    v_second := p_borrower_a; v_second_country := p_country_a;
  END IF;

  INSERT INTO public.cross_country_dedup_alerts (
    alert_type, borrower_a_id, borrower_a_country_code,
    borrower_b_id, borrower_b_country_code, fingerprint
  ) VALUES (
    p_alert_type, v_first, v_first_country,
    v_second, v_second_country, p_fingerprint
  )
  ON CONFLICT (alert_type, borrower_a_id, borrower_b_id, fingerprint) DO NOTHING;
END;
$$;

-- =========================================================================
-- 3. Rewrite perceptual-hash triggers to be country-aware
-- =========================================================================
CREATE OR REPLACE FUNCTION public.detect_cross_borrower_selfie_match()
RETURNS TRIGGER AS $$
DECLARE
  v_match RECORD;
  v_my_country TEXT;
BEGIN
  IF NEW.perceptual_hash IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT country_code INTO v_my_country
  FROM public.borrowers WHERE id = NEW.borrower_id;

  -- Find any other borrower with the same pHash AND grab their country.
  SELECT bd.borrower_id, b.country_code
  INTO v_match
  FROM public.borrower_documents bd
  JOIN public.borrowers b ON b.id = bd.borrower_id
  WHERE bd.perceptual_hash = NEW.perceptual_hash
    AND bd.borrower_id <> NEW.borrower_id
  ORDER BY bd.uploaded_at ASC
  LIMIT 1;

  IF v_match.borrower_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_match.country_code = v_my_country THEN
    -- SAME-COUNTRY duplicate: visible to lenders in that country.
    NEW.cross_borrower_match_borrower_id := v_match.borrower_id;
    NEW.risk_score := GREATEST(COALESCE(NEW.risk_score, 0), 90);
    NEW.risk_factors := COALESCE(NEW.risk_factors, ARRAY[]::TEXT[])
      || ARRAY['Same image fingerprint as another borrower'];

    UPDATE public.borrower_documents
    SET cross_borrower_match_borrower_id = NEW.borrower_id,
        risk_score = GREATEST(COALESCE(risk_score, 0), 90),
        risk_factors = COALESCE(risk_factors, ARRAY[]::TEXT[])
          || ARRAY['Same image fingerprint as another borrower'],
        updated_at = NOW()
    WHERE borrower_id = v_match.borrower_id
      AND perceptual_hash = NEW.perceptual_hash
      AND cross_borrower_match_borrower_id IS NULL;
  ELSE
    -- CROSS-COUNTRY match: admin-only alert, no lender-visible flag set.
    PERFORM public.log_cross_country_alert(
      'selfie_phash', NEW.borrower_id, v_my_country,
      v_match.borrower_id, v_match.country_code, NEW.perceptual_hash
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.detect_cross_borrower_doc_match()
RETURNS TRIGGER AS $$
DECLARE
  v_match RECORD;
  v_my_country TEXT;
BEGIN
  IF NEW.perceptual_hash IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT country_code INTO v_my_country
  FROM public.borrowers WHERE id = NEW.borrower_id;

  SELECT dv.borrower_id, b.country_code
  INTO v_match
  FROM public.document_verifications dv
  JOIN public.borrowers b ON b.id = dv.borrower_id
  WHERE dv.perceptual_hash = NEW.perceptual_hash
    AND dv.borrower_id <> NEW.borrower_id
  ORDER BY dv.created_at ASC
  LIMIT 1;

  IF v_match.borrower_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_match.country_code = v_my_country THEN
    NEW.cross_borrower_match_borrower_id := v_match.borrower_id;
    NEW.risk_score := GREATEST(COALESCE(NEW.risk_score, 0), 90);
    NEW.risk_level := 'high';
    NEW.risk_factors := COALESCE(NEW.risk_factors, ARRAY[]::TEXT[])
      || ARRAY['Same document fingerprint as another borrower'];
    NEW.status := 'flagged';

    UPDATE public.document_verifications
    SET cross_borrower_match_borrower_id = NEW.borrower_id,
        risk_score = GREATEST(COALESCE(risk_score, 0), 90),
        risk_level = 'high',
        risk_factors = COALESCE(risk_factors, ARRAY[]::TEXT[])
          || ARRAY['Same document fingerprint as another borrower'],
        status = 'flagged',
        updated_at = NOW()
    WHERE borrower_id = v_match.borrower_id
      AND perceptual_hash = NEW.perceptual_hash
      AND cross_borrower_match_borrower_id IS NULL;
  ELSE
    PERFORM public.log_cross_country_alert(
      'document_phash', NEW.borrower_id, v_my_country,
      v_match.borrower_id, v_match.country_code, NEW.perceptual_hash
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 4. Country check in get_borrower_unpaid_summary
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_borrower_unpaid_summary(p_borrower_id UUID)
RETURNS TABLE (
  borrower_id UUID,
  earliest_unpaid_due_date DATE,
  days_since_earliest_unpaid INT,
  unpaid_installment_count BIGINT,
  total_unpaid_minor BIGINT,
  currency TEXT,
  affected_loan_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_country TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller's country from JWT. Admins (no jwt_country) see across countries
  -- because their JWT has no country_code claim — they're not lender-scoped.
  SELECT jwt_country() INTO v_caller_country;

  RETURN QUERY
  WITH unpaid AS (
    SELECT
      l.borrower_id,
      l.currency,
      l.id as loan_id,
      rs.due_date,
      rs.amount_due_minor,
      COALESCE(rs.paid_amount_minor, 0) as paid_minor,
      GREATEST(rs.amount_due_minor - COALESCE(rs.paid_amount_minor, 0), 0) as outstanding_minor
    FROM public.loans l
    JOIN public.repayment_schedules rs ON rs.loan_id = l.id
    WHERE l.borrower_id = p_borrower_id
      AND l.status = 'active'
      AND rs.status IN ('pending', 'overdue', 'partial')
      AND rs.due_date <= CURRENT_DATE
      AND rs.amount_due_minor > COALESCE(rs.paid_amount_minor, 0)
      -- Country isolation: if caller has a country claim, restrict to it.
      AND (v_caller_country IS NULL OR l.country_code = v_caller_country)
  )
  SELECT
    p_borrower_id,
    MIN(due_date),
    (CURRENT_DATE - MIN(due_date))::INT,
    COUNT(*),
    COALESCE(SUM(outstanding_minor), 0)::BIGINT,
    (SELECT u.currency FROM unpaid u ORDER BY u.due_date ASC LIMIT 1),
    COUNT(DISTINCT loan_id)
  FROM unpaid
  HAVING COUNT(*) > 0;
END;
$$;

-- =========================================================================
-- 5. Country check in get_borrower_inflight_loans
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_borrower_inflight_loans(p_borrower_id UUID)
RETURNS TABLE (
  loan_id UUID,
  lender_id UUID,
  lender_name TEXT,
  status TEXT,
  principal_minor BIGINT,
  currency TEXT,
  country_code TEXT,
  borrower_accepted_at TIMESTAMPTZ,
  hours_since_accept NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_country TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jwt_country() INTO v_caller_country;

  RETURN QUERY
  SELECT
    l.id,
    l.lender_id,
    COALESCE(lp.business_name, pp.full_name, 'Lender')::TEXT,
    l.status::TEXT,
    l.principal_minor,
    l.currency,
    l.country_code,
    l.borrower_accepted_at,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(l.borrower_accepted_at, l.created_at))) / 3600,
    l.created_at
  FROM public.loans l
  LEFT JOIN public.lenders lp ON lp.user_id = l.lender_id
  LEFT JOIN public.profiles pp ON pp.user_id = l.lender_id
  WHERE l.borrower_id = p_borrower_id
    AND l.status IN ('pending_signatures', 'pending_disbursement')
    AND (v_caller_country IS NULL OR l.country_code = v_caller_country)
  ORDER BY COALESCE(l.borrower_accepted_at, l.created_at) DESC;
END;
$$;

-- =========================================================================
-- 6. Country check in accept_loan_offer
-- =========================================================================
DROP FUNCTION IF EXISTS public.accept_loan_offer(UUID);
DROP FUNCTION IF EXISTS public.accept_loan_offer(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.accept_loan_offer(
  p_loan_id UUID,
  p_acknowledged_inflight BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_current_user_id UUID;
  v_caller_country TEXT;
  v_recent_accept RECORD;
  v_hours_since_recent NUMERIC;
  v_inflight_count INT;
  v_inflight_snapshot JSONB;
BEGIN
  v_current_user_id := auth.uid();
  v_caller_country := jwt_country();

  SELECT l.*, b.id as b_id, b.full_name as borrower_name, b.country_code as borrower_country
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON l.borrower_id = b.id
  WHERE l.id = p_loan_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Loan not found');
  END IF;

  IF v_loan.status != 'pending_offer' THEN
    RETURN json_build_object('success', false, 'error', 'This loan is not awaiting acceptance');
  END IF;

  -- Country isolation: the loan's country must match the caller's country.
  -- The caller is the borrower (verified below). If their JWT country
  -- doesn't match the loan's country, something is off.
  IF v_caller_country IS NOT NULL AND v_loan.country_code <> v_caller_country THEN
    RETURN json_build_object('success', false, 'error', 'This loan is in a different country than your account');
  END IF;

  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id AND user_id = v_current_user_id;

  IF v_borrower_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not authorized to accept this loan');
  END IF;

  -- 48h cooling-off (in-country only — cooling-off applies to loans the
  -- borrower has accepted from any lender on the platform within their
  -- country; cross-country loans are invisible by design).
  SELECT l2.id, l2.borrower_accepted_at, l2.status, l2.lender_id
  INTO v_recent_accept
  FROM public.loans l2
  WHERE l2.borrower_id = v_loan.borrower_id
    AND l2.id <> p_loan_id
    AND l2.borrower_accepted_at IS NOT NULL
    AND l2.borrower_accepted_at > NOW() - INTERVAL '48 hours'
    AND l2.status IN ('pending_signatures', 'pending_disbursement')
    AND l2.country_code = v_loan.country_code
  ORDER BY l2.borrower_accepted_at DESC
  LIMIT 1;

  IF v_recent_accept.id IS NOT NULL THEN
    v_hours_since_recent := EXTRACT(EPOCH FROM (NOW() - v_recent_accept.borrower_accepted_at)) / 3600;
    RETURN json_build_object(
      'success', false,
      'error', FORMAT(
        'You accepted another loan offer %s hours ago, and it has not yet been disbursed. To prevent accidentally taking on more debt than you can manage, you must wait %s hours before accepting another loan.',
        ROUND(v_hours_since_recent, 1)::TEXT,
        CEIL(48 - v_hours_since_recent)::TEXT
      ),
      'cooling_off_hours_remaining', CEIL(48 - v_hours_since_recent),
      'blocking_loan_id', v_recent_accept.id
    );
  END IF;

  -- Build the in-flight snapshot using the (now country-isolated) RPC.
  SELECT
    COUNT(*),
    jsonb_agg(jsonb_build_object(
      'loan_id', loan_id,
      'lender_id', lender_id,
      'lender_name', lender_name,
      'status', status,
      'principal_minor', principal_minor,
      'currency', currency,
      'borrower_accepted_at', borrower_accepted_at
    ))
  INTO v_inflight_count, v_inflight_snapshot
  FROM public.get_borrower_inflight_loans(v_loan.borrower_id)
  WHERE loan_id <> p_loan_id;

  IF v_inflight_count > 0 AND NOT p_acknowledged_inflight THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You have other loans in progress. You must acknowledge them before accepting this offer.',
      'requires_acknowledgment', true,
      'inflight_loans', v_inflight_snapshot
    );
  END IF;

  UPDATE public.loans
  SET
    status = 'pending_signatures',
    borrower_accepted_at = NOW(),
    borrower_acknowledged_inflight_at = CASE
      WHEN v_inflight_count > 0 THEN NOW()
      ELSE NULL
    END,
    borrower_acknowledged_inflight_snapshot = CASE
      WHEN v_inflight_count > 0 THEN v_inflight_snapshot
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_loan_id;

  PERFORM public.generate_loan_agreement(p_loan_id);

  RETURN json_build_object(
    'success', true,
    'message', 'Loan offer accepted. Please sign the agreement to activate the loan.',
    'next_step', 'sign_agreement',
    'acknowledged_inflight_count', v_inflight_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_loan_offer(UUID, BOOLEAN) TO authenticated;

-- =========================================================================
-- 7. Country-aware check_duplicate_borrower
--    Same-country = duplicate (auto-ban path); cross-country = admin alert.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.check_duplicate_borrower(
  p_borrower_id UUID,
  p_national_id_hash TEXT,
  p_phone_e164 TEXT,
  p_full_name TEXT,
  p_date_of_birth DATE
)
RETURNS TABLE (
  is_duplicate BOOLEAN,
  duplicate_borrower_id UUID,
  confidence INT,
  reasons TEXT[]
) AS $$
DECLARE
  v_name_normalized TEXT;
  v_dob_key TEXT;
  v_my_country TEXT;
  v_match_country TEXT;
  v_match_id UUID;
  v_confidence INT := 0;
  v_reasons TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT country_code INTO v_my_country
  FROM public.borrowers WHERE id = p_borrower_id;

  v_name_normalized := LOWER(REGEXP_REPLACE(p_full_name, '\s+', '', 'g'));
  v_dob_key := p_date_of_birth::TEXT;

  -- Same national ID hash. If matched borrower is in same country = duplicate.
  -- If different country = NOT a duplicate (same ID number can exist in two
  -- countries — different people), but log a cross-country alert.
  FOR v_match_id, v_match_country IN
    SELECT dbd.borrower_id, b.country_code
    FROM public.duplicate_borrower_detection dbd
    JOIN public.borrowers b ON b.id = dbd.borrower_id
    WHERE dbd.national_id_hash = p_national_id_hash
      AND dbd.borrower_id <> p_borrower_id
  LOOP
    IF v_match_country = v_my_country THEN
      RETURN QUERY SELECT true, v_match_id, 100, ARRAY['Same National ID in this country']::TEXT[];
      RETURN;
    ELSE
      PERFORM public.log_cross_country_alert(
        'national_id_hash', p_borrower_id, v_my_country,
        v_match_id, v_match_country, p_national_id_hash
      );
    END IF;
  END LOOP;

  -- Same phone (E.164 is globally unique — most likely a real duplicate).
  FOR v_match_id, v_match_country IN
    SELECT dbd.borrower_id, b.country_code
    FROM public.duplicate_borrower_detection dbd
    JOIN public.borrowers b ON b.id = dbd.borrower_id
    WHERE dbd.phone_e164 = p_phone_e164
      AND dbd.borrower_id <> p_borrower_id
  LOOP
    IF v_match_country = v_my_country THEN
      IF v_match_id IS NOT NULL THEN
        v_confidence := 80;
        v_reasons := v_reasons || 'Same phone number';
        EXIT;
      END IF;
    ELSE
      PERFORM public.log_cross_country_alert(
        'phone_e164', p_borrower_id, v_my_country,
        v_match_id, v_match_country, p_phone_e164
      );
    END IF;
  END LOOP;

  -- Same name + DOB in same country.
  IF v_confidence = 0 THEN
    FOR v_match_id, v_match_country IN
      SELECT dbd.borrower_id, b.country_code
      FROM public.duplicate_borrower_detection dbd
      JOIN public.borrowers b ON b.id = dbd.borrower_id
      WHERE dbd.name_normalized = v_name_normalized
        AND dbd.dob_key = v_dob_key
        AND dbd.borrower_id <> p_borrower_id
    LOOP
      IF v_match_country = v_my_country THEN
        v_confidence := 60;
        v_reasons := v_reasons || 'Same name and date of birth';
        EXIT;
      ELSE
        PERFORM public.log_cross_country_alert(
          'name_dob', p_borrower_id, v_my_country,
          v_match_id, v_match_country, v_name_normalized || '|' || v_dob_key
        );
      END IF;
    END LOOP;
  END IF;

  IF v_confidence >= 60 THEN
    RETURN QUERY SELECT true, v_match_id, v_confidence, v_reasons;
  ELSE
    RETURN QUERY SELECT false, NULL::UUID, 0, ARRAY[]::TEXT[];
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.check_duplicate_borrower IS
  'Detects duplicate borrower accounts. Same-country matches are returned as duplicates (auto-ban path). Cross-country matches are logged to cross_country_dedup_alerts for admin review and NOT treated as duplicates (same ID number in two countries is two different people).';

COMMIT;
