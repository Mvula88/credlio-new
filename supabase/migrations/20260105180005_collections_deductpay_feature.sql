-- Collections / DeductPay Feature
-- Automatic card deduction for loan repayments
-- Business plan only feature
-- Split payments: Platform fee + Lender receives rest

-- ============================================
-- 1. Payment Mandates (Consent Records)
-- ============================================
CREATE TABLE IF NOT EXISTS public.payment_mandates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- References
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id) ON DELETE CASCADE,

  -- Mandate details
  mandate_reference TEXT UNIQUE NOT NULL, -- Unique ref for DPO
  amount DECIMAL(12,2) NOT NULL, -- Amount per deduction
  currency TEXT NOT NULL DEFAULT 'NAD',
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'custom')),
  deduction_day INTEGER, -- Day of month (1-31) or day of week (1-7)
  start_date DATE NOT NULL,
  end_date DATE, -- NULL = until loan paid off

  -- Consent tracking
  consent_given_at TIMESTAMPTZ,
  consent_ip_address TEXT,
  consent_user_agent TEXT,
  consent_signature_data TEXT, -- Base64 signature if collected
  consent_document_url TEXT, -- Stored consent PDF

  -- Status
  status TEXT NOT NULL DEFAULT 'pending_consent' CHECK (status IN (
    'pending_consent',  -- Waiting for borrower to consent
    'active',           -- Consent given, deductions active
    'paused',           -- Temporarily paused by lender
    'cancelled_borrower', -- Borrower revoked consent
    'cancelled_lender',   -- Lender cancelled
    'completed',        -- Loan paid off, mandate ended
    'expired'           -- End date reached
  )),

  -- Secure link for borrower
  consent_token TEXT UNIQUE, -- Token for consent link
  consent_token_expires_at TIMESTAMPTZ,

  -- DPO integration
  dpo_mandate_id TEXT, -- DPO's mandate reference
  dpo_setup_complete BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_payment_mandates_loan ON public.payment_mandates(loan_id);
CREATE INDEX idx_payment_mandates_borrower ON public.payment_mandates(borrower_id);
CREATE INDEX idx_payment_mandates_lender ON public.payment_mandates(lender_id);
CREATE INDEX idx_payment_mandates_status ON public.payment_mandates(status);
CREATE INDEX idx_payment_mandates_consent_token ON public.payment_mandates(consent_token);

-- ============================================
-- 2. Payment Methods (Tokenized Cards)
-- ============================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Owner
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,

  -- Card details (tokenized - never store full card number!)
  card_token TEXT NOT NULL, -- Token from DPO
  card_last_four TEXT NOT NULL, -- Last 4 digits for display
  card_brand TEXT, -- Visa, Mastercard, etc.
  card_expiry_month INTEGER,
  card_expiry_year INTEGER,
  card_holder_name TEXT,

  -- Status
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  -- DPO reference
  dpo_customer_id TEXT, -- DPO's customer reference
  dpo_payment_method_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_payment_methods_borrower ON public.payment_methods(borrower_id);
CREATE INDEX idx_payment_methods_token ON public.payment_methods(card_token);

-- Ensure only one default card per borrower
CREATE UNIQUE INDEX idx_payment_methods_default
ON public.payment_methods(borrower_id)
WHERE is_default = TRUE AND is_active = TRUE;

-- ============================================
-- 3. Scheduled Deductions (Upcoming Payments)
-- ============================================
CREATE TABLE IF NOT EXISTS public.scheduled_deductions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- References
  mandate_id UUID NOT NULL REFERENCES public.payment_mandates(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,

  -- Schedule
  scheduled_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NAD',

  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',    -- Waiting for due date
    'processing',   -- Being processed by DPO
    'completed',    -- Successfully deducted
    'failed',       -- Failed (will retry)
    'cancelled',    -- Cancelled before execution
    'skipped'       -- Skipped (e.g., loan paid off early)
  )),

  -- Retry tracking
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  failure_reason TEXT,

  -- Result
  transaction_id UUID, -- Link to deduction_transactions when completed

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_scheduled_deductions_mandate ON public.scheduled_deductions(mandate_id);
CREATE INDEX idx_scheduled_deductions_loan ON public.scheduled_deductions(loan_id);
CREATE INDEX idx_scheduled_deductions_date ON public.scheduled_deductions(scheduled_date);
CREATE INDEX idx_scheduled_deductions_status ON public.scheduled_deductions(status);
CREATE INDEX idx_scheduled_deductions_pending ON public.scheduled_deductions(scheduled_date, status)
WHERE status IN ('scheduled', 'failed');

-- ============================================
-- 4. Deduction Transactions (Payment History)
-- ============================================
CREATE TABLE IF NOT EXISTS public.deduction_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- References
  mandate_id UUID NOT NULL REFERENCES public.payment_mandates(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  scheduled_deduction_id UUID REFERENCES public.scheduled_deductions(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,

  -- Transaction details
  transaction_reference TEXT UNIQUE NOT NULL, -- Our reference
  dpo_transaction_id TEXT, -- DPO's transaction ID

  -- Amounts
  gross_amount DECIMAL(12,2) NOT NULL, -- Total charged to borrower
  platform_fee DECIMAL(12,2) NOT NULL, -- Our fee
  lender_amount DECIMAL(12,2) NOT NULL, -- Amount to lender
  currency TEXT NOT NULL DEFAULT 'NAD',

  -- Fee calculation
  platform_fee_percentage DECIMAL(5,4) NOT NULL DEFAULT 0.02, -- 2%

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Initiated
    'processing',   -- Being processed
    'success',      -- Completed successfully
    'failed',       -- Failed
    'refunded',     -- Refunded to borrower
    'disputed',     -- Borrower disputed
    'chargeback'    -- Bank reversed
  )),

  -- Failure info
  failure_code TEXT,
  failure_message TEXT,

  -- Split payment tracking
  lender_payout_status TEXT DEFAULT 'pending' CHECK (lender_payout_status IN (
    'pending',      -- Not yet paid to lender
    'processing',   -- Being transferred
    'completed',    -- Lender received funds
    'failed'        -- Payout failed
  )),
  lender_payout_reference TEXT,
  lender_paid_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_deduction_transactions_mandate ON public.deduction_transactions(mandate_id);
CREATE INDEX idx_deduction_transactions_loan ON public.deduction_transactions(loan_id);
CREATE INDEX idx_deduction_transactions_status ON public.deduction_transactions(status);
CREATE INDEX idx_deduction_transactions_dpo ON public.deduction_transactions(dpo_transaction_id);
CREATE INDEX idx_deduction_transactions_reference ON public.deduction_transactions(transaction_reference);

-- ============================================
-- 5. Webhook Logs (Audit Trail)
-- ============================================
CREATE TABLE IF NOT EXISTS public.payment_webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Source
  provider TEXT NOT NULL DEFAULT 'dpo', -- dpo, stripe, etc.
  event_type TEXT NOT NULL, -- payment.success, payment.failed, etc.

  -- Payload
  raw_payload JSONB NOT NULL,

  -- Processing
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,

  -- References (populated after processing)
  transaction_id UUID REFERENCES public.deduction_transactions(id),
  mandate_id UUID REFERENCES public.payment_mandates(id),

  -- Security
  signature_valid BOOLEAN,
  ip_address TEXT,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_webhook_logs_provider ON public.payment_webhook_logs(provider);
CREATE INDEX idx_webhook_logs_event ON public.payment_webhook_logs(event_type);
CREATE INDEX idx_webhook_logs_processed ON public.payment_webhook_logs(processed);
CREATE INDEX idx_webhook_logs_received ON public.payment_webhook_logs(received_at);

-- ============================================
-- 6. Lender Payout Settings
-- ============================================
CREATE TABLE IF NOT EXISTS public.lender_payout_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id) ON DELETE CASCADE UNIQUE,

  -- Bank details for payouts
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  bank_branch_code TEXT,
  bank_swift_code TEXT,

  -- DPO sub-merchant setup
  dpo_merchant_id TEXT, -- DPO's merchant ID for this lender
  dpo_setup_complete BOOLEAN DEFAULT FALSE,
  dpo_verification_status TEXT DEFAULT 'pending' CHECK (dpo_verification_status IN (
    'pending',
    'submitted',
    'verified',
    'rejected'
  )),

  -- Registration verification
  registration_number TEXT, -- NAMFISA, NCR, CBN number
  registration_verified BOOLEAN DEFAULT FALSE,
  registration_verified_at TIMESTAMPTZ,
  registration_document_url TEXT,

  -- Settings
  auto_payout_enabled BOOLEAN DEFAULT TRUE,
  minimum_payout_amount DECIMAL(12,2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. Enable RLS on all tables
-- ============================================
ALTER TABLE public.payment_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deduction_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lender_payout_settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. RLS Policies
-- ============================================

-- Payment Mandates: Lenders see their own
CREATE POLICY "Lenders can view own mandates" ON public.payment_mandates
  FOR SELECT USING (lender_id = auth.uid());

CREATE POLICY "Lenders can create mandates" ON public.payment_mandates
  FOR INSERT WITH CHECK (lender_id = auth.uid());

CREATE POLICY "Lenders can update own mandates" ON public.payment_mandates
  FOR UPDATE USING (lender_id = auth.uid());

-- Payment Methods: Linked to borrowers (accessed via lender relationship)
CREATE POLICY "Lenders can view borrower payment methods" ON public.payment_methods
  FOR SELECT USING (
    borrower_id IN (
      SELECT id FROM public.borrowers
      WHERE created_by_lender = auth.uid()
    )
  );

-- Scheduled Deductions: Lenders see their own
CREATE POLICY "Lenders can view own scheduled deductions" ON public.scheduled_deductions
  FOR SELECT USING (
    mandate_id IN (
      SELECT id FROM public.payment_mandates
      WHERE lender_id = auth.uid()
    )
  );

-- Deduction Transactions: Lenders see their own
CREATE POLICY "Lenders can view own transactions" ON public.deduction_transactions
  FOR SELECT USING (
    mandate_id IN (
      SELECT id FROM public.payment_mandates
      WHERE lender_id = auth.uid()
    )
  );

-- Payout Settings: Lenders manage their own
CREATE POLICY "Lenders can view own payout settings" ON public.lender_payout_settings
  FOR SELECT USING (lender_id = auth.uid());

CREATE POLICY "Lenders can update own payout settings" ON public.lender_payout_settings
  FOR ALL USING (lender_id = auth.uid());

-- Webhook logs: Admin only (handled via service role)

-- ============================================
-- 9. Functions
-- ============================================

-- Function to generate consent link token
CREATE OR REPLACE FUNCTION public.generate_consent_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;

-- Function to create a payment mandate
CREATE OR REPLACE FUNCTION public.create_payment_mandate(
  p_loan_id UUID,
  p_amount DECIMAL,
  p_frequency TEXT,
  p_deduction_day INTEGER,
  p_start_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_lender RECORD;
  v_loan RECORD;
  v_borrower RECORD;
  v_mandate_id UUID;
  v_consent_token TEXT;
  v_mandate_reference TEXT;
  v_tier TEXT;
BEGIN
  v_user_id := auth.uid();

  -- Get lender
  SELECT * INTO v_lender FROM public.lenders WHERE user_id = v_user_id;
  IF v_lender IS NULL THEN
    RAISE EXCEPTION 'Lender not found';
  END IF;

  -- Check if Business plan
  v_tier := public.get_effective_tier(v_user_id);
  IF v_tier != 'BUSINESS' THEN
    RAISE EXCEPTION 'Collections feature requires Business plan. Current plan: %', v_tier;
  END IF;

  -- Check lender has payout settings
  IF NOT EXISTS (
    SELECT 1 FROM public.lender_payout_settings
    WHERE lender_id = v_user_id AND dpo_setup_complete = TRUE
  ) THEN
    RAISE EXCEPTION 'Please complete your payout settings before setting up collections';
  END IF;

  -- Get loan
  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id;
  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Verify lender owns this loan
  IF v_loan.lender_id != v_user_id THEN
    RAISE EXCEPTION 'You do not own this loan';
  END IF;

  -- Check no active mandate exists
  IF EXISTS (
    SELECT 1 FROM public.payment_mandates
    WHERE loan_id = p_loan_id AND status IN ('pending_consent', 'active', 'paused')
  ) THEN
    RAISE EXCEPTION 'An active mandate already exists for this loan';
  END IF;

  -- Get borrower
  SELECT * INTO v_borrower FROM public.borrowers WHERE id = v_loan.borrower_id;

  -- Generate tokens
  v_consent_token := public.generate_consent_token();
  v_mandate_reference := 'MND-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8));

  -- Create mandate
  INSERT INTO public.payment_mandates (
    loan_id,
    borrower_id,
    lender_id,
    mandate_reference,
    amount,
    currency,
    frequency,
    deduction_day,
    start_date,
    consent_token,
    consent_token_expires_at,
    status
  ) VALUES (
    p_loan_id,
    v_borrower.id,
    v_user_id,
    v_mandate_reference,
    p_amount,
    v_lender.currency,
    p_frequency,
    p_deduction_day,
    p_start_date,
    v_consent_token,
    NOW() + INTERVAL '7 days',
    'pending_consent'
  )
  RETURNING id INTO v_mandate_id;

  RETURN jsonb_build_object(
    'success', true,
    'mandate_id', v_mandate_id,
    'mandate_reference', v_mandate_reference,
    'consent_token', v_consent_token,
    'consent_link', '/consent/' || v_consent_token,
    'expires_at', NOW() + INTERVAL '7 days',
    'message', 'Mandate created. Send consent link to borrower.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payment_mandate(UUID, DECIMAL, TEXT, INTEGER, DATE) TO authenticated;

-- Function to get mandate by consent token (public, for borrower consent page)
CREATE OR REPLACE FUNCTION public.get_mandate_for_consent(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mandate RECORD;
  v_borrower RECORD;
  v_lender RECORD;
  v_loan RECORD;
BEGIN
  -- Get mandate
  SELECT * INTO v_mandate FROM public.payment_mandates
  WHERE consent_token = p_token;

  IF v_mandate IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid or expired link');
  END IF;

  IF v_mandate.consent_token_expires_at < NOW() THEN
    RETURN jsonb_build_object('error', 'This link has expired. Please contact your lender for a new link.');
  END IF;

  IF v_mandate.status != 'pending_consent' THEN
    RETURN jsonb_build_object('error', 'Consent has already been processed');
  END IF;

  -- Get related data
  SELECT * INTO v_borrower FROM public.borrowers WHERE id = v_mandate.borrower_id;
  SELECT * INTO v_lender FROM public.lenders WHERE user_id = v_mandate.lender_id;
  SELECT * INTO v_loan FROM public.loans WHERE id = v_mandate.loan_id;

  RETURN jsonb_build_object(
    'mandate_id', v_mandate.id,
    'mandate_reference', v_mandate.mandate_reference,
    'amount', v_mandate.amount,
    'currency', v_mandate.currency,
    'frequency', v_mandate.frequency,
    'deduction_day', v_mandate.deduction_day,
    'start_date', v_mandate.start_date,
    'borrower_name', v_borrower.full_name,
    'lender_business_name', v_lender.business_name,
    'loan_amount', v_loan.amount,
    'loan_balance', v_loan.outstanding_balance
  );
END;
$$;

-- Allow anonymous access for consent page
GRANT EXECUTE ON FUNCTION public.get_mandate_for_consent(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_mandate_for_consent(TEXT) TO authenticated;

-- Function to submit borrower consent
CREATE OR REPLACE FUNCTION public.submit_borrower_consent(
  p_token TEXT,
  p_card_token TEXT,
  p_card_last_four TEXT,
  p_card_brand TEXT,
  p_card_expiry_month INTEGER,
  p_card_expiry_year INTEGER,
  p_card_holder_name TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mandate RECORD;
  v_payment_method_id UUID;
BEGIN
  -- Get mandate
  SELECT * INTO v_mandate FROM public.payment_mandates
  WHERE consent_token = p_token;

  IF v_mandate IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid link');
  END IF;

  IF v_mandate.consent_token_expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Link expired');
  END IF;

  IF v_mandate.status != 'pending_consent' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed');
  END IF;

  -- Create payment method
  INSERT INTO public.payment_methods (
    borrower_id,
    card_token,
    card_last_four,
    card_brand,
    card_expiry_month,
    card_expiry_year,
    card_holder_name,
    is_default
  ) VALUES (
    v_mandate.borrower_id,
    p_card_token,
    p_card_last_four,
    p_card_brand,
    p_card_expiry_month,
    p_card_expiry_year,
    p_card_holder_name,
    TRUE
  )
  RETURNING id INTO v_payment_method_id;

  -- Update mandate
  UPDATE public.payment_mandates
  SET
    status = 'active',
    consent_given_at = NOW(),
    consent_ip_address = p_ip_address,
    consent_user_agent = p_user_agent,
    consent_token = NULL, -- Invalidate token
    updated_at = NOW()
  WHERE id = v_mandate.id;

  -- Create first scheduled deduction
  INSERT INTO public.scheduled_deductions (
    mandate_id,
    loan_id,
    payment_method_id,
    scheduled_date,
    amount,
    currency,
    status
  ) VALUES (
    v_mandate.id,
    v_mandate.loan_id,
    v_payment_method_id,
    v_mandate.start_date,
    v_mandate.amount,
    v_mandate.currency,
    'scheduled'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Consent recorded successfully. Automatic deductions will begin on ' || v_mandate.start_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_borrower_consent(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_borrower_consent(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- Function to get lender's collection stats
CREATE OR REPLACE FUNCTION public.get_collection_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lender_id UUID;
  v_stats JSONB;
BEGIN
  -- lender_id is the same as user_id in the lenders table
  v_lender_id := p_user_id;

  SELECT jsonb_build_object(
    'active_mandates', (
      SELECT COUNT(*) FROM public.payment_mandates
      WHERE lender_id = v_lender_id AND status = 'active'
    ),
    'pending_consent', (
      SELECT COUNT(*) FROM public.payment_mandates
      WHERE lender_id = v_lender_id AND status = 'pending_consent'
    ),
    'total_collected_this_month', (
      SELECT COALESCE(SUM(gross_amount), 0) FROM public.deduction_transactions
      WHERE mandate_id IN (SELECT id FROM public.payment_mandates WHERE lender_id = v_lender_id)
      AND status = 'success'
      AND created_at >= DATE_TRUNC('month', NOW())
    ),
    'successful_this_month', (
      SELECT COUNT(*) FROM public.deduction_transactions
      WHERE mandate_id IN (SELECT id FROM public.payment_mandates WHERE lender_id = v_lender_id)
      AND status = 'success'
      AND created_at >= DATE_TRUNC('month', NOW())
    ),
    'failed_this_month', (
      SELECT COUNT(*) FROM public.deduction_transactions
      WHERE mandate_id IN (SELECT id FROM public.payment_mandates WHERE lender_id = v_lender_id)
      AND status = 'failed'
      AND created_at >= DATE_TRUNC('month', NOW())
    ),
    'upcoming_deductions', (
      SELECT COUNT(*) FROM public.scheduled_deductions
      WHERE mandate_id IN (SELECT id FROM public.payment_mandates WHERE lender_id = v_lender_id)
      AND status = 'scheduled'
      AND scheduled_date <= NOW() + INTERVAL '7 days'
    ),
    'next_deduction_date', (
      SELECT MIN(scheduled_date) FROM public.scheduled_deductions
      WHERE mandate_id IN (SELECT id FROM public.payment_mandates WHERE lender_id = v_lender_id)
      AND status = 'scheduled'
    )
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_collection_stats(UUID) TO authenticated;

-- Function to cancel a mandate
CREATE OR REPLACE FUNCTION public.cancel_mandate(p_mandate_id UUID, p_reason TEXT DEFAULT 'lender_cancelled')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_lender_id UUID;
  v_mandate RECORD;
BEGIN
  v_user_id := auth.uid();
  -- lender_id is the same as user_id in the lenders table
  v_lender_id := v_user_id;

  SELECT * INTO v_mandate FROM public.payment_mandates WHERE id = p_mandate_id;

  IF v_mandate IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mandate not found');
  END IF;

  IF v_mandate.lender_id != v_lender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_mandate.status IN ('completed', 'cancelled_borrower', 'cancelled_lender') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mandate already ended');
  END IF;

  -- Cancel mandate
  UPDATE public.payment_mandates
  SET
    status = 'cancelled_lender',
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = p_mandate_id;

  -- Cancel pending scheduled deductions
  UPDATE public.scheduled_deductions
  SET status = 'cancelled', updated_at = NOW()
  WHERE mandate_id = p_mandate_id AND status = 'scheduled';

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Mandate cancelled successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_mandate(UUID, TEXT) TO authenticated;

-- ============================================
-- 10. Comments
-- ============================================
COMMENT ON TABLE public.payment_mandates IS 'Debit order mandates - borrower consent for automatic deductions';
COMMENT ON TABLE public.payment_methods IS 'Tokenized card details for borrowers (never stores full card numbers)';
COMMENT ON TABLE public.scheduled_deductions IS 'Upcoming scheduled payment deductions';
COMMENT ON TABLE public.deduction_transactions IS 'History of all deduction attempts and results';
COMMENT ON TABLE public.payment_webhook_logs IS 'Audit log of all payment provider webhooks';
COMMENT ON TABLE public.lender_payout_settings IS 'Lender bank details and DPO sub-merchant settings';
