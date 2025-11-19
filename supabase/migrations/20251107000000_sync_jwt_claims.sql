-- Sync JWT Claims from profiles table
-- This ensures that app_role, country_code, and tier are available in the JWT token
-- for RLS policies that use jwt_role(), jwt_country(), and jwt_tier()

-- Create function to sync claims to auth.users app_metadata
CREATE OR REPLACE FUNCTION public.sync_user_jwt_claims()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  -- Get the user's subscription tier
  SELECT tier::TEXT INTO v_tier
  FROM public.subscriptions
  WHERE user_id = NEW.user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no subscription found, default to BASIC
  IF v_tier IS NULL THEN
    v_tier := 'BASIC';
  END IF;

  -- Update auth.users app_metadata with claims needed for RLS
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
    'app_role', NEW.app_role::TEXT,
    'country_code', NEW.country_code,
    'tier', v_tier
  )
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Create trigger on profiles table to sync claims on INSERT and UPDATE
DROP TRIGGER IF EXISTS sync_jwt_claims_on_profile_change ON public.profiles;

CREATE TRIGGER sync_jwt_claims_on_profile_change
  AFTER INSERT OR UPDATE OF app_role, country_code
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_jwt_claims();

-- Create function to sync tier changes from subscriptions
CREATE OR REPLACE FUNCTION public.sync_subscription_tier_to_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app_role TEXT;
  v_country_code TEXT;
BEGIN
  -- Get the user's app_role and country_code from profiles
  SELECT app_role::TEXT, country_code INTO v_app_role, v_country_code
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  -- Update auth.users app_metadata with tier
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
    'app_role', COALESCE(v_app_role, 'lender'),
    'country_code', COALESCE(v_country_code, 'US'),
    'tier', NEW.tier::TEXT
  )
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Create trigger on subscriptions table
DROP TRIGGER IF EXISTS sync_tier_on_subscription_change ON public.subscriptions;

CREATE TRIGGER sync_tier_on_subscription_change
  AFTER INSERT OR UPDATE OF tier
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_subscription_tier_to_jwt();

-- Backfill existing users' JWT claims
DO $$
DECLARE
  profile_record RECORD;
  v_tier TEXT;
BEGIN
  FOR profile_record IN
    SELECT p.user_id, p.app_role::TEXT as app_role, p.country_code
    FROM public.profiles p
  LOOP
    -- Get tier from subscriptions
    SELECT s.tier::TEXT INTO v_tier
    FROM public.subscriptions s
    WHERE s.user_id = profile_record.user_id
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- Default to BASIC if no subscription
    IF v_tier IS NULL THEN
      v_tier := 'BASIC';
    END IF;

    -- Update auth.users with claims
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
      'app_role', profile_record.app_role,
      'country_code', profile_record.country_code,
      'tier', v_tier
    )
    WHERE id = profile_record.user_id;
  END LOOP;

  RAISE NOTICE 'Backfilled JWT claims for existing users';
END $$;
