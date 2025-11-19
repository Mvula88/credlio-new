-- Loan Request Fraud Prevention System
-- Prevents double-funding, request spam, and ensures disbursement proof

-- Step 1: Add 'expired' to request_status enum
ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'expired';

-- Step 2: Add 'pending' and 'disputed' to loan_status enum
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'disputed';

-- Step 3: Add new columns to loan_requests table
ALTER TABLE public.loan_requests ADD COLUMN IF NOT EXISTS accepted_offer_id UUID REFERENCES public.loan_offers(id);
ALTER TABLE public.loan_requests ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.loan_requests ADD COLUMN IF NOT EXISTS closed_by UUID;
ALTER TABLE public.loan_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Step 4: Add disbursement proof fields to loans table
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursement_proof_hash TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursement_method TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursement_reference TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursement_confirmed_by_borrower BOOLEAN DEFAULT FALSE;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursement_confirmed_at TIMESTAMPTZ;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursement_disputed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursement_dispute_reason TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursement_dispute_at TIMESTAMPTZ;

-- Step 5: Create request_cancellations tracking table
CREATE TABLE IF NOT EXISTS public.request_cancellations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  cancelled_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  month_year TEXT NOT NULL -- Format: YYYY-MM for counting monthly cancellations
);

CREATE INDEX IF NOT EXISTS idx_cancellations_borrower_month
  ON public.request_cancellations(borrower_id, month_year);

-- Step 6: Create function to check if borrower can create new request
CREATE OR REPLACE FUNCTION public.can_borrower_create_request(p_borrower_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_requests INT;
  v_recent_cancellations INT;
  v_last_rejection TIMESTAMPTZ;
  v_hours_since_rejection NUMERIC;
  v_result JSONB;
BEGIN
  -- Check 1: No more than 1 active request at a time
  SELECT COUNT(*) INTO v_active_requests
  FROM public.loan_requests
  WHERE borrower_id = p_borrower_id
    AND status = 'open'
    AND (expires_at IS NULL OR expires_at > NOW());

  IF v_active_requests > 0 THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'You already have an active loan request. Please wait until it is closed or expired.'
    );
  END IF;

  -- Check 2: Maximum 2 cancellations per month
  SELECT COUNT(*) INTO v_recent_cancellations
  FROM public.request_cancellations
  WHERE borrower_id = p_borrower_id
    AND month_year = TO_CHAR(NOW(), 'YYYY-MM');

  IF v_recent_cancellations >= 2 THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'You have reached the maximum of 2 request cancellations this month. Please wait until next month.'
    );
  END IF;

  -- Check 3: 24-hour cooling period after all offers rejected
  SELECT lr.updated_at INTO v_last_rejection
  FROM public.loan_requests lr
  WHERE lr.borrower_id = p_borrower_id
    AND lr.status = 'cancelled'
    AND lr.cancelled_at IS NOT NULL
  ORDER BY lr.cancelled_at DESC
  LIMIT 1;

  IF v_last_rejection IS NOT NULL THEN
    v_hours_since_rejection := EXTRACT(EPOCH FROM (NOW() - v_last_rejection)) / 3600;

    IF v_hours_since_rejection < 24 THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'reason', FORMAT('You must wait %s more hours before creating a new request after cancelling.',
                        CEIL(24 - v_hours_since_rejection)::TEXT),
        'hours_remaining', CEIL(24 - v_hours_since_rejection)
      );
    END IF;
  END IF;

  -- All checks passed
  RETURN jsonb_build_object('allowed', TRUE);
END;
$$;

-- Step 7: Create function to close loan request (prevent double-funding)
CREATE OR REPLACE FUNCTION public.close_loan_request(
  p_request_id UUID,
  p_offer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lender_id UUID;
  v_request record;
  v_offer record;
BEGIN
  -- Get current user (lender)
  v_lender_id := auth.uid();

  -- Verify lender owns the offer
  SELECT * INTO v_offer
  FROM public.loan_offers
  WHERE id = p_offer_id
    AND lender_id = v_lender_id;

  IF v_offer IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Offer not found or you do not own this offer'
    );
  END IF;

  -- Get request and lock it for update (prevents race conditions)
  SELECT * INTO v_request
  FROM public.loan_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Loan request not found'
    );
  END IF;

  -- Check if request is already closed
  IF v_request.status != 'open' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', FORMAT('This request is already %s', v_request.status)
    );
  END IF;

  -- Mark request as accepted and close it
  UPDATE public.loan_requests
  SET
    status = 'accepted',
    accepted_offer_id = p_offer_id,
    closed_at = NOW(),
    closed_by = v_lender_id
  WHERE id = p_request_id;

  -- Update the accepted offer status
  UPDATE public.loan_offers
  SET status = 'accepted'
  WHERE id = p_offer_id;

  -- Reject all other offers
  UPDATE public.loan_offers
  SET status = 'rejected'
  WHERE request_id = p_request_id
    AND id != p_offer_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Loan request closed successfully. Other lenders have been notified.'
  );
END;
$$;

-- Step 8: Create function to confirm disbursement by borrower
CREATE OR REPLACE FUNCTION public.confirm_disbursement(
  p_loan_id UUID,
  p_received BOOLEAN,
  p_dispute_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_id UUID;
  v_loan record;
BEGIN
  -- Get current user (borrower)
  v_borrower_id := auth.uid();

  -- Get loan
  SELECT * INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON l.borrower_id = b.id
  WHERE l.id = p_loan_id
    AND b.user_id = v_borrower_id;

  IF v_loan IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Loan not found or you are not the borrower'
    );
  END IF;

  -- Check if already confirmed
  IF v_loan.disbursement_confirmed_by_borrower THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Disbursement already confirmed'
    );
  END IF;

  IF p_received THEN
    -- Borrower confirms receipt
    UPDATE public.loans
    SET
      disbursement_confirmed_by_borrower = TRUE,
      disbursement_confirmed_at = NOW(),
      status = 'active'
    WHERE id = p_loan_id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'Disbursement confirmed. Your loan is now active.'
    );
  ELSE
    -- Borrower disputes - didn't receive money
    UPDATE public.loans
    SET
      disbursement_disputed = TRUE,
      disbursement_dispute_reason = p_dispute_reason,
      disbursement_dispute_at = NOW(),
      status = 'disputed'
    WHERE id = p_loan_id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'Dispute recorded. An admin will review this case.'
    );
  END IF;
END;
$$;

-- Step 9: Create trigger to auto-expire old requests
CREATE OR REPLACE FUNCTION public.expire_old_loan_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.loan_requests
  SET status = 'expired'
  WHERE status = 'open'
    AND created_at < NOW() - INTERVAL '7 days'
    AND expires_at IS NULL;

  -- Set expires_at for newly created requests
  UPDATE public.loan_requests
  SET expires_at = created_at + INTERVAL '7 days'
  WHERE expires_at IS NULL;
END;
$$;

-- Step 10: Create trigger to prevent multiple active requests
CREATE OR REPLACE FUNCTION public.check_borrower_active_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_check_result JSONB;
BEGIN
  -- Only check on INSERT
  IF TG_OP = 'INSERT' THEN
    v_check_result := can_borrower_create_request(NEW.borrower_id);

    IF NOT (v_check_result->>'allowed')::BOOLEAN THEN
      RAISE EXCEPTION '%', v_check_result->>'reason';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_single_active_request ON public.loan_requests;
CREATE TRIGGER enforce_single_active_request
  BEFORE INSERT ON public.loan_requests
  FOR EACH ROW
  EXECUTE FUNCTION check_borrower_active_requests();

-- Step 11: Auto-confirm disbursement after 48 hours
CREATE OR REPLACE FUNCTION public.auto_confirm_disbursements()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.loans
  SET
    disbursement_confirmed_by_borrower = TRUE,
    disbursement_confirmed_at = NOW(),
    status = 'active'
  WHERE status = 'pending'
    AND disbursement_confirmed_by_borrower = FALSE
    AND disbursement_disputed = FALSE
    AND created_at < NOW() - INTERVAL '48 hours';
END;
$$;

-- Step 12: Add RLS policies for new tables
ALTER TABLE public.request_cancellations ENABLE ROW LEVEL SECURITY;

-- Borrowers can view their own cancellations
CREATE POLICY "Borrowers can view own cancellations"
  ON public.request_cancellations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id
        AND b.user_id = auth.uid()
    )
  );

-- Lenders can view cancellations (for risk assessment)
CREATE POLICY "Lenders can view all cancellations"
  ON public.request_cancellations
  FOR SELECT
  USING (jwt_role() = 'lender');

-- System can insert cancellations
CREATE POLICY "System can insert cancellations"
  ON public.request_cancellations
  FOR INSERT
  WITH CHECK (TRUE);

-- Step 13: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_loan_requests_status ON public.loan_requests(status);
CREATE INDEX IF NOT EXISTS idx_loan_requests_borrower_status ON public.loan_requests(borrower_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_requests_expires ON public.loan_requests(expires_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_loans_disbursement_status ON public.loans(disbursement_confirmed_by_borrower, status);

COMMENT ON FUNCTION public.can_borrower_create_request IS 'Checks if borrower is allowed to create a new loan request (fraud prevention)';
COMMENT ON FUNCTION public.close_loan_request IS 'Closes a loan request and prevents double-funding';
COMMENT ON FUNCTION public.confirm_disbursement IS 'Borrower confirms receipt of loan funds or disputes non-receipt';
COMMENT ON FUNCTION public.expire_old_loan_requests IS 'Auto-expires loan requests older than 7 days (run via cron)';
COMMENT ON FUNCTION public.auto_confirm_disbursements IS 'Auto-confirms disbursements after 48 hours if borrower hasn''t responded (run via cron)';
