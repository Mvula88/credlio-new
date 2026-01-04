-- Freemium Usage Tracking System
-- Tracks monthly usage for cross-platform searches, document checks, and marketplace offers
--
-- Tier Limits:
-- FREE: 2 searches/month, 2 document checks/month, 0 marketplace offers
-- PRO ($9.99): unlimited searches, unlimited document checks, 1 marketplace offer/month
-- BUSINESS ($17.99): everything unlimited
-- LAUNCH PERIOD: everyone gets BUSINESS-level access

-- ============================================
-- 1. Create usage tracking table
-- ============================================
CREATE TABLE IF NOT EXISTS public.lender_monthly_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- Format: "2026-01"
  cross_platform_searches INTEGER DEFAULT 0,
  document_checks INTEGER DEFAULT 0,
  marketplace_offers INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month_year)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_lender_usage_user_month
ON public.lender_monthly_usage(user_id, month_year);

-- Enable RLS
ALTER TABLE public.lender_monthly_usage ENABLE ROW LEVEL SECURITY;

-- Users can only see their own usage
CREATE POLICY "Users can view own usage" ON public.lender_monthly_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Only system functions can insert/update (via SECURITY DEFINER)
CREATE POLICY "System can manage usage" ON public.lender_monthly_usage
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 2. Define plan limits as a lookup
-- ============================================
CREATE TABLE IF NOT EXISTS public.plan_limits (
  tier TEXT PRIMARY KEY,
  cross_platform_searches INTEGER NOT NULL, -- -1 = unlimited
  document_checks INTEGER NOT NULL,
  marketplace_offers INTEGER NOT NULL,
  max_borrowers INTEGER NOT NULL,
  max_active_loans INTEGER NOT NULL
);

-- Insert plan limits
INSERT INTO public.plan_limits (tier, cross_platform_searches, document_checks, marketplace_offers, max_borrowers, max_active_loans)
VALUES
  ('FREE', 2, 2, 0, -1, -1),      -- Free: 2 searches, 2 doc checks, no marketplace, unlimited own borrowers
  ('PRO', -1, -1, 1, -1, -1),     -- Pro: unlimited searches/docs, 1 marketplace offer/month
  ('BUSINESS', -1, -1, -1, -1, -1) -- Business: everything unlimited
ON CONFLICT (tier) DO UPDATE SET
  cross_platform_searches = EXCLUDED.cross_platform_searches,
  document_checks = EXCLUDED.document_checks,
  marketplace_offers = EXCLUDED.marketplace_offers,
  max_borrowers = EXCLUDED.max_borrowers,
  max_active_loans = EXCLUDED.max_active_loans;

-- ============================================
-- 3. Function to get effective tier (considers launch period)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_effective_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lender_country TEXT;
  v_launch_ends TIMESTAMPTZ;
  v_subscription_tier TEXT;
BEGIN
  -- Get lender's country
  SELECT country INTO v_lender_country
  FROM public.lenders
  WHERE user_id = p_user_id;

  IF v_lender_country IS NOT NULL THEN
    -- Check if country is in launch period
    SELECT launch_period_ends_at INTO v_launch_ends
    FROM public.countries
    WHERE code = v_lender_country;

    -- If launch period is active, grant BUSINESS access
    IF v_launch_ends IS NOT NULL AND v_launch_ends > NOW() THEN
      RETURN 'BUSINESS';
    END IF;
  END IF;

  -- Check subscription
  SELECT UPPER(tier) INTO v_subscription_tier
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Map old tier names to new ones
  IF v_subscription_tier = 'BASIC' THEN
    RETURN 'FREE';
  ELSIF v_subscription_tier = 'PRO_PLUS' THEN
    RETURN 'BUSINESS';
  ELSIF v_subscription_tier IN ('FREE', 'PRO', 'BUSINESS') THEN
    RETURN v_subscription_tier;
  END IF;

  -- Default to FREE
  RETURN 'FREE';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_tier(UUID) TO authenticated;

-- ============================================
-- 4. Function to get or create current month usage
-- ============================================
CREATE OR REPLACE FUNCTION public.get_or_create_usage(p_user_id UUID)
RETURNS public.lender_monthly_usage
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month_year TEXT;
  v_usage public.lender_monthly_usage;
BEGIN
  v_month_year := TO_CHAR(NOW(), 'YYYY-MM');

  -- Try to get existing record
  SELECT * INTO v_usage
  FROM public.lender_monthly_usage
  WHERE user_id = p_user_id AND month_year = v_month_year;

  -- Create if not exists
  IF v_usage IS NULL THEN
    INSERT INTO public.lender_monthly_usage (user_id, month_year)
    VALUES (p_user_id, v_month_year)
    RETURNING * INTO v_usage;
  END IF;

  RETURN v_usage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_usage(UUID) TO authenticated;

-- ============================================
-- 5. Function to check if action is allowed and increment usage
-- ============================================
CREATE OR REPLACE FUNCTION public.check_and_use_quota(
  p_user_id UUID,
  p_action TEXT -- 'cross_platform_search', 'document_check', 'marketplace_offer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
  v_limit INTEGER;
  v_used INTEGER;
  v_usage public.lender_monthly_usage;
  v_month_year TEXT;
BEGIN
  v_month_year := TO_CHAR(NOW(), 'YYYY-MM');

  -- Get effective tier
  v_tier := get_effective_tier(p_user_id);

  -- Get limit for this action and tier
  SELECT
    CASE p_action
      WHEN 'cross_platform_search' THEN cross_platform_searches
      WHEN 'document_check' THEN document_checks
      WHEN 'marketplace_offer' THEN marketplace_offers
      ELSE 0
    END INTO v_limit
  FROM public.plan_limits
  WHERE tier = v_tier;

  -- -1 means unlimited
  IF v_limit = -1 THEN
    -- Still track usage for analytics, but always allow
    v_usage := get_or_create_usage(p_user_id);

    -- Increment the appropriate counter
    IF p_action = 'cross_platform_search' THEN
      UPDATE public.lender_monthly_usage
      SET cross_platform_searches = cross_platform_searches + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND month_year = v_month_year;
    ELSIF p_action = 'document_check' THEN
      UPDATE public.lender_monthly_usage
      SET document_checks = document_checks + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND month_year = v_month_year;
    ELSIF p_action = 'marketplace_offer' THEN
      UPDATE public.lender_monthly_usage
      SET marketplace_offers = marketplace_offers + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND month_year = v_month_year;
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'tier', v_tier,
      'limit', 'unlimited',
      'used', 0,
      'remaining', 'unlimited'
    );
  END IF;

  -- Get current usage
  v_usage := get_or_create_usage(p_user_id);

  SELECT
    CASE p_action
      WHEN 'cross_platform_search' THEN v_usage.cross_platform_searches
      WHEN 'document_check' THEN v_usage.document_checks
      WHEN 'marketplace_offer' THEN v_usage.marketplace_offers
      ELSE 0
    END INTO v_used;

  -- Check if limit exceeded
  IF v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'tier', v_tier,
      'limit', v_limit,
      'used', v_used,
      'remaining', 0,
      'upgrade_message', CASE v_tier
        WHEN 'FREE' THEN 'Upgrade to Pro ($9.99/month) for unlimited access'
        WHEN 'PRO' THEN 'Upgrade to Business ($17.99/month) for unlimited marketplace offers'
        ELSE 'Limit reached'
      END
    );
  END IF;

  -- Increment usage
  IF p_action = 'cross_platform_search' THEN
    UPDATE public.lender_monthly_usage
    SET cross_platform_searches = cross_platform_searches + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND month_year = v_month_year;
  ELSIF p_action = 'document_check' THEN
    UPDATE public.lender_monthly_usage
    SET document_checks = document_checks + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND month_year = v_month_year;
  ELSIF p_action = 'marketplace_offer' THEN
    UPDATE public.lender_monthly_usage
    SET marketplace_offers = marketplace_offers + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND month_year = v_month_year;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'tier', v_tier,
    'limit', v_limit,
    'used', v_used + 1,
    'remaining', v_limit - v_used - 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_use_quota(UUID, TEXT) TO authenticated;

-- ============================================
-- 6. Function to get current usage status (for UI display)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_usage_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
  v_usage public.lender_monthly_usage;
  v_limits public.plan_limits;
  v_launch_days INTEGER;
  v_lender_country TEXT;
BEGIN
  v_tier := get_effective_tier(p_user_id);
  v_usage := get_or_create_usage(p_user_id);

  SELECT * INTO v_limits FROM public.plan_limits WHERE tier = v_tier;

  -- Get launch days remaining if applicable
  SELECT country INTO v_lender_country FROM public.lenders WHERE user_id = p_user_id;
  IF v_lender_country IS NOT NULL THEN
    v_launch_days := get_launch_days_remaining(v_lender_country);
  ELSE
    v_launch_days := 0;
  END IF;

  RETURN jsonb_build_object(
    'tier', v_tier,
    'is_launch_period', v_launch_days > 0,
    'launch_days_remaining', v_launch_days,
    'cross_platform_searches', jsonb_build_object(
      'used', v_usage.cross_platform_searches,
      'limit', CASE WHEN v_limits.cross_platform_searches = -1 THEN 'unlimited' ELSE v_limits.cross_platform_searches::TEXT END,
      'remaining', CASE WHEN v_limits.cross_platform_searches = -1 THEN 'unlimited' ELSE GREATEST(0, v_limits.cross_platform_searches - v_usage.cross_platform_searches)::TEXT END
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

GRANT EXECUTE ON FUNCTION public.get_usage_status(UUID) TO authenticated;

-- ============================================
-- 7. Update has_pro_access to use new tier system
-- ============================================
CREATE OR REPLACE FUNCTION public.has_pro_access(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  v_tier := get_effective_tier(p_user_id);
  RETURN v_tier IN ('PRO', 'BUSINESS');
END;
$$;

-- ============================================
-- 8. Function to check if user has business access
-- ============================================
CREATE OR REPLACE FUNCTION public.has_business_access(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  v_tier := get_effective_tier(p_user_id);
  RETURN v_tier = 'BUSINESS';
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_business_access(UUID) TO authenticated;

-- ============================================
-- 9. Comments for documentation
-- ============================================
COMMENT ON TABLE public.lender_monthly_usage IS 'Tracks monthly usage of limited features per lender';
COMMENT ON TABLE public.plan_limits IS 'Defines limits for each subscription tier';
COMMENT ON FUNCTION public.get_effective_tier IS 'Get user tier considering launch period (returns BUSINESS during launch)';
COMMENT ON FUNCTION public.check_and_use_quota IS 'Check if action allowed and increment usage. Returns allowed status and remaining quota.';
COMMENT ON FUNCTION public.get_usage_status IS 'Get full usage status for UI display';
