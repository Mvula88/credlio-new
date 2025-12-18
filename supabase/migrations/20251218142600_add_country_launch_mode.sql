-- Add launch mode per country
-- During launch period, all lenders in that country get full Pro access
-- After launch_period_ends_at, normal subscription logic applies

-- Add launch period column to countries table
ALTER TABLE public.countries
ADD COLUMN IF NOT EXISTS launch_period_ends_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_launched BOOLEAN DEFAULT FALSE;

-- Comment explaining the columns
COMMENT ON COLUMN public.countries.launch_period_ends_at IS 'When set, all lenders in this country get free Pro access until this date';
COMMENT ON COLUMN public.countries.is_launched IS 'Whether the platform has officially launched in this country';

-- Function to check if a lender has Pro access (either via subscription or launch period)
CREATE OR REPLACE FUNCTION public.has_pro_access(p_user_id UUID)
RETURNS BOOLEAN
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

  IF v_lender_country IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if country is in launch period
  SELECT launch_period_ends_at INTO v_launch_ends
  FROM public.countries
  WHERE code = v_lender_country;

  -- If launch period is active, grant Pro access
  IF v_launch_ends IS NOT NULL AND v_launch_ends > NOW() THEN
    RETURN TRUE;
  END IF;

  -- Otherwise check subscription
  SELECT tier INTO v_subscription_tier
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status = 'active';

  RETURN v_subscription_tier IN ('pro', 'pro_plus');
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.has_pro_access(UUID) TO authenticated;

-- Function to get days remaining in launch period for a country
CREATE OR REPLACE FUNCTION public.get_launch_days_remaining(p_country_code TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_launch_ends TIMESTAMPTZ;
BEGIN
  SELECT launch_period_ends_at INTO v_launch_ends
  FROM public.countries
  WHERE code = p_country_code;

  IF v_launch_ends IS NULL OR v_launch_ends <= NOW() THEN
    RETURN 0;
  END IF;

  RETURN EXTRACT(DAY FROM (v_launch_ends - NOW()))::INTEGER;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_launch_days_remaining(TEXT) TO authenticated;

-- Admin function to set launch period for a country
CREATE OR REPLACE FUNCTION public.set_country_launch_period(
  p_country_code TEXT,
  p_days INTEGER DEFAULT 14
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.countries
  SET
    launch_period_ends_at = NOW() + (p_days || ' days')::INTERVAL,
    is_launched = TRUE
  WHERE code = p_country_code;

  RETURN FOUND;
END;
$$;

-- Grant execute to authenticated (will be restricted by RLS for admin only)
GRANT EXECUTE ON FUNCTION public.set_country_launch_period(TEXT, INTEGER) TO authenticated;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_countries_launch_period
ON public.countries(launch_period_ends_at)
WHERE launch_period_ends_at IS NOT NULL;

COMMENT ON FUNCTION public.has_pro_access IS 'Check if user has Pro access via subscription OR launch period';
COMMENT ON FUNCTION public.get_launch_days_remaining IS 'Get remaining days in launch period for a country';
COMMENT ON FUNCTION public.set_country_launch_period IS 'Admin: Set launch period for a country (default 14 days)';
