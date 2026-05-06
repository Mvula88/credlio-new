-- Two fixes that surfaced when the marketplace page first hit get_usage_status:
--
-- (A) get_usage_status had a CASE expression mixing integer and text
--     branches:
--       'limit', CASE WHEN v_tier = 'FREE' THEN 2 ELSE 'unlimited' END
--     Postgres infers the CASE result type from the first branch (integer),
--     then fails to cast 'unlimited' to integer, raising
--     'invalid input syntax for type integer: "unlimited"' at plan time.
--     The error has been latent in this function since
--     20260105040536_unique_borrower_search_limit.sql; my migration
--     20260505120000_exempt_own_borrowers_from_search_quota.sql carried it
--     forward unchanged. The marketplace checkAccess() call is the first
--     production code path that exercises it.
--
--     Fix: align CASE branches by casting the integer side to TEXT. JSON
--     consumers see "limit": "2" for FREE and "limit": "unlimited"
--     otherwise — the same shape the function was always *supposed* to
--     return.
--
-- (B) audit_trigger_func (set up by 20251205121527 and rewritten by
--     20260505130000_fix_audit_log_schema_drift.sql) extracts the row's
--     primary key as NEW.id / OLD.id. Five of the six audited tables have
--     an id column. The sixth, public.lenders, uses user_id as its PK —
--     so any INSERT/UPDATE/DELETE on lenders raises
--     'record "new" has no field "id"'.
--
--     Fix: pull the PK out of the to_jsonb(NEW)/to_jsonb(OLD) we already
--     compute, falling back from id to user_id. Works for every current
--     audited table without hardcoding table names.

-- (A) Rewrite get_usage_status with TEXT-cast limit field.
CREATE OR REPLACE FUNCTION public.get_usage_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
  v_month_year TEXT;
  v_usage public.lender_monthly_usage;
  v_limits public.plan_limits;
  v_unique_borrowers INTEGER;
  v_is_launch_period BOOLEAN := FALSE;
  v_launch_days_remaining INTEGER := 0;
  v_lender_country TEXT;
BEGIN
  v_month_year := TO_CHAR(NOW(), 'YYYY-MM');

  v_tier := public.get_effective_tier(p_user_id);

  INSERT INTO public.lender_monthly_usage (user_id, month_year)
  VALUES (p_user_id, v_month_year)
  ON CONFLICT (user_id, month_year) DO NOTHING;

  SELECT * INTO v_usage FROM public.lender_monthly_usage
  WHERE user_id = p_user_id AND month_year = v_month_year;

  SELECT * INTO v_limits FROM public.plan_limits WHERE tier = v_tier;

  SELECT COUNT(DISTINCT lsb.borrower_id) INTO v_unique_borrowers
  FROM public.lender_searched_borrowers lsb
  JOIN public.borrowers b ON b.id = lsb.borrower_id
  WHERE lsb.lender_user_id = p_user_id
    AND lsb.month_year = v_month_year
    AND (b.created_by_lender IS DISTINCT FROM p_user_id);

  SELECT country INTO v_lender_country FROM public.lenders WHERE user_id = p_user_id;
  IF v_lender_country IS NOT NULL THEN
    SELECT
      (c.launch_period_ends_at IS NOT NULL AND c.launch_period_ends_at > NOW()
       AND c.launch_paused_at IS NULL AND c.launch_ended_permanently IS NOT TRUE),
      GREATEST(0, EXTRACT(DAY FROM (c.launch_period_ends_at - NOW())))::INTEGER
    INTO v_is_launch_period, v_launch_days_remaining
    FROM public.countries c
    WHERE c.code = v_lender_country;
  END IF;

  RETURN jsonb_build_object(
    'tier', v_tier,
    'month', v_month_year,
    'is_launch_period', COALESCE(v_is_launch_period, FALSE),
    'launch_days_remaining', COALESCE(v_launch_days_remaining, 0),
    'cross_lender_borrower_views', jsonb_build_object(
      'used', v_unique_borrowers,
      -- Both branches return TEXT now (was: integer 2 vs text 'unlimited').
      'limit', CASE WHEN v_tier = 'FREE' THEN '2' ELSE 'unlimited' END,
      'remaining', CASE WHEN v_tier = 'FREE' THEN GREATEST(0, 2 - v_unique_borrowers)::TEXT ELSE 'unlimited' END,
      'note', 'Your own registered borrowers are unlimited and do not count.'
    ),
    'unique_borrowers_searched', jsonb_build_object(
      'used', v_unique_borrowers,
      'limit', CASE WHEN v_tier = 'FREE' THEN '2' ELSE 'unlimited' END,
      'remaining', CASE WHEN v_tier = 'FREE' THEN GREATEST(0, 2 - v_unique_borrowers)::TEXT ELSE 'unlimited' END
    ),
    'document_checks', jsonb_build_object(
      'used', v_usage.document_checks,
      'limit', CASE WHEN v_limits.document_checks = -1 THEN 'unlimited' ELSE v_limits.document_checks::TEXT END,
      'remaining', CASE WHEN v_limits.document_checks = -1 THEN 'unlimited' ELSE GREATEST(0, v_limits.document_checks - v_usage.document_checks)::TEXT END
    ),
    'marketplace_offers', jsonb_build_object(
      'used', v_usage.marketplace_offers,
      'limit', CASE WHEN v_limits.marketplace_offers = -1 THEN 'unlimited' ELSE v_limits.marketplace_offers::TEXT END,
      'remaining', CASE WHEN v_limits.marketplace_offers = -1 THEN 'unlimited' ELSE GREATEST(0, v_limits.marketplace_offers - v_usage.marketplace_offers)::TEXT END
    )
  );
END;
$$;

-- (B) Rewrite audit_trigger_func to pull the PK from the JSON payload, so
-- it works whether the table's PK is "id" or "user_id".
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_severity TEXT := 'info';
  v_target_id TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old_data := to_jsonb(OLD);
    v_severity := 'warning';
  END IF;

  -- PK extraction: prefer "id"; fall back to "user_id" for tables like
  -- public.lenders that key on user_id.
  IF TG_OP = 'DELETE' THEN
    v_target_id := COALESCE(v_old_data->>'id', v_old_data->>'user_id');
  ELSE
    v_target_id := COALESCE(v_new_data->>'id', v_new_data->>'user_id');
  END IF;

  PERFORM public.create_audit_log(
    p_action := v_action,
    p_action_category := TG_TABLE_NAME,
    p_target_type := TG_TABLE_NAME,
    p_target_id := v_target_id,
    p_old_data := v_old_data,
    p_new_data := v_new_data,
    p_severity := v_severity
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
