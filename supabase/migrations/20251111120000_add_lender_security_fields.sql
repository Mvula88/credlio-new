-- Add security and identity verification fields to lenders table
-- These fields help prevent fraud and ensure accountability

DO $$
BEGIN
  -- National ID or Passport number (REQUIRED for profile completion)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_number'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_number TEXT;
  END IF;

  -- ID type (national_id, passport, business_registration)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_type'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_type TEXT;
  END IF;

  -- City/Region (REQUIRED - at least city level)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'city'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN city TEXT;
  END IF;

  -- Region/State
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'region'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN region TEXT;
  END IF;

  -- Purpose of lending (REQUIRED to understand business model)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'lending_purpose'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN lending_purpose TEXT;
  END IF;

  -- Phone verified status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'phone_verified'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE;
  END IF;

  -- Email verified status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
  END IF;

  -- ID verified status (admin approval)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_verified'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_verified BOOLEAN DEFAULT FALSE;
  END IF;

  -- Account activation timestamp (profile_completed + verification period)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'account_activated_at'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN account_activated_at TIMESTAMPTZ;
  END IF;

  -- Verification pending until (24 hours from profile completion)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'verification_pending_until'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN verification_pending_until TIMESTAMPTZ;
  END IF;

  -- Tax ID (optional for informal lenders)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'tax_id'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN tax_id TEXT;
  END IF;

  -- Social media links (optional, for credibility)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'social_media'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN social_media JSONB DEFAULT '{}';
  END IF;

END $$;

-- Create indexes for duplicate detection
CREATE INDEX IF NOT EXISTS idx_lenders_id_number ON public.lenders(id_number) WHERE id_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lenders_contact_number ON public.lenders(contact_number) WHERE contact_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lenders_email ON public.lenders(email) WHERE email IS NOT NULL;

-- Add check constraint for lending purpose
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lenders_lending_purpose_check'
  ) THEN
    ALTER TABLE public.lenders ADD CONSTRAINT lenders_lending_purpose_check
      CHECK (lending_purpose IN ('personal', 'business', 'ngo', 'cooperative', 'microfinance', 'other') OR lending_purpose IS NULL);
  END IF;
END $$;

-- Add check constraint for ID type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lenders_id_type_check'
  ) THEN
    ALTER TABLE public.lenders ADD CONSTRAINT lenders_id_type_check
      CHECK (id_type IN ('national_id', 'passport', 'business_registration', 'drivers_license') OR id_type IS NULL);
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN public.lenders.id_number IS 'National ID, Passport, or Business Registration number';
COMMENT ON COLUMN public.lenders.id_type IS 'Type of ID provided (national_id, passport, business_registration, drivers_license)';
COMMENT ON COLUMN public.lenders.city IS 'City where lender operates (required for profile completion)';
COMMENT ON COLUMN public.lenders.region IS 'Region/State where lender operates';
COMMENT ON COLUMN public.lenders.lending_purpose IS 'Purpose of lending activity (personal, business, ngo, cooperative, microfinance, other)';
COMMENT ON COLUMN public.lenders.phone_verified IS 'Whether phone number has been verified';
COMMENT ON COLUMN public.lenders.email_verified IS 'Whether email has been verified';
COMMENT ON COLUMN public.lenders.id_verified IS 'Whether ID has been verified by admin';
COMMENT ON COLUMN public.lenders.account_activated_at IS 'When account was fully activated after verification period';
COMMENT ON COLUMN public.lenders.verification_pending_until IS '24-hour verification period end timestamp';
COMMENT ON COLUMN public.lenders.tax_id IS 'Tax ID / TIN (optional for informal lenders)';
COMMENT ON COLUMN public.lenders.social_media IS 'Social media links for credibility verification';

-- Create function to detect duplicate lenders
CREATE OR REPLACE FUNCTION public.check_duplicate_lender(
  p_id_number TEXT,
  p_contact_number TEXT,
  p_email TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  duplicate_type TEXT,
  existing_lender_id UUID,
  confidence_score INT
) AS $$
BEGIN
  -- Check for exact ID number match (100% duplicate)
  IF p_id_number IS NOT NULL THEN
    RETURN QUERY
    SELECT
      'id_number'::TEXT,
      user_id,
      100
    FROM public.lenders
    WHERE id_number = p_id_number
      AND user_id != p_user_id
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Check for exact phone match (90% confidence)
  IF p_contact_number IS NOT NULL THEN
    RETURN QUERY
    SELECT
      'phone_number'::TEXT,
      user_id,
      90
    FROM public.lenders
    WHERE contact_number = p_contact_number
      AND user_id != p_user_id
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Check for exact email match (80% confidence)
  IF p_email IS NOT NULL THEN
    RETURN QUERY
    SELECT
      'email'::TEXT,
      user_id,
      80
    FROM public.lenders
    WHERE email = p_email
      AND user_id != p_user_id
    LIMIT 1;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_duplicate_lender(TEXT, TEXT, TEXT, UUID) TO authenticated;

-- Create trigger to give instant access when profile is completed
-- Lenders are paying customers and should get immediate access
CREATE OR REPLACE FUNCTION public.activate_lender_account()
RETURNS TRIGGER AS $$
BEGIN
  -- If profile_completed is being set to TRUE, activate account immediately
  IF NEW.profile_completed = TRUE
     AND (OLD.profile_completed = FALSE OR OLD.profile_completed IS NULL)
     AND NEW.account_activated_at IS NULL THEN
    -- INSTANT ACCESS - no 24-hour wait for lenders
    NEW.account_activated_at := NOW();
    NEW.email_verified := TRUE; -- Email already verified during registration

    -- Clear any pending verification period (not used for lenders)
    NEW.verification_pending_until := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_lender_verification_period ON public.lenders;
DROP TRIGGER IF EXISTS trigger_activate_lender_account ON public.lenders;
CREATE TRIGGER trigger_activate_lender_account
  BEFORE INSERT OR UPDATE ON public.lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.activate_lender_account();

-- Create function to monitor suspicious lender behavior
CREATE OR REPLACE FUNCTION public.check_lender_suspicious_activity(
  p_lender_id UUID
)
RETURNS TABLE (
  risk_level TEXT,
  risk_factors JSONB,
  risk_score INT
) AS $$
DECLARE
  v_borrowers_created INT;
  v_borrowers_last_24h INT;
  v_account_age INTERVAL;
  v_risk_score INT := 0;
  v_risk_factors JSONB := '[]'::JSONB;
BEGIN
  -- Get account age
  SELECT NOW() - created_at INTO v_account_age
  FROM public.lenders
  WHERE user_id = p_lender_id;

  -- Count total borrowers created
  SELECT COUNT(*) INTO v_borrowers_created
  FROM public.borrowers
  WHERE created_by_lender = p_lender_id;

  -- Count borrowers created in last 24 hours
  SELECT COUNT(*) INTO v_borrowers_last_24h
  FROM public.borrowers
  WHERE created_by_lender = p_lender_id
    AND created_at > NOW() - INTERVAL '24 hours';

  -- Check for suspicious patterns

  -- Pattern 1: Too many borrowers registered too quickly (new account)
  IF v_account_age < INTERVAL '7 days' AND v_borrowers_created > 20 THEN
    v_risk_score := v_risk_score + 40;
    v_risk_factors := v_risk_factors || jsonb_build_object(
      'type', 'rapid_borrower_creation_new_account',
      'details', format('Created %s borrowers in %s', v_borrowers_created, v_account_age)
    );
  END IF;

  -- Pattern 2: Burst activity (too many in 24 hours)
  IF v_borrowers_last_24h > 50 THEN
    v_risk_score := v_risk_score + 50;
    v_risk_factors := v_risk_factors || jsonb_build_object(
      'type', 'burst_activity',
      'details', format('Created %s borrowers in last 24 hours', v_borrowers_last_24h)
    );
  END IF;

  -- Determine risk level
  IF v_risk_score >= 70 THEN
    RETURN QUERY SELECT 'high'::TEXT, v_risk_factors, v_risk_score;
  ELSIF v_risk_score >= 40 THEN
    RETURN QUERY SELECT 'medium'::TEXT, v_risk_factors, v_risk_score;
  ELSE
    RETURN QUERY SELECT 'low'::TEXT, v_risk_factors, v_risk_score;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_lender_suspicious_activity(UUID) TO authenticated;

-- Add comments explaining the instant access model
COMMENT ON COLUMN public.lenders.account_activated_at IS 'Account activated immediately after profile completion - lenders are paying customers';
COMMENT ON COLUMN public.lenders.verification_pending_until IS 'NOT USED for lenders - kept for data compatibility only';
COMMENT ON FUNCTION public.activate_lender_account() IS 'Gives instant dashboard access when lender completes profile - no waiting period';
COMMENT ON FUNCTION public.check_lender_suspicious_activity(UUID) IS 'Background monitoring for suspicious lender behavior (too many borrowers registered too fast, etc)';
