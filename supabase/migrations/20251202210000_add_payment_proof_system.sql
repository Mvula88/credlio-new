-- Payment Proof System
-- Allows borrowers to submit proof of payment for lender approval
-- Also notifies borrowers when lenders record/confirm payments

-- ============================================================================
-- 1. CREATE payment_proofs TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,

  -- Payment details
  amount DECIMAL(15, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL, -- 'mobile_money', 'bank_transfer', 'cash', 'other'
  reference_number TEXT, -- Transaction ID, receipt number, etc.

  -- Proof file
  proof_url TEXT, -- URL to uploaded proof image/document
  notes TEXT, -- Borrower's notes about the payment

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_proofs_loan_id ON public.payment_proofs(loan_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_borrower_id ON public.payment_proofs(borrower_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON public.payment_proofs(status);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_created_at ON public.payment_proofs(created_at DESC);

-- Enable RLS
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- Borrowers can view their own payment proofs
CREATE POLICY "Borrowers can view their own payment proofs"
  ON public.payment_proofs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.borrower_user_links bul
      WHERE bul.borrower_id = payment_proofs.borrower_id
      AND bul.user_id = auth.uid()
    )
  );

-- Borrowers can create payment proofs for their loans
CREATE POLICY "Borrowers can submit payment proofs"
  ON public.payment_proofs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.borrower_user_links bul
      WHERE bul.borrower_id = payment_proofs.borrower_id
      AND bul.user_id = auth.uid()
    )
  );

-- Lenders can view payment proofs for their loans
CREATE POLICY "Lenders can view payment proofs for their loans"
  ON public.payment_proofs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = payment_proofs.loan_id
      AND l.lender_id = auth.uid()
    )
  );

-- Lenders can update payment proofs (approve/reject)
CREATE POLICY "Lenders can update payment proofs for their loans"
  ON public.payment_proofs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = payment_proofs.loan_id
      AND l.lender_id = auth.uid()
    )
  );


-- ============================================================================
-- 2. CREATE FUNCTION FOR BORROWER TO SUBMIT PAYMENT PROOF
-- ============================================================================

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
    '/l/repayments?proof=' || v_proof_id,
    'lender'
  );

  RETURN v_proof_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, DECIMAL, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================================
-- 3. CREATE FUNCTION FOR LENDER TO APPROVE/REJECT PAYMENT PROOF
-- ============================================================================

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

GRANT EXECUTE ON FUNCTION public.review_payment_proof(UUID, TEXT, TEXT) TO authenticated;


-- ============================================================================
-- 4. UPDATE process_repayment TO NOTIFY BORROWER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_repayment(
  p_loan_id UUID,
  p_amount DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_loan RECORD;
  v_total_due DECIMAL;
  v_new_total_repaid DECIMAL;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
BEGIN
  -- Get loan details
  SELECT
    l.id, l.lender_id, l.borrower_id, l.status, l.currency,
    COALESCE(l.total_repaid, 0) as total_repaid,
    b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE l.id = p_loan_id;

  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Check caller is the lender
  IF v_loan.lender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the lender can process repayments for their loans';
  END IF;

  -- Check loan is active
  IF v_loan.status != 'active' THEN
    RAISE EXCEPTION 'Can only process repayments for active loans';
  END IF;

  -- Update total_repaid
  v_new_total_repaid := v_loan.total_repaid + p_amount;

  UPDATE public.loans
  SET
    total_repaid = v_new_total_repaid,
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- Calculate total due from repayment schedules
  SELECT COALESCE(SUM(amount_due_minor), 0) / 100.0 INTO v_total_due
  FROM public.repayment_schedules
  WHERE loan_id = p_loan_id;

  -- Get currency symbol
  v_currency_symbol := CASE
    WHEN v_loan.currency = 'USD' THEN '$'
    WHEN v_loan.currency = 'KES' THEN 'KSh'
    WHEN v_loan.currency = 'UGX' THEN 'USh'
    WHEN v_loan.currency = 'TZS' THEN 'TSh'
    WHEN v_loan.currency = 'RWF' THEN 'FRw'
    WHEN v_loan.currency = 'NGN' THEN 'N'
    WHEN v_loan.currency = 'GHS' THEN 'GHC'
    WHEN v_loan.currency = 'ZAR' THEN 'R'
    WHEN v_loan.currency = 'EUR' THEN 'EUR'
    WHEN v_loan.currency = 'GBP' THEN 'GBP'
    ELSE v_loan.currency || ' '
  END;

  -- Notify lender about payment received
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    link,
    target_role
  ) VALUES (
    v_loan.lender_id,
    'payment_received',
    'Payment Recorded',
    v_currency_symbol || p_amount::TEXT || ' recorded from ' || v_loan.borrower_name,
    '/l/repayments',
    'lender'
  );

  -- Get borrower user_id and notify them about the payment update
  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id
  LIMIT 1;

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
      'Payment Updated',
      'Your lender recorded a payment of ' || v_currency_symbol || p_amount::TEXT || '. Your loan balance has been updated.',
      '/b/loans',
      'borrower'
    );
  END IF;

  -- Check if loan is fully paid
  IF v_new_total_repaid >= v_total_due AND v_total_due > 0 THEN
    -- Mark loan as completed
    UPDATE public.loans
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_loan_id;

    -- Notify lender about loan completion
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      link,
      target_role
    ) VALUES (
      v_loan.lender_id,
      'loan_completed',
      'Loan Fully Repaid',
      'Loan to ' || v_loan.borrower_name || ' has been fully repaid!',
      '/l/loans/' || p_loan_id,
      'lender'
    );

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
        'loan_completed',
        'Loan Fully Repaid',
        'Congratulations! Your loan has been fully repaid.',
        '/b/loans',
        'borrower'
      );
    END IF;

    -- Update borrower credit score positively
    UPDATE public.borrowers
    SET
      credit_score = LEAST(COALESCE(credit_score, 500) + 25, 850),
      updated_at = NOW()
    WHERE id = v_loan.borrower_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. CREATE updated_at TRIGGER FOR payment_proofs
-- ============================================================================

CREATE TRIGGER update_payment_proofs_updated_at
  BEFORE UPDATE ON public.payment_proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Payment proof system migration completed successfully';
  RAISE NOTICE 'Created: payment_proofs table, submit_payment_proof function, review_payment_proof function';
  RAISE NOTICE 'Updated: process_repayment function now notifies borrowers';
END $$;
