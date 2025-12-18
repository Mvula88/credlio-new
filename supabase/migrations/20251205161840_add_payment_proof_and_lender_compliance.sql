-- Lender Compliance System
-- Holds lenders accountable for recording payments on time
-- Note: payment_proofs table already exists from 20251202210000_add_payment_proof_system.sql

-- ============================================
-- 1. LENDER COMPLIANCE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.lender_compliance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  total_loans INTEGER DEFAULT 0,
  active_loans INTEGER DEFAULT 0,
  payment_proofs_received INTEGER DEFAULT 0,
  payment_proofs_approved INTEGER DEFAULT 0,
  payment_proofs_rejected INTEGER DEFAULT 0,
  avg_proof_response_hours DECIMAL(8,2) DEFAULT 0,
  avg_recording_delay_days DECIMAL(5,2) DEFAULT 0,
  compliance_score INTEGER DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'good' CHECK (status IN ('good', 'warning', 'probation', 'suspended', 'banned')),
  warning_count INTEGER DEFAULT 0,
  last_warning_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspended_until TIMESTAMPTZ,
  banned_at TIMESTAMPTZ,
  ban_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lender_compliance ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Lenders can view own compliance" ON public.lender_compliance;
DROP POLICY IF EXISTS "Admins can manage compliance" ON public.lender_compliance;

CREATE POLICY "Lenders can view own compliance" ON public.lender_compliance
  FOR SELECT USING (lender_id = auth.uid());

CREATE POLICY "Admins can manage compliance" ON public.lender_compliance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 2. LENDER WARNINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.lender_warnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_by UUID REFERENCES auth.users(id),
  warning_type TEXT NOT NULL CHECK (warning_type IN (
    'late_payment_recording', 'unresponsive_to_proofs', 'high_rejection_rate',
    'dispute_pattern', 'borrower_complaints', 'policy_violation', 'other'
  )),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('notice', 'warning', 'final_warning', 'suspension', 'ban')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  related_loan_id UUID REFERENCES public.loans(id),
  acknowledged_at TIMESTAMPTZ,
  response TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lender_warnings_lender_id ON public.lender_warnings(lender_id);

ALTER TABLE public.lender_warnings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Lenders can view own warnings" ON public.lender_warnings;
DROP POLICY IF EXISTS "Lenders can acknowledge warnings" ON public.lender_warnings;
DROP POLICY IF EXISTS "Admins can manage warnings" ON public.lender_warnings;

CREATE POLICY "Lenders can view own warnings" ON public.lender_warnings
  FOR SELECT USING (lender_id = auth.uid());

CREATE POLICY "Lenders can acknowledge warnings" ON public.lender_warnings
  FOR UPDATE USING (lender_id = auth.uid());

CREATE POLICY "Admins can manage warnings" ON public.lender_warnings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 3. ADMIN WARNING FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_issue_warning(
  p_lender_id UUID, p_warning_type TEXT, p_severity TEXT, p_title TEXT, p_description TEXT
) RETURNS JSON AS $$
DECLARE v_warning_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can issue warnings';
  END IF;

  INSERT INTO public.lender_warnings (lender_id, issued_by, warning_type, severity, title, description)
  VALUES (p_lender_id, auth.uid(), p_warning_type, p_severity, p_title, p_description) RETURNING id INTO v_warning_id;

  UPDATE public.lender_compliance SET
    warning_count = warning_count + 1, last_warning_at = NOW(),
    status = CASE WHEN p_severity = 'ban' THEN 'banned' WHEN p_severity = 'suspension' THEN 'suspended'
      WHEN p_severity = 'final_warning' THEN 'probation' ELSE 'warning' END,
    banned_at = CASE WHEN p_severity = 'ban' THEN NOW() ELSE banned_at END,
    ban_reason = CASE WHEN p_severity = 'ban' THEN p_description ELSE ban_reason END,
    suspended_at = CASE WHEN p_severity = 'suspension' THEN NOW() ELSE suspended_at END,
    suspended_until = CASE WHEN p_severity = 'suspension' THEN NOW() + INTERVAL '7 days' ELSE suspended_until END,
    updated_at = NOW()
  WHERE lender_id = p_lender_id;

  IF NOT FOUND THEN
    INSERT INTO public.lender_compliance (lender_id, warning_count, last_warning_at, status, banned_at, ban_reason, suspended_at, suspended_until)
    VALUES (p_lender_id, 1, NOW(),
      CASE WHEN p_severity = 'ban' THEN 'banned' WHEN p_severity = 'suspension' THEN 'suspended'
        WHEN p_severity = 'final_warning' THEN 'probation' ELSE 'warning' END,
      CASE WHEN p_severity = 'ban' THEN NOW() ELSE NULL END,
      CASE WHEN p_severity = 'ban' THEN p_description ELSE NULL END,
      CASE WHEN p_severity = 'suspension' THEN NOW() ELSE NULL END,
      CASE WHEN p_severity = 'suspension' THEN NOW() + INTERVAL '7 days' ELSE NULL END);
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
  VALUES (p_lender_id, 'compliance_warning', p_title, p_description, '/l/settings', 'lender');

  RETURN json_build_object('success', TRUE, 'warning_id', v_warning_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_issue_warning TO authenticated;

-- ============================================
-- 4. UPDATE review_payment_proof TO TRACK COMPLIANCE
-- ============================================

CREATE OR REPLACE FUNCTION public.review_payment_proof(
  p_proof_id UUID,
  p_action TEXT, -- 'approve' or 'reject'
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_proof RECORD;
  v_borrower_user_id UUID;
  v_currency TEXT;
  v_currency_symbol TEXT;
  v_current_user_id UUID;
BEGIN
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action. Must be "approve" or "reject"';
  END IF;

  -- Get proof details with loan info
  SELECT
    pp.*,
    l.lender_id,
    l.currency,
    b.full_name as borrower_name
  INTO v_proof
  FROM public.payment_proofs pp
  JOIN public.loans l ON l.id = pp.loan_id
  JOIN public.borrowers b ON b.id = pp.borrower_id
  WHERE pp.id = p_proof_id;

  IF v_proof IS NULL THEN
    RAISE EXCEPTION 'Payment proof not found';
  END IF;

  -- Verify caller is the lender
  IF v_proof.lender_id != v_current_user_id THEN
    RAISE EXCEPTION 'Only the lender can review this payment proof';
  END IF;

  -- Check proof is still pending
  IF v_proof.status != 'pending' THEN
    RAISE EXCEPTION 'This payment proof has already been reviewed';
  END IF;

  -- Get currency symbol
  v_currency_symbol := CASE
    WHEN v_proof.currency = 'USD' THEN '$'
    WHEN v_proof.currency = 'KES' THEN 'KSh'
    WHEN v_proof.currency = 'UGX' THEN 'USh'
    WHEN v_proof.currency = 'TZS' THEN 'TSh'
    WHEN v_proof.currency = 'RWF' THEN 'FRw'
    WHEN v_proof.currency = 'NGN' THEN 'N'
    WHEN v_proof.currency = 'GHS' THEN 'GHC'
    WHEN v_proof.currency = 'ZAR' THEN 'R'
    WHEN v_proof.currency = 'EUR' THEN 'EUR'
    WHEN v_proof.currency = 'GBP' THEN 'GBP'
    ELSE v_proof.currency || ' '
  END;

  -- Get borrower user_id for notification
  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_proof.borrower_id
  LIMIT 1;

  IF p_action = 'approve' THEN
    -- Update proof status
    UPDATE public.payment_proofs
    SET
      status = 'approved',
      reviewed_by = v_current_user_id,
      reviewed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_proof_id;

    -- Process the repayment (this updates loan totals and sends notifications)
    PERFORM public.process_repayment(v_proof.loan_id, v_proof.amount);

    -- Update lender compliance stats
    UPDATE public.lender_compliance
    SET payment_proofs_approved = payment_proofs_approved + 1, updated_at = NOW()
    WHERE lender_id = v_current_user_id;

    IF NOT FOUND THEN
      INSERT INTO public.lender_compliance (lender_id, payment_proofs_approved)
      VALUES (v_current_user_id, 1);
    END IF;

    -- Notify borrower that payment was confirmed
    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        link,
        target_role
      ) VALUES (
        v_borrower_user_id,
        'payment_confirmed',
        'Payment Confirmed',
        'Your payment of ' || v_currency_symbol || v_proof.amount::TEXT || ' has been confirmed by your lender.',
        '/b/loans',
        'borrower'
      );
    END IF;

  ELSE -- reject
    -- Update proof status
    UPDATE public.payment_proofs
    SET
      status = 'rejected',
      reviewed_by = v_current_user_id,
      reviewed_at = NOW(),
      rejection_reason = p_rejection_reason,
      updated_at = NOW()
    WHERE id = p_proof_id;

    -- Update lender compliance stats
    UPDATE public.lender_compliance
    SET payment_proofs_rejected = payment_proofs_rejected + 1, updated_at = NOW()
    WHERE lender_id = v_current_user_id;

    IF NOT FOUND THEN
      INSERT INTO public.lender_compliance (lender_id, payment_proofs_rejected)
      VALUES (v_current_user_id, 1);
    END IF;

    -- Notify borrower that payment was rejected
    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        link,
        target_role
      ) VALUES (
        v_borrower_user_id,
        'payment_rejected',
        'Payment Proof Rejected',
        'Your payment proof was rejected. Reason: ' || COALESCE(p_rejection_reason, 'Not specified'),
        '/b/loans',
        'borrower'
      );
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. UPDATE submit_payment_proof TO TRACK COMPLIANCE
-- ============================================

CREATE OR REPLACE FUNCTION public.submit_payment_proof(
  p_loan_id UUID,
  p_amount DECIMAL,
  p_payment_date DATE,
  p_payment_method TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_borrower_id UUID;
  v_lender_id UUID;
  v_borrower_name TEXT;
  v_currency TEXT;
  v_currency_symbol TEXT;
  v_proof_id UUID;
  v_current_user_id UUID;
BEGIN
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get loan details
  SELECT l.borrower_id, l.lender_id, l.currency, b.full_name
  INTO v_borrower_id, v_lender_id, v_currency, v_borrower_name
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE l.id = p_loan_id;

  IF v_borrower_id IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Verify caller is linked to this borrower
  IF NOT EXISTS (
    SELECT 1 FROM public.borrower_user_links bul
    WHERE bul.borrower_id = v_borrower_id
    AND bul.user_id = v_current_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You are not the borrower for this loan';
  END IF;

  -- Get currency symbol
  v_currency_symbol := CASE
    WHEN v_currency = 'USD' THEN '$'
    WHEN v_currency = 'KES' THEN 'KSh'
    WHEN v_currency = 'UGX' THEN 'USh'
    WHEN v_currency = 'TZS' THEN 'TSh'
    WHEN v_currency = 'RWF' THEN 'FRw'
    WHEN v_currency = 'NGN' THEN 'N'
    WHEN v_currency = 'GHS' THEN 'GHC'
    WHEN v_currency = 'ZAR' THEN 'R'
    WHEN v_currency = 'EUR' THEN 'EUR'
    WHEN v_currency = 'GBP' THEN 'GBP'
    ELSE v_currency || ' '
  END;

  -- Create the payment proof record
  INSERT INTO public.payment_proofs (
    loan_id,
    borrower_id,
    amount,
    payment_date,
    payment_method,
    reference_number,
    proof_url,
    notes,
    status
  ) VALUES (
    p_loan_id,
    v_borrower_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_reference_number,
    p_proof_url,
    p_notes,
    'pending'
  )
  RETURNING id INTO v_proof_id;

  -- Notify lender about new payment proof
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    link,
    target_role
  ) VALUES (
    v_lender_id,
    'payment_proof_submitted',
    'Payment Proof Submitted',
    v_borrower_name || ' submitted proof of payment: ' || v_currency_symbol || p_amount::TEXT,
    '/l/loans/' || p_loan_id,
    'lender'
  );

  -- Update lender compliance stats
  UPDATE public.lender_compliance
  SET payment_proofs_received = payment_proofs_received + 1, updated_at = NOW()
  WHERE lender_id = v_lender_id;

  IF NOT FOUND THEN
    INSERT INTO public.lender_compliance (lender_id, payment_proofs_received)
    VALUES (v_lender_id, 1);
  END IF;

  RETURN v_proof_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Lender compliance system migration completed successfully';
  RAISE NOTICE 'Created: lender_compliance table, lender_warnings table, admin_issue_warning function';
  RAISE NOTICE 'Updated: submit_payment_proof and review_payment_proof functions now track compliance';
END $$;
