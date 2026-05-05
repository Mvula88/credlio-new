-- Exempt own borrowers from the cross-lender search quota
--
-- Background:
--   check_borrower_search_quota previously counted EVERY unique borrower a
--   lender viewed in a month against the FREE-tier limit of 2/month — even
--   borrowers the lender had registered themselves. This penalised lenders
--   for tracking their own loan book and didn't match the product's actual
--   value capture (cross-lender visibility is the paid feature).
--
-- Change:
--   Add an early-return: if the caller registered the borrower themselves
--   (borrowers.created_by_lender = p_user_id), allow unlimited views without
--   touching lender_searched_borrowers. Quota only applies to borrowers
--   registered by other lenders.
--
-- get_usage_status is also updated so the dashboard shows the same
-- own-vs-cross distinction.

CREATE OR REPLACE FUNCTION public.check_borrower_search_quota(
  p_user_id UUID,
  p_borrower_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
  v_month_year TEXT;
  v_unique_count INTEGER;
  v_already_searched BOOLEAN;
  v_limit INTEGER;
  v_is_own_borrower BOOLEAN;
BEGIN
  v_month_year := TO_CHAR(NOW(), 'YYYY-MM');

  SELECT public.get_effective_tier(p_user_id) INTO v_tier;

  -- Own-borrower fast path: lenders see their own registrations free, forever.
  -- This is the lender's private CRM — viewing it has zero cross-lender value
  -- so it shouldn't be metered.
  SELECT EXISTS (
    SELECT 1 FROM public.borrowers
    WHERE id = p_borrower_id
      AND created_by_lender = p_user_id
  ) INTO v_is_own_borrower;

  IF v_is_own_borrower THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'tier', v_tier,
      'own_borrower', true,
      'message', 'Your own borrower — unlimited tracking'
    );
  END IF;

  v_limit := CASE v_tier
    WHEN 'FREE' THEN 2
    ELSE 999999
  END;

  SELECT EXISTS(
    SELECT 1 FROM public.lender_searched_borrowers
    WHERE lender_user_id = p_user_id
      AND borrower_id = p_borrower_id
      AND month_year = v_month_year
  ) INTO v_already_searched;

  IF v_already_searched THEN
    UPDATE public.lender_searched_borrowers
    SET search_count = search_count + 1
    WHERE lender_user_id = p_user_id
      AND borrower_id = p_borrower_id
      AND month_year = v_month_year;

    RETURN jsonb_build_object(
      'allowed', true,
      'tier', v_tier,
      'already_searched', true,
      'message', 'Borrower already in your search history'
    );
  END IF;

  SELECT COUNT(DISTINCT borrower_id) INTO v_unique_count
  FROM public.lender_searched_borrowers
  WHERE lender_user_id = p_user_id
    AND month_year = v_month_year;

  IF v_unique_count >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'tier', v_tier,
      'unique_borrowers_searched', v_unique_count,
      'limit', v_limit,
      'remaining', 0,
      'upgrade_message', 'You have reached your limit of ' || v_limit || ' cross-lender borrower views this month. Upgrade to Pro for unlimited access to other lenders'' borrowers.'
    );
  END IF;

  INSERT INTO public.lender_searched_borrowers (lender_user_id, borrower_id, month_year)
  VALUES (p_user_id, p_borrower_id, v_month_year);

  RETURN jsonb_build_object(
    'allowed', true,
    'tier', v_tier,
    'unique_borrowers_searched', v_unique_count + 1,
    'limit', v_limit,
    'remaining', v_limit - v_unique_count - 1,
    'message', 'Search allowed. ' || (v_limit - v_unique_count - 1) || ' cross-lender views remaining this month.'
  );
END;
$$;

COMMENT ON FUNCTION public.check_borrower_search_quota IS
  'Check if lender can view a borrower. Own borrowers (created_by_lender = caller) are always free. Cross-lender views are limited to 2/month for FREE tier.';

-- Update get_usage_status to label the limit as cross-lender views.
-- Lenders looking at the dashboard should understand that viewing their own
-- borrowers does not count.
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

  -- Count cross-lender unique borrowers searched this month.
  -- (Own borrowers are not recorded in lender_searched_borrowers post-fix,
  -- but historical rows for a lender's own borrowers may still exist; exclude
  -- them explicitly so the displayed usage matches the new quota rules.)
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
      'limit', CASE WHEN v_tier = 'FREE' THEN 2 ELSE 'unlimited' END,
      'remaining', CASE WHEN v_tier = 'FREE' THEN GREATEST(0, 2 - v_unique_borrowers)::TEXT ELSE 'unlimited' END,
      'note', 'Your own registered borrowers are unlimited and do not count.'
    ),
    -- Backwards-compat alias so the old dashboard key keeps working until
    -- the frontend is updated.
    'unique_borrowers_searched', jsonb_build_object(
      'used', v_unique_borrowers,
      'limit', CASE WHEN v_tier = 'FREE' THEN 2 ELSE 'unlimited' END,
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
