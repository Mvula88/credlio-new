-- Collateral/Security Tracking System
-- Track assets pledged as security for loans

-- ============================================================================
-- 1. CREATE COLLATERAL TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collaterals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,

  -- Collateral type
  collateral_type TEXT NOT NULL CHECK (collateral_type IN (
    'real_estate',      -- Land, buildings, houses
    'vehicle',          -- Cars, motorcycles, trucks
    'equipment',        -- Business equipment, machinery
    'inventory',        -- Business stock/inventory
    'livestock',        -- Animals (cattle, goats, etc.)
    'crops',            -- Standing crops, harvest
    'savings',          -- Cash deposits, savings accounts
    'gold_jewelry',     -- Precious metals and jewelry
    'electronics',      -- Phones, computers, TVs
    'furniture',        -- Household furniture
    'other'
  )),

  -- Description
  description TEXT NOT NULL,
  serial_number TEXT,            -- Vehicle VIN, equipment serial, etc.
  registration_number TEXT,       -- Vehicle plate, land title number

  -- Valuation
  estimated_value_minor BIGINT NOT NULL,
  valuation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valued_by TEXT,                 -- Who did the valuation
  valuation_method TEXT CHECK (valuation_method IN ('self_declared', 'lender_assessed', 'professional_appraisal', 'market_comparison')),

  -- Insurance (if applicable)
  is_insured BOOLEAN DEFAULT FALSE,
  insurance_provider TEXT,
  insurance_policy_number TEXT,
  insurance_expiry_date DATE,

  -- Location
  location_description TEXT,
  location_coordinates TEXT,      -- GPS coordinates if available

  -- Documents
  photo_urls TEXT[],              -- Array of photo URLs
  document_urls TEXT[],           -- Array of document URLs (titles, registrations)

  -- Status
  status TEXT NOT NULL DEFAULT 'pledged' CHECK (status IN (
    'pledged',          -- Active as loan collateral
    'released',         -- Released back to borrower (loan paid)
    'seized',           -- Taken by lender (default)
    'sold',             -- Sold to recover debt
    'expired',          -- No longer valid (e.g., crops harvested)
    'pending_release'   -- Awaiting release after loan completion
  )),

  -- Seizure/Sale details
  seized_at TIMESTAMPTZ,
  seized_by UUID REFERENCES auth.users(id),
  seizure_reason TEXT,
  sold_at TIMESTAMPTZ,
  sale_amount_minor BIGINT,

  -- Release details
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.collaterals ENABLE ROW LEVEL SECURITY;

-- Lenders can view/manage collateral for their loans
CREATE POLICY "Lenders can manage collateral for their loans" ON public.collaterals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = collaterals.loan_id AND l.lender_id = auth.uid()
    )
    OR
    -- Also allow lenders to add collateral for borrowers in their portfolio
    EXISTS (
      SELECT 1 FROM public.borrowers b
      JOIN public.loans l ON l.borrower_id = b.id
      WHERE b.id = collaterals.borrower_id AND l.lender_id = auth.uid()
    )
  );

-- Borrowers can view their collateral
CREATE POLICY "Borrowers can view their collateral" ON public.collaterals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.borrower_user_links bul
      WHERE bul.borrower_id = collaterals.borrower_id AND bul.user_id = auth.uid()
    )
  );

-- Admins can manage all collateral
CREATE POLICY "Admins can manage all collateral" ON public.collaterals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_collaterals_loan_id ON public.collaterals(loan_id);
CREATE INDEX IF NOT EXISTS idx_collaterals_borrower_id ON public.collaterals(borrower_id);
CREATE INDEX IF NOT EXISTS idx_collaterals_status ON public.collaterals(status);
CREATE INDEX IF NOT EXISTS idx_collaterals_type ON public.collaterals(collateral_type);


-- ============================================================================
-- 2. ADD is_secured AND collateral_required TO LOANS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'loans'
    AND column_name = 'is_secured'
  ) THEN
    ALTER TABLE public.loans ADD COLUMN is_secured BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'loans'
    AND column_name = 'required_collateral_value_minor'
  ) THEN
    ALTER TABLE public.loans ADD COLUMN required_collateral_value_minor BIGINT;
  END IF;
END $$;


-- ============================================================================
-- 3. FUNCTION TO ADD COLLATERAL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_collateral(
  p_borrower_id UUID,
  p_loan_id UUID,
  p_collateral_type TEXT,
  p_description TEXT,
  p_estimated_value_minor BIGINT,
  p_serial_number TEXT DEFAULT NULL,
  p_registration_number TEXT DEFAULT NULL,
  p_location_description TEXT DEFAULT NULL,
  p_valuation_method TEXT DEFAULT 'lender_assessed'
)
RETURNS JSON AS $$
DECLARE
  v_collateral_id UUID;
  v_loan RECORD;
BEGIN
  -- Verify authorization
  IF p_loan_id IS NOT NULL THEN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id;

    IF v_loan IS NULL THEN
      RETURN json_build_object('error', 'Loan not found');
    END IF;

    IF v_loan.lender_id != auth.uid() AND NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
      RETURN json_build_object('error', 'Not authorized to add collateral to this loan');
    END IF;
  END IF;

  -- Insert collateral
  INSERT INTO public.collaterals (
    loan_id,
    borrower_id,
    collateral_type,
    description,
    estimated_value_minor,
    serial_number,
    registration_number,
    location_description,
    valuation_method,
    valued_by
  ) VALUES (
    p_loan_id,
    p_borrower_id,
    p_collateral_type,
    p_description,
    p_estimated_value_minor,
    p_serial_number,
    p_registration_number,
    p_location_description,
    p_valuation_method,
    'Lender'
  )
  RETURNING id INTO v_collateral_id;

  -- Update loan secured status if linked
  IF p_loan_id IS NOT NULL THEN
    UPDATE public.loans
    SET is_secured = TRUE, updated_at = NOW()
    WHERE id = p_loan_id;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'collateral_id', v_collateral_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. FUNCTION TO RELEASE COLLATERAL (ON LOAN COMPLETION)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_collateral(p_collateral_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_collateral RECORD;
  v_loan RECORD;
BEGIN
  -- Get collateral
  SELECT c.*, l.lender_id, l.status as loan_status
  INTO v_collateral
  FROM public.collaterals c
  LEFT JOIN public.loans l ON l.id = c.loan_id
  WHERE c.id = p_collateral_id;

  IF v_collateral IS NULL THEN
    RAISE EXCEPTION 'Collateral not found';
  END IF;

  -- Check authorization
  IF v_collateral.lender_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized to release this collateral';
  END IF;

  -- Check loan is completed (if linked)
  IF v_collateral.loan_id IS NOT NULL AND v_collateral.loan_status NOT IN ('completed', 'written_off') THEN
    RAISE EXCEPTION 'Cannot release collateral while loan is still active';
  END IF;

  -- Release the collateral
  UPDATE public.collaterals
  SET
    status = 'released',
    released_at = NOW(),
    released_by = auth.uid(),
    updated_at = NOW()
  WHERE id = p_collateral_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. FUNCTION TO SEIZE COLLATERAL (ON DEFAULT)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seize_collateral(
  p_collateral_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_collateral RECORD;
  v_borrower_user_id UUID;
BEGIN
  -- Get collateral
  SELECT c.*, l.lender_id, l.borrower_id
  INTO v_collateral
  FROM public.collaterals c
  LEFT JOIN public.loans l ON l.id = c.loan_id
  WHERE c.id = p_collateral_id;

  IF v_collateral IS NULL THEN
    RAISE EXCEPTION 'Collateral not found';
  END IF;

  -- Check authorization
  IF v_collateral.lender_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized to seize this collateral';
  END IF;

  -- Seize the collateral
  UPDATE public.collaterals
  SET
    status = 'seized',
    seized_at = NOW(),
    seized_by = auth.uid(),
    seizure_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_collateral_id;

  -- Notify borrower
  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_collateral.borrower_id
  LIMIT 1;

  IF v_borrower_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      v_borrower_user_id,
      'system',
      'Collateral Seized',
      'Your collateral (' || (SELECT description FROM public.collaterals WHERE id = p_collateral_id) || ') has been seized due to: ' || p_reason,
      '/b/loans',
      'borrower'
    );
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 6. FUNCTION TO GET LOAN COLLATERAL SUMMARY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_loan_collateral_summary(p_loan_id UUID)
RETURNS JSON AS $$
DECLARE
  v_total_value BIGINT;
  v_collateral_count INTEGER;
  v_collaterals JSON;
BEGIN
  SELECT
    COALESCE(SUM(estimated_value_minor), 0),
    COUNT(*)
  INTO v_total_value, v_collateral_count
  FROM public.collaterals
  WHERE loan_id = p_loan_id AND status = 'pledged';

  SELECT json_agg(row_to_json(c))
  INTO v_collaterals
  FROM (
    SELECT id, collateral_type, description, estimated_value_minor, status, created_at
    FROM public.collaterals
    WHERE loan_id = p_loan_id
    ORDER BY created_at DESC
  ) c;

  RETURN json_build_object(
    'total_value_minor', v_total_value,
    'collateral_count', v_collateral_count,
    'collaterals', COALESCE(v_collaterals, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 7. AUTO-RELEASE COLLATERAL ON LOAN COMPLETION TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_release_collateral_on_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- When loan is completed, mark collateral for release
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE public.collaterals
    SET
      status = 'pending_release',
      updated_at = NOW()
    WHERE loan_id = NEW.id AND status = 'pledged';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_auto_release_collateral ON public.loans;
CREATE TRIGGER trigger_auto_release_collateral
  AFTER UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_release_collateral_on_completion();


-- Grant permissions
GRANT EXECUTE ON FUNCTION public.add_collateral(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_collateral(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seize_collateral(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_loan_collateral_summary(UUID) TO authenticated;


-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Collateral tracking system created';
  RAISE NOTICE 'Features: Multiple collateral types, valuation tracking, seizure/release workflow';
END $$;
