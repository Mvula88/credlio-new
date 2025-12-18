-- Remove trial mode - platform uses freemium model instead
-- Users get freemium by default, can upgrade to Pro/Pro Plus via subscription
-- Launch period gives free Pro access per country (separate feature)

-- Drop the trial index first
DROP INDEX IF EXISTS idx_lenders_trial;

-- Remove trial columns from lenders table
ALTER TABLE public.lenders
DROP COLUMN IF EXISTS trial_mode,
DROP COLUMN IF EXISTS trial_ends_at;

-- Update any functions that reference trial_mode
-- The activate_lender_account function may reference trial_mode
CREATE OR REPLACE FUNCTION public.activate_lender_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Account is activated when ID is verified
  IF NEW.id_verified = TRUE AND (OLD.id_verified IS NULL OR OLD.id_verified = FALSE) THEN
    NEW.account_active := TRUE;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.lenders IS 'Lenders use freemium model: free basic features, paid Pro/Pro Plus subscriptions. Launch period per country gives temporary free Pro access.';
