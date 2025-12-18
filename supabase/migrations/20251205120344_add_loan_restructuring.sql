-- Loan Restructuring/Renegotiation System
-- Allows modification of loan terms after creation

-- ============================================================================
-- 1. CREATE LOAN RESTRUCTURING REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.loan_restructures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,

  -- Who requested it
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_by_role TEXT NOT NULL CHECK (requested_by_role IN ('borrower', 'lender')),

  -- Original terms (snapshot at time of request)
  original_term_months INTEGER NOT NULL,
  original_interest_rate DECIMAL(5,2) NOT NULL,
  original_monthly_payment_minor BIGINT NOT NULL,
  original_remaining_minor BIGINT NOT NULL,

  -- Proposed new terms
  new_term_months INTEGER NOT NULL,
  new_interest_rate DECIMAL(5,2) NOT NULL,
  new_monthly_payment_minor BIGINT NOT NULL,

  -- Reason for restructuring
  reason TEXT NOT NULL CHECK (reason IN (
    'financial_hardship',
    'income_change',
    'medical_emergency',
    'job_loss',
    'business_downturn',
    'early_payoff_plan',
    'rate_adjustment',
    'other'
  )),
  reason_details TEXT,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Awaiting other party's review
    'approved',     -- Other party approved
    'rejected',     -- Other party rejected
    'cancelled',    -- Requester cancelled
    'applied'       -- Changes have been applied to loan
  )),

  -- Approval details
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- When changes were applied
  applied_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.loan_restructures ENABLE ROW LEVEL SECURITY;

-- Lenders can view/manage restructures for their loans
CREATE POLICY "Lenders can manage restructures for their loans" ON public.loan_restructures
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_restructures.loan_id AND l.lender_id = auth.uid()
    )
  );

-- Borrowers can view/create restructures for their loans
CREATE POLICY "Borrowers can view their loan restructures" ON public.loan_restructures
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      JOIN public.borrower_user_links bul ON bul.borrower_id = l.borrower_id
      WHERE l.id = loan_restructures.loan_id AND bul.user_id = auth.uid()
    )
  );

CREATE POLICY "Borrowers can create restructure requests" ON public.loan_restructures
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.loans l
      JOIN public.borrower_user_links bul ON bul.borrower_id = l.borrower_id
      WHERE l.id = loan_restructures.loan_id AND bul.user_id = auth.uid()
    )
  );

-- Admins can manage all restructures
CREATE POLICY "Admins can manage all restructures" ON public.loan_restructures
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_loan_restructures_loan_id ON public.loan_restructures(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_restructures_status ON public.loan_restructures(status);


-- ============================================================================
-- 2. ADD restructured_from_id TO LOANS TABLE FOR TRACKING
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'loans'
    AND column_name = 'restructured_from_id'
  ) THEN
    ALTER TABLE public.loans ADD COLUMN restructured_from_id UUID REFERENCES public.loans(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'loans'
    AND column_name = 'restructure_count'
  ) THEN
    ALTER TABLE public.loans ADD COLUMN restructure_count INTEGER DEFAULT 0;
  END IF;
END $$;


-- ============================================================================
-- 3. FUNCTION TO REQUEST LOAN RESTRUCTURING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_loan_restructure(
  p_loan_id UUID,
  p_new_term_months INTEGER,
  p_new_interest_rate DECIMAL,
  p_reason TEXT,
  p_reason_details TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_is_lender BOOLEAN;
  v_is_borrower BOOLEAN;
  v_requester_role TEXT;
  v_remaining_balance DECIMAL;
  v_new_monthly_payment DECIMAL;
  v_restructure_id UUID;
  v_currency_symbol TEXT;
BEGIN
  -- Get loan details
  SELECT l.*, b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE l.id = p_loan_id;

  IF v_loan IS NULL THEN
    RETURN json_build_object('error', 'Loan not found');
  END IF;

  -- Check loan is active
  IF v_loan.status != 'active' THEN
    RETURN json_build_object('error', 'Can only restructure active loans');
  END IF;

  -- Check if there's already a pending restructure
  IF EXISTS (
    SELECT 1 FROM public.loan_restructures
    WHERE loan_id = p_loan_id AND status = 'pending'
  ) THEN
    RETURN json_build_object('error', 'There is already a pending restructure request for this loan');
  END IF;

  -- Determine who is requesting
  v_is_lender := v_loan.lender_id = auth.uid();

  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id
  LIMIT 1;

  v_is_borrower := v_borrower_user_id = auth.uid();

  IF NOT v_is_lender AND NOT v_is_borrower THEN
    RETURN json_build_object('error', 'Not authorized to request restructure');
  END IF;

  v_requester_role := CASE WHEN v_is_lender THEN 'lender' ELSE 'borrower' END;

  -- Calculate remaining balance
  SELECT COALESCE(SUM(amount_due_minor), 0) - COALESCE(SUM(paid_amount_minor), 0)
  INTO v_remaining_balance
  FROM public.repayment_schedules
  WHERE loan_id = p_loan_id AND status IN ('pending', 'overdue', 'partial');

  -- Calculate new monthly payment
  -- Simple calculation: remaining / new term (can be enhanced with proper amortization)
  v_new_monthly_payment := v_remaining_balance / p_new_term_months;

  -- Get currency symbol
  v_currency_symbol := CASE
    WHEN v_loan.currency = 'USD' THEN '$'
    WHEN v_loan.currency = 'KES' THEN 'KSh'
    WHEN v_loan.currency = 'UGX' THEN 'USh'
    WHEN v_loan.currency = 'NAD' THEN 'N$'
    ELSE v_loan.currency || ' '
  END;

  -- Create the restructure request
  INSERT INTO public.loan_restructures (
    loan_id,
    requested_by,
    requested_by_role,
    original_term_months,
    original_interest_rate,
    original_monthly_payment_minor,
    original_remaining_minor,
    new_term_months,
    new_interest_rate,
    new_monthly_payment_minor,
    reason,
    reason_details
  ) VALUES (
    p_loan_id,
    auth.uid(),
    v_requester_role,
    v_loan.term_months,
    v_loan.interest_rate,
    v_loan.monthly_payment_minor,
    v_remaining_balance::BIGINT,
    p_new_term_months,
    p_new_interest_rate,
    v_new_monthly_payment::BIGINT,
    p_reason,
    p_reason_details
  )
  RETURNING id INTO v_restructure_id;

  -- Notify the other party
  IF v_is_borrower THEN
    -- Notify lender
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      v_loan.lender_id,
      'system',
      'Loan Restructure Request',
      v_loan.borrower_name || ' has requested to restructure their loan. New term: ' || p_new_term_months || ' months.',
      '/l/loans/' || p_loan_id,
      'lender'
    );
  ELSE
    -- Notify borrower
    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        v_borrower_user_id,
        'system',
        'Loan Restructure Offer',
        'Your lender has offered to restructure your loan. New term: ' || p_new_term_months || ' months. Please review.',
        '/b/loans/' || p_loan_id,
        'borrower'
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'restructure_id', v_restructure_id,
    'new_term_months', p_new_term_months,
    'new_interest_rate', p_new_interest_rate,
    'new_monthly_payment_minor', v_new_monthly_payment::BIGINT
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. FUNCTION TO APPROVE/REJECT RESTRUCTURE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.respond_to_restructure(
  p_restructure_id UUID,
  p_approve BOOLEAN,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_restructure RECORD;
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_is_lender BOOLEAN;
  v_is_borrower BOOLEAN;
BEGIN
  -- Get restructure details
  SELECT lr.*, l.lender_id, l.borrower_id, b.full_name as borrower_name
  INTO v_restructure
  FROM public.loan_restructures lr
  JOIN public.loans l ON l.id = lr.loan_id
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE lr.id = p_restructure_id;

  IF v_restructure IS NULL THEN
    RETURN json_build_object('error', 'Restructure request not found');
  END IF;

  IF v_restructure.status != 'pending' THEN
    RETURN json_build_object('error', 'This request has already been processed');
  END IF;

  -- Determine who is responding
  v_is_lender := v_restructure.lender_id = auth.uid();

  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_restructure.borrower_id
  LIMIT 1;

  v_is_borrower := v_borrower_user_id = auth.uid();

  -- Make sure the responder is not the requester
  IF v_restructure.requested_by = auth.uid() THEN
    RETURN json_build_object('error', 'You cannot approve your own request');
  END IF;

  -- Check authorization
  IF NOT v_is_lender AND NOT v_is_borrower THEN
    RETURN json_build_object('error', 'Not authorized to respond to this request');
  END IF;

  IF p_approve THEN
    -- Update restructure status
    UPDATE public.loan_restructures
    SET
      status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_restructure_id;

    -- Notify requester
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      v_restructure.requested_by,
      'system',
      'Restructure Approved!',
      'Your loan restructure request has been approved. The new terms will be applied.',
      CASE WHEN v_restructure.requested_by_role = 'lender' THEN '/l/loans/' ELSE '/b/loans/' END || v_restructure.loan_id,
      v_restructure.requested_by_role
    );

    -- Apply the restructure
    PERFORM public.apply_loan_restructure(p_restructure_id);

    RETURN json_build_object(
      'success', TRUE,
      'status', 'approved',
      'message', 'Restructure approved and applied'
    );
  ELSE
    -- Reject the request
    UPDATE public.loan_restructures
    SET
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      rejection_reason = p_rejection_reason,
      updated_at = NOW()
    WHERE id = p_restructure_id;

    -- Notify requester
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      v_restructure.requested_by,
      'system',
      'Restructure Request Declined',
      'Your loan restructure request has been declined.' ||
        CASE WHEN p_rejection_reason IS NOT NULL THEN ' Reason: ' || p_rejection_reason ELSE '' END,
      CASE WHEN v_restructure.requested_by_role = 'lender' THEN '/l/loans/' ELSE '/b/loans/' END || v_restructure.loan_id,
      v_restructure.requested_by_role
    );

    RETURN json_build_object(
      'success', TRUE,
      'status', 'rejected',
      'message', 'Restructure request rejected'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. FUNCTION TO APPLY RESTRUCTURE (REGENERATE SCHEDULES)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_loan_restructure(p_restructure_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_restructure RECORD;
  v_loan RECORD;
  v_remaining_balance BIGINT;
  v_new_installment_amount BIGINT;
  v_next_due_date DATE;
  v_installment_no INTEGER;
  v_principal_per_installment BIGINT;
  v_interest_per_installment BIGINT;
BEGIN
  -- Get restructure details
  SELECT * INTO v_restructure
  FROM public.loan_restructures
  WHERE id = p_restructure_id AND status = 'approved';

  IF v_restructure IS NULL THEN
    RAISE EXCEPTION 'Approved restructure not found';
  END IF;

  -- Get loan
  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = v_restructure.loan_id;

  -- Calculate remaining balance from unpaid schedules
  SELECT COALESCE(SUM(amount_due_minor - COALESCE(paid_amount_minor, 0)), 0)
  INTO v_remaining_balance
  FROM public.repayment_schedules
  WHERE loan_id = v_restructure.loan_id AND status IN ('pending', 'overdue', 'partial');

  -- Delete unpaid schedules (keep paid ones for history)
  DELETE FROM public.repayment_schedules
  WHERE loan_id = v_restructure.loan_id AND status IN ('pending', 'overdue', 'partial');

  -- Calculate new installment amounts
  v_new_installment_amount := v_remaining_balance / v_restructure.new_term_months;
  v_principal_per_installment := (v_remaining_balance * (100 - v_restructure.new_interest_rate) / 100) / v_restructure.new_term_months;
  v_interest_per_installment := v_new_installment_amount - v_principal_per_installment;

  -- Set next due date (first of next month)
  v_next_due_date := DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month';

  -- Get the last installment number used
  SELECT COALESCE(MAX(installment_no), 0) INTO v_installment_no
  FROM public.repayment_schedules
  WHERE loan_id = v_restructure.loan_id;

  -- Create new repayment schedules
  FOR i IN 1..v_restructure.new_term_months LOOP
    v_installment_no := v_installment_no + 1;

    INSERT INTO public.repayment_schedules (
      loan_id,
      installment_no,
      due_date,
      amount_due_minor,
      principal_portion_minor,
      interest_portion_minor,
      status
    ) VALUES (
      v_restructure.loan_id,
      v_installment_no,
      v_next_due_date + ((i - 1) * INTERVAL '1 month'),
      v_new_installment_amount,
      v_principal_per_installment,
      v_interest_per_installment,
      'pending'
    );
  END LOOP;

  -- Update loan with new terms
  UPDATE public.loans
  SET
    term_months = v_restructure.new_term_months,
    interest_rate = v_restructure.new_interest_rate,
    monthly_payment_minor = v_new_installment_amount,
    restructure_count = COALESCE(restructure_count, 0) + 1,
    updated_at = NOW()
  WHERE id = v_restructure.loan_id;

  -- Mark restructure as applied
  UPDATE public.loan_restructures
  SET
    status = 'applied',
    applied_at = NOW(),
    updated_at = NOW()
  WHERE id = p_restructure_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Grant permissions
GRANT EXECUTE ON FUNCTION public.request_loan_restructure(UUID, INTEGER, DECIMAL, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_restructure(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_loan_restructure(UUID) TO authenticated;


-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Loan restructuring system created';
  RAISE NOTICE 'Features: Restructure requests, approval workflow, automatic schedule regeneration';
END $$;
