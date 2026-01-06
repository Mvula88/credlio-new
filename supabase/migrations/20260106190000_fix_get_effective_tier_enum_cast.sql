-- Fix get_effective_tier to properly cast enum to text before UPPER()
-- Error: "function upper(sub_tier) does not exist"

CREATE OR REPLACE FUNCTION public.get_effective_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lender_country TEXT;
  v_country RECORD;
  v_subscription_tier TEXT;
BEGIN
  -- Get lender's country
  SELECT country INTO v_lender_country
  FROM public.lenders
  WHERE user_id = p_user_id;

  IF v_lender_country IS NOT NULL THEN
    -- Get country launch status
    SELECT * INTO v_country
    FROM public.countries
    WHERE code = v_lender_country;

    -- Check if in active (not paused, not ended) launch period
    IF v_country.launch_ended_permanently IS NOT TRUE
       AND v_country.launch_paused_at IS NULL
       AND v_country.launch_period_ends_at IS NOT NULL
       AND v_country.launch_period_ends_at > NOW() THEN
      RETURN 'BUSINESS';
    END IF;
  END IF;

  -- Check subscription (cast enum to text before UPPER)
  SELECT UPPER(tier::TEXT) INTO v_subscription_tier
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

COMMENT ON FUNCTION public.get_effective_tier IS 'Get effective subscription tier for a user, considering launch period and subscription status';
