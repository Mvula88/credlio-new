-- Late Payment Penalties System
-- Adds automatic late fees when payments are overdue

-- ============================================================================
-- 1. CREATE LATE FEE CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.late_fee_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL,
  -- Grace period before late fees start (days after due date)
  grace_period_days INTEGER NOT NULL DEFAULT 3,
  -- Fee tiers (applied progressively)
  tier1_days INTEGER NOT NULL DEFAULT 7,  -- Days overdue to trigger tier 1
  tier1_percentage DECIMAL(5,2) NOT NULL DEFAULT 5.00,  -- 5% of installment
  tier2_days INTEGER NOT NULL DEFAULT 30,  -- Days overdue to trigger tier 2
  tier2_percentage DECIMAL(5,2) NOT NULL DEFAULT 10.00,  -- 10% of installment
  tier3_days INTEGER NOT NULL DEFAULT 60,  -- Days overdue to trigger tier 3
  tier3_percentage DECIMAL(5,2) NOT NULL DEFAULT 15.00,  -- 15% of installment
  -- Maximum late fee cap (percentage of original amount)
  max_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 25.00,
  -- Whether fees compound or are flat
  is_compounding BOOLEAN DEFAULT FALSE,
  -- Active status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code)
);

-- Enable RLS
ALTER TABLE public.late_fee_configs ENABLE ROW LEVEL SECURITY;

-- Admin can manage late fee configs
CREATE POLICY "Admins can manage late fee configs" ON public.late_fee_configs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Lenders can view configs for their country
CREATE POLICY "Lenders can view late fee configs" ON public.late_fee_configs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.country_code = late_fee_configs.country_code
    )
  );


-- ============================================================================
-- 2. CREATE LATE FEES TABLE TO TRACK APPLIED FEES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.late_fees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES public.repayment_schedules(id) ON DELETE CASCADE,
  -- Fee details
  fee_amount_minor BIGINT NOT NULL,
  fee_percentage DECIMAL(5,2) NOT NULL,
  tier_applied INTEGER NOT NULL,  -- 1, 2, or 3
  days_overdue INTEGER NOT NULL,
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'waived', 'partial')),
  paid_amount_minor BIGINT DEFAULT 0,
  -- Waiver info
  waived_by UUID REFERENCES auth.users(id),
  waived_at TIMESTAMPTZ,
  waiver_reason TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.late_fees ENABLE ROW LEVEL SECURITY;

-- Lenders can view late fees for their loans
CREATE POLICY "Lenders can view late fees for their loans" ON public.late_fees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = late_fees.loan_id AND l.lender_id = auth.uid()
    )
  );

-- Borrowers can view late fees for their loans
CREATE POLICY "Borrowers can view their late fees" ON public.late_fees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      JOIN public.borrower_user_links bul ON bul.borrower_id = l.borrower_id
      WHERE l.id = late_fees.loan_id AND bul.user_id = auth.uid()
    )
  );

-- Admins can manage all late fees
CREATE POLICY "Admins can manage all late fees" ON public.late_fees
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_late_fees_loan_id ON public.late_fees(loan_id);
CREATE INDEX IF NOT EXISTS idx_late_fees_schedule_id ON public.late_fees(schedule_id);
CREATE INDEX IF NOT EXISTS idx_late_fees_status ON public.late_fees(status);


-- ============================================================================
-- 3. ADD late_fee_minor TO REPAYMENT SCHEDULES
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'repayment_schedules'
    AND column_name = 'late_fee_minor'
  ) THEN
    ALTER TABLE public.repayment_schedules ADD COLUMN late_fee_minor BIGINT DEFAULT 0;
  END IF;
END $$;


-- ============================================================================
-- 4. FUNCTION TO CALCULATE AND APPLY LATE FEES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_late_fees(p_loan_id UUID)
RETURNS JSON AS $$
DECLARE
  v_loan RECORD;
  v_config RECORD;
  v_schedule RECORD;
  v_days_overdue INTEGER;
  v_fee_percentage DECIMAL(5,2);
  v_fee_amount BIGINT;
  v_tier INTEGER;
  v_total_fees_applied BIGINT := 0;
  v_schedules_with_fees INTEGER := 0;
  v_existing_fee RECORD;
BEGIN
  -- Get loan details
  SELECT l.*, p.country_code
  INTO v_loan
  FROM public.loans l
  JOIN public.lenders le ON le.user_id = l.lender_id
  JOIN public.profiles p ON p.user_id = l.lender_id
  WHERE l.id = p_loan_id;

  IF v_loan IS NULL THEN
    RETURN json_build_object('error', 'Loan not found');
  END IF;

  -- Get late fee config for this country
  SELECT * INTO v_config
  FROM public.late_fee_configs
  WHERE country_code = v_loan.country_code AND is_active = TRUE;

  -- If no config, use defaults
  IF v_config IS NULL THEN
    v_config.grace_period_days := 3;
    v_config.tier1_days := 7;
    v_config.tier1_percentage := 5.00;
    v_config.tier2_days := 30;
    v_config.tier2_percentage := 10.00;
    v_config.tier3_days := 60;
    v_config.tier3_percentage := 15.00;
    v_config.max_fee_percentage := 25.00;
  END IF;

  -- Loop through overdue schedules
  FOR v_schedule IN
    SELECT *
    FROM public.repayment_schedules
    WHERE loan_id = p_loan_id
    AND status IN ('pending', 'overdue', 'partial')
    AND due_date < CURRENT_DATE - v_config.grace_period_days
  LOOP
    -- Calculate days overdue (after grace period)
    v_days_overdue := (CURRENT_DATE - v_schedule.due_date)::INTEGER;

    -- Determine which tier applies
    IF v_days_overdue >= v_config.tier3_days THEN
      v_tier := 3;
      v_fee_percentage := v_config.tier3_percentage;
    ELSIF v_days_overdue >= v_config.tier2_days THEN
      v_tier := 2;
      v_fee_percentage := v_config.tier2_percentage;
    ELSIF v_days_overdue >= v_config.tier1_days THEN
      v_tier := 1;
      v_fee_percentage := v_config.tier1_percentage;
    ELSE
      -- Within grace period extended, no fee yet
      CONTINUE;
    END IF;

    -- Check if we already have a fee for this tier
    SELECT * INTO v_existing_fee
    FROM public.late_fees
    WHERE schedule_id = v_schedule.id AND tier_applied = v_tier;

    IF v_existing_fee IS NOT NULL THEN
      -- Already applied this tier's fee
      CONTINUE;
    END IF;

    -- Calculate fee amount (percentage of amount due)
    v_fee_amount := (v_schedule.amount_due_minor * v_fee_percentage / 100)::BIGINT;

    -- Apply max fee cap
    IF v_fee_amount > (v_schedule.amount_due_minor * v_config.max_fee_percentage / 100)::BIGINT THEN
      v_fee_amount := (v_schedule.amount_due_minor * v_config.max_fee_percentage / 100)::BIGINT;
    END IF;

    -- Insert the late fee record
    INSERT INTO public.late_fees (
      loan_id, schedule_id, fee_amount_minor, fee_percentage, tier_applied, days_overdue
    ) VALUES (
      p_loan_id, v_schedule.id, v_fee_amount, v_fee_percentage, v_tier, v_days_overdue
    );

    -- Update the schedule's late fee total
    UPDATE public.repayment_schedules
    SET
      late_fee_minor = COALESCE(late_fee_minor, 0) + v_fee_amount,
      status = 'overdue',
      updated_at = NOW()
    WHERE id = v_schedule.id;

    v_total_fees_applied := v_total_fees_applied + v_fee_amount;
    v_schedules_with_fees := v_schedules_with_fees + 1;
  END LOOP;

  RETURN json_build_object(
    'success', TRUE,
    'total_fees_applied_minor', v_total_fees_applied,
    'schedules_with_fees', v_schedules_with_fees
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. FUNCTION TO WAIVE LATE FEES (LENDER/ADMIN)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.waive_late_fee(
  p_late_fee_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_fee RECORD;
  v_loan RECORD;
BEGIN
  -- Get fee details
  SELECT lf.*, l.lender_id
  INTO v_fee
  FROM public.late_fees lf
  JOIN public.loans l ON l.id = lf.loan_id
  WHERE lf.id = p_late_fee_id;

  IF v_fee IS NULL THEN
    RAISE EXCEPTION 'Late fee not found';
  END IF;

  -- Check authorization (lender or admin)
  IF v_fee.lender_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized to waive this fee';
  END IF;

  -- Update fee status
  UPDATE public.late_fees
  SET
    status = 'waived',
    waived_by = auth.uid(),
    waived_at = NOW(),
    waiver_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_late_fee_id;

  -- Update schedule late fee total
  UPDATE public.repayment_schedules
  SET
    late_fee_minor = GREATEST(COALESCE(late_fee_minor, 0) - v_fee.fee_amount_minor, 0),
    updated_at = NOW()
  WHERE id = v_fee.schedule_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 6. FUNCTION TO GET LOAN LATE FEE SUMMARY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_loan_late_fees_summary(p_loan_id UUID)
RETURNS JSON AS $$
DECLARE
  v_total_fees BIGINT;
  v_paid_fees BIGINT;
  v_waived_fees BIGINT;
  v_pending_fees BIGINT;
  v_fee_count INTEGER;
BEGIN
  SELECT
    COALESCE(SUM(fee_amount_minor), 0),
    COALESCE(SUM(CASE WHEN status = 'paid' THEN fee_amount_minor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'waived' THEN fee_amount_minor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'pending' THEN fee_amount_minor ELSE 0 END), 0),
    COUNT(*)
  INTO v_total_fees, v_paid_fees, v_waived_fees, v_pending_fees, v_fee_count
  FROM public.late_fees
  WHERE loan_id = p_loan_id;

  RETURN json_build_object(
    'total_fees_minor', v_total_fees,
    'paid_fees_minor', v_paid_fees,
    'waived_fees_minor', v_waived_fees,
    'pending_fees_minor', v_pending_fees,
    'fee_count', v_fee_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 7. INSERT DEFAULT LATE FEE CONFIGS FOR EXISTING COUNTRIES
-- ============================================================================

INSERT INTO public.late_fee_configs (country_code, grace_period_days, tier1_days, tier1_percentage, tier2_days, tier2_percentage, tier3_days, tier3_percentage, max_fee_percentage)
VALUES
  ('KE', 3, 7, 5.00, 30, 10.00, 60, 15.00, 25.00),
  ('UG', 3, 7, 5.00, 30, 10.00, 60, 15.00, 25.00),
  ('TZ', 3, 7, 5.00, 30, 10.00, 60, 15.00, 25.00),
  ('RW', 3, 7, 5.00, 30, 10.00, 60, 15.00, 25.00),
  ('NG', 3, 7, 5.00, 30, 10.00, 60, 15.00, 25.00),
  ('GH', 3, 7, 5.00, 30, 10.00, 60, 15.00, 25.00),
  ('ZA', 3, 7, 5.00, 30, 10.00, 60, 15.00, 25.00),
  ('NA', 3, 7, 5.00, 30, 10.00, 60, 15.00, 25.00),
  ('US', 5, 10, 5.00, 30, 10.00, 60, 15.00, 20.00)
ON CONFLICT (country_code) DO NOTHING;


-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_late_fees(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.waive_late_fee(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_loan_late_fees_summary(UUID) TO authenticated;


-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Late payment penalties system created';
  RAISE NOTICE 'Features: Tiered late fees, grace periods, fee waiver, country-specific configs';
END $$;
