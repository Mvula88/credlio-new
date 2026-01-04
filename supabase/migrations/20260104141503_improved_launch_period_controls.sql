-- Improved Launch Period Controls
-- Allows admin to: Launch, Pause, Resume, Relaunch, End Permanently

-- ============================================
-- 1. Add new columns for launch state tracking
-- ============================================
DO $$
BEGIN
  -- Track when launch was paused (to calculate remaining days)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'countries' AND column_name = 'launch_paused_at'
  ) THEN
    ALTER TABLE public.countries
    ADD COLUMN launch_paused_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  -- Track remaining days when paused
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'countries' AND column_name = 'launch_days_remaining_when_paused'
  ) THEN
    ALTER TABLE public.countries
    ADD COLUMN launch_days_remaining_when_paused INTEGER DEFAULT NULL;
  END IF;

  -- Track if launch was ended permanently (success - no more free access ever)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'countries' AND column_name = 'launch_ended_permanently'
  ) THEN
    ALTER TABLE public.countries
    ADD COLUMN launch_ended_permanently BOOLEAN DEFAULT FALSE;
  END IF;

  -- Track launch history count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'countries' AND column_name = 'launch_count'
  ) THEN
    ALTER TABLE public.countries
    ADD COLUMN launch_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Comments
COMMENT ON COLUMN public.countries.launch_paused_at IS 'When launch was paused (NULL = not paused)';
COMMENT ON COLUMN public.countries.launch_days_remaining_when_paused IS 'Days remaining when launch was paused';
COMMENT ON COLUMN public.countries.launch_ended_permanently IS 'If TRUE, launch period is permanently ended (success)';
COMMENT ON COLUMN public.countries.launch_count IS 'Number of times country has been launched';

-- ============================================
-- 2. Function to START/LAUNCH a country (14 days)
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_launch_country(p_country_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_country RECORD;
BEGIN
  v_admin_id := auth.uid();

  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can launch countries';
  END IF;

  -- Get country
  SELECT * INTO v_country FROM public.countries WHERE code = p_country_code;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Country not found: %', p_country_code;
  END IF;

  -- Check if permanently ended
  IF v_country.launch_ended_permanently THEN
    RAISE EXCEPTION 'Launch period has been permanently ended for this country';
  END IF;

  -- Set launch period to 14 days from now
  UPDATE public.countries
  SET
    launch_period_ends_at = NOW() + INTERVAL '14 days',
    is_launched = TRUE,
    launch_paused_at = NULL,
    launch_days_remaining_when_paused = NULL,
    launch_count = COALESCE(launch_count, 0) + 1
  WHERE code = p_country_code;

  -- Log to audit
  INSERT INTO public.audit_ledger (actor_id, action, target_type, target_id, payload, created_at)
  VALUES (v_admin_id, 'country_launch', 'country', p_country_code::UUID,
    jsonb_build_object('action', 'launch', 'days', 14), NOW());

  RETURN jsonb_build_object(
    'success', true,
    'action', 'launched',
    'ends_at', NOW() + INTERVAL '14 days',
    'days_remaining', 14
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_launch_country(TEXT) TO authenticated;

-- ============================================
-- 3. Function to PAUSE launch (freeze countdown)
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_pause_launch(p_country_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_country RECORD;
  v_days_remaining INTEGER;
BEGIN
  v_admin_id := auth.uid();

  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can pause launches';
  END IF;

  -- Get country
  SELECT * INTO v_country FROM public.countries WHERE code = p_country_code;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Country not found';
  END IF;

  -- Check if already paused
  IF v_country.launch_paused_at IS NOT NULL THEN
    RAISE EXCEPTION 'Launch is already paused';
  END IF;

  -- Check if launch is active
  IF v_country.launch_period_ends_at IS NULL OR v_country.launch_period_ends_at <= NOW() THEN
    RAISE EXCEPTION 'No active launch to pause';
  END IF;

  -- Calculate remaining days
  v_days_remaining := GREATEST(0, EXTRACT(DAY FROM (v_country.launch_period_ends_at - NOW()))::INTEGER);

  -- Pause the launch
  UPDATE public.countries
  SET
    launch_paused_at = NOW(),
    launch_days_remaining_when_paused = v_days_remaining,
    launch_period_ends_at = NULL  -- Clear end date while paused
  WHERE code = p_country_code;

  -- Log to audit
  INSERT INTO public.audit_ledger (actor_id, action, target_type, target_id, payload, created_at)
  VALUES (v_admin_id, 'country_launch_pause', 'country', p_country_code::UUID,
    jsonb_build_object('action', 'pause', 'days_remaining', v_days_remaining), NOW());

  RETURN jsonb_build_object(
    'success', true,
    'action', 'paused',
    'days_remaining_frozen', v_days_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_pause_launch(TEXT) TO authenticated;

-- ============================================
-- 4. Function to RESUME launch (continue countdown)
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_resume_launch(p_country_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_country RECORD;
  v_new_end_date TIMESTAMPTZ;
BEGIN
  v_admin_id := auth.uid();

  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can resume launches';
  END IF;

  -- Get country
  SELECT * INTO v_country FROM public.countries WHERE code = p_country_code;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Country not found';
  END IF;

  -- Check if paused
  IF v_country.launch_paused_at IS NULL THEN
    RAISE EXCEPTION 'Launch is not paused';
  END IF;

  -- Calculate new end date based on frozen days
  v_new_end_date := NOW() + (COALESCE(v_country.launch_days_remaining_when_paused, 0) || ' days')::INTERVAL;

  -- Resume the launch
  UPDATE public.countries
  SET
    launch_period_ends_at = v_new_end_date,
    launch_paused_at = NULL,
    launch_days_remaining_when_paused = NULL
  WHERE code = p_country_code;

  -- Log to audit
  INSERT INTO public.audit_ledger (actor_id, action, target_type, target_id, payload, created_at)
  VALUES (v_admin_id, 'country_launch_resume', 'country', p_country_code::UUID,
    jsonb_build_object('action', 'resume', 'new_end_date', v_new_end_date), NOW());

  RETURN jsonb_build_object(
    'success', true,
    'action', 'resumed',
    'ends_at', v_new_end_date,
    'days_remaining', v_country.launch_days_remaining_when_paused
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resume_launch(TEXT) TO authenticated;

-- ============================================
-- 5. Function to RELAUNCH (restart from day 1)
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_relaunch_country(p_country_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_country RECORD;
BEGIN
  v_admin_id := auth.uid();

  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can relaunch countries';
  END IF;

  -- Get country
  SELECT * INTO v_country FROM public.countries WHERE code = p_country_code;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Country not found';
  END IF;

  -- Check if permanently ended
  IF v_country.launch_ended_permanently THEN
    RAISE EXCEPTION 'Launch period has been permanently ended for this country';
  END IF;

  -- Relaunch - restart from day 1
  UPDATE public.countries
  SET
    launch_period_ends_at = NOW() + INTERVAL '14 days',
    is_launched = TRUE,
    launch_paused_at = NULL,
    launch_days_remaining_when_paused = NULL,
    launch_count = COALESCE(launch_count, 0) + 1
  WHERE code = p_country_code;

  -- Log to audit
  INSERT INTO public.audit_ledger (actor_id, action, target_type, target_id, payload, created_at)
  VALUES (v_admin_id, 'country_relaunch', 'country', p_country_code::UUID,
    jsonb_build_object('action', 'relaunch', 'days', 14, 'launch_count', v_country.launch_count + 1), NOW());

  RETURN jsonb_build_object(
    'success', true,
    'action', 'relaunched',
    'ends_at', NOW() + INTERVAL '14 days',
    'days_remaining', 14,
    'launch_count', COALESCE(v_country.launch_count, 0) + 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_relaunch_country(TEXT) TO authenticated;

-- ============================================
-- 6. Function to END LAUNCH PERMANENTLY (success)
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_end_launch_permanently(p_country_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_country RECORD;
BEGIN
  v_admin_id := auth.uid();

  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can end launches permanently';
  END IF;

  -- Get country
  SELECT * INTO v_country FROM public.countries WHERE code = p_country_code;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Country not found';
  END IF;

  -- End launch permanently
  UPDATE public.countries
  SET
    launch_period_ends_at = NULL,
    is_launched = TRUE,  -- Keep as launched (officially launched)
    launch_paused_at = NULL,
    launch_days_remaining_when_paused = NULL,
    launch_ended_permanently = TRUE
  WHERE code = p_country_code;

  -- Log to audit
  INSERT INTO public.audit_ledger (actor_id, action, target_type, target_id, payload, created_at)
  VALUES (v_admin_id, 'country_launch_end_permanent', 'country', p_country_code::UUID,
    jsonb_build_object('action', 'end_permanently', 'total_launches', v_country.launch_count), NOW());

  RETURN jsonb_build_object(
    'success', true,
    'action', 'ended_permanently',
    'message', 'Launch period has been permanently ended. Free access is no longer available.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_end_launch_permanently(TEXT) TO authenticated;

-- ============================================
-- 7. Update get_launch_days_remaining to handle paused state
-- ============================================
CREATE OR REPLACE FUNCTION public.get_launch_days_remaining(p_country_code TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_country RECORD;
BEGIN
  SELECT * INTO v_country FROM public.countries WHERE code = p_country_code;

  -- If permanently ended, return 0
  IF v_country.launch_ended_permanently THEN
    RETURN 0;
  END IF;

  -- If paused, return frozen days
  IF v_country.launch_paused_at IS NOT NULL THEN
    RETURN COALESCE(v_country.launch_days_remaining_when_paused, 0);
  END IF;

  -- If no active launch
  IF v_country.launch_period_ends_at IS NULL OR v_country.launch_period_ends_at <= NOW() THEN
    RETURN 0;
  END IF;

  RETURN GREATEST(0, EXTRACT(DAY FROM (v_country.launch_period_ends_at - NOW()))::INTEGER);
END;
$$;

-- ============================================
-- 8. Function to get launch status for UI
-- ============================================
CREATE OR REPLACE FUNCTION public.get_country_launch_status(p_country_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_country RECORD;
  v_days_remaining INTEGER;
  v_status TEXT;
BEGIN
  SELECT * INTO v_country FROM public.countries WHERE code = p_country_code;

  IF v_country IS NULL THEN
    RETURN jsonb_build_object('error', 'Country not found');
  END IF;

  -- Determine status
  IF v_country.launch_ended_permanently THEN
    v_status := 'ended_permanently';
    v_days_remaining := 0;
  ELSIF v_country.launch_paused_at IS NOT NULL THEN
    v_status := 'paused';
    v_days_remaining := COALESCE(v_country.launch_days_remaining_when_paused, 0);
  ELSIF v_country.launch_period_ends_at IS NOT NULL AND v_country.launch_period_ends_at > NOW() THEN
    v_status := 'active';
    v_days_remaining := GREATEST(0, EXTRACT(DAY FROM (v_country.launch_period_ends_at - NOW()))::INTEGER);
  ELSIF v_country.is_launched THEN
    v_status := 'expired';
    v_days_remaining := 0;
  ELSE
    v_status := 'not_launched';
    v_days_remaining := 0;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'is_launched', v_country.is_launched,
    'days_remaining', v_days_remaining,
    'ends_at', v_country.launch_period_ends_at,
    'paused_at', v_country.launch_paused_at,
    'ended_permanently', v_country.launch_ended_permanently,
    'launch_count', COALESCE(v_country.launch_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_country_launch_status(TEXT) TO authenticated;

-- ============================================
-- 9. Update get_effective_tier to handle paused state
-- ============================================
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

-- ============================================
-- 10. Comments
-- ============================================
COMMENT ON FUNCTION public.admin_launch_country IS 'Start 14-day launch period for a country';
COMMENT ON FUNCTION public.admin_pause_launch IS 'Pause launch countdown (freeze days remaining)';
COMMENT ON FUNCTION public.admin_resume_launch IS 'Resume paused launch (continue countdown)';
COMMENT ON FUNCTION public.admin_relaunch_country IS 'Restart launch from day 1 (14 days)';
COMMENT ON FUNCTION public.admin_end_launch_permanently IS 'Permanently end launch period (success - no more free access)';
COMMENT ON FUNCTION public.get_country_launch_status IS 'Get detailed launch status for UI';
