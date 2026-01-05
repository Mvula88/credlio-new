-- Unique Borrower Search Limit
-- FREE users can search maximum 2 unique borrowers per month
-- They can search the same borrower multiple times without using quota

-- ============================================
-- 1. Create table to track unique borrowers searched
-- ============================================
CREATE TABLE IF NOT EXISTS public.lender_searched_borrowers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- Format: '2026-01'
  first_searched_at TIMESTAMPTZ DEFAULT NOW(),
  search_count INTEGER DEFAULT 1,
  UNIQUE(lender_user_id, borrower_id, month_year)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lender_searched_borrowers_lender_month
ON public.lender_searched_borrowers(lender_user_id, month_year);

CREATE INDEX IF NOT EXISTS idx_lender_searched_borrowers_borrower
ON public.lender_searched_borrowers(borrower_id);

-- Enable RLS
ALTER TABLE public.lender_searched_borrowers ENABLE ROW LEVEL SECURITY;

-- Lenders can only see their own searches
CREATE POLICY "Lenders can view own searches" ON public.lender_searched_borrowers
  FOR SELECT USING (lender_user_id = auth.uid());

-- ============================================
-- 2. Function to check and record borrower search
-- ============================================
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
BEGIN
  -- Get current month
  v_month_year := TO_CHAR(NOW(), 'YYYY-MM');

  -- Get user's effective tier
  SELECT public.get_effective_tier(p_user_id) INTO v_tier;

  -- Set limit based on tier
  v_limit := CASE v_tier
    WHEN 'FREE' THEN 2
    ELSE 999999  -- Unlimited for PRO and BUSINESS
  END;

  -- Check if this borrower was already searched this month
  SELECT EXISTS(
    SELECT 1 FROM public.lender_searched_borrowers
    WHERE lender_user_id = p_user_id
      AND borrower_id = p_borrower_id
      AND month_year = v_month_year
  ) INTO v_already_searched;

  -- If already searched, allow and just increment count
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

  -- Count unique borrowers searched this month
  SELECT COUNT(DISTINCT borrower_id) INTO v_unique_count
  FROM public.lender_searched_borrowers
  WHERE lender_user_id = p_user_id
    AND month_year = v_month_year;

  -- Check if limit reached
  IF v_unique_count >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'tier', v_tier,
      'unique_borrowers_searched', v_unique_count,
      'limit', v_limit,
      'remaining', 0,
      'upgrade_message', 'You have reached your limit of ' || v_limit || ' borrowers this month. Upgrade to Pro ($9.99/month) for unlimited borrower searches.'
    );
  END IF;

  -- Add this borrower to searched list
  INSERT INTO public.lender_searched_borrowers (lender_user_id, borrower_id, month_year)
  VALUES (p_user_id, p_borrower_id, v_month_year);

  RETURN jsonb_build_object(
    'allowed', true,
    'tier', v_tier,
    'unique_borrowers_searched', v_unique_count + 1,
    'limit', v_limit,
    'remaining', v_limit - v_unique_count - 1,
    'message', 'Search allowed. ' || (v_limit - v_unique_count - 1) || ' new borrower searches remaining this month.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_borrower_search_quota(UUID, UUID) TO authenticated;

-- ============================================
-- 3. Function to get lender's searched borrowers this month
-- ============================================
CREATE OR REPLACE FUNCTION public.get_searched_borrowers_this_month(p_user_id UUID)
RETURNS TABLE (
  borrower_id UUID,
  borrower_name TEXT,
  first_searched_at TIMESTAMPTZ,
  search_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month_year TEXT;
BEGIN
  v_month_year := TO_CHAR(NOW(), 'YYYY-MM');

  RETURN QUERY
  SELECT
    lsb.borrower_id,
    b.full_name as borrower_name,
    lsb.first_searched_at,
    lsb.search_count
  FROM public.lender_searched_borrowers lsb
  JOIN public.borrowers b ON b.id = lsb.borrower_id
  WHERE lsb.lender_user_id = p_user_id
    AND lsb.month_year = v_month_year
  ORDER BY lsb.first_searched_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_searched_borrowers_this_month(UUID) TO authenticated;

-- ============================================
-- 4. Update usage status to show unique borrowers
-- ============================================
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

  -- Get effective tier
  v_tier := public.get_effective_tier(p_user_id);

  -- Get or create usage record
  INSERT INTO public.lender_monthly_usage (user_id, month_year)
  VALUES (p_user_id, v_month_year)
  ON CONFLICT (user_id, month_year) DO NOTHING;

  SELECT * INTO v_usage FROM public.lender_monthly_usage
  WHERE user_id = p_user_id AND month_year = v_month_year;

  -- Get plan limits
  SELECT * INTO v_limits FROM public.plan_limits WHERE tier = v_tier;

  -- Count unique borrowers searched this month
  SELECT COUNT(DISTINCT borrower_id) INTO v_unique_borrowers
  FROM public.lender_searched_borrowers
  WHERE lender_user_id = p_user_id
    AND month_year = v_month_year;

  -- Check if in launch period
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

-- ============================================
-- 5. Comments
-- ============================================
COMMENT ON TABLE public.lender_searched_borrowers IS 'Tracks unique borrowers searched by each lender per month for quota enforcement';
COMMENT ON FUNCTION public.check_borrower_search_quota IS 'Check if lender can search a borrower (2 unique borrowers/month for FREE tier)';
COMMENT ON FUNCTION public.get_searched_borrowers_this_month IS 'Get list of borrowers searched by lender this month';
