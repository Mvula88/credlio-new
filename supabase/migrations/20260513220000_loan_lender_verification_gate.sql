-- Loan activation verification gate
--
-- WHY: per the founder's policy, a loan must not become 'active' (which is
-- when repayment tracking starts) until the lender has explicitly confirmed
-- three things on the lender dashboard:
--   1. All requested documents have been received and look authentic.
--   2. The borrower's video attestation has been reviewed.
--   3. The metadata / risk flags on the borrower's selfie have been
--      reviewed (any unresolved high-risk signal is acknowledged).
--
-- The current loan flow is:
--   pending_offer → pending_signatures → pending_disbursement → active
-- Active is reached when the borrower confirms receipt of funds, which
-- requires the lender to have first submitted disbursement proof. We gate
-- `submit_disbursement_proof` so the lender cannot send money — and
-- therefore the loan cannot reach active — until they've checked all
-- three boxes on the verification checklist.

BEGIN;

-- 1. Track the three lender-confirmed verification steps per loan.
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS lender_docs_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lender_video_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lender_metadata_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lender_docs_verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS lender_video_verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS lender_metadata_verification_notes TEXT;

COMMENT ON COLUMN public.loans.lender_docs_verified_at IS
  'Set when the lender confirms on the dashboard that all requested documents have been received and reviewed.';
COMMENT ON COLUMN public.loans.lender_video_verified_at IS
  'Set when the lender confirms the video attestation has been reviewed and matches the loan request.';
COMMENT ON COLUMN public.loans.lender_metadata_verified_at IS
  'Set when the lender acknowledges the borrower''s metadata/risk flags have been reviewed.';

-- 2. RPC for the lender to mark a single verification step done.
CREATE OR REPLACE FUNCTION public.mark_loan_verification_step(
  p_loan_id UUID,
  p_step TEXT,     -- 'docs', 'video', or 'metadata'
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lender UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lender_id, status::TEXT INTO v_lender, v_status
  FROM public.loans
  WHERE id = p_loan_id;

  IF v_lender IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF v_lender <> auth.uid() THEN
    RAISE EXCEPTION 'Only the lender on this loan can mark verification steps';
  END IF;

  -- Verification can only be performed while the loan is pre-active.
  -- Once active, the gate has already passed and notes should go elsewhere.
  IF v_status NOT IN ('pending_offer', 'pending_signatures', 'pending_disbursement') THEN
    RAISE EXCEPTION 'Loan is past the verification stage (status: %)', v_status;
  END IF;

  IF p_step = 'docs' THEN
    UPDATE public.loans
    SET lender_docs_verified_at = NOW(),
        lender_docs_verification_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_loan_id;
  ELSIF p_step = 'video' THEN
    UPDATE public.loans
    SET lender_video_verified_at = NOW(),
        lender_video_verification_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_loan_id;
  ELSIF p_step = 'metadata' THEN
    UPDATE public.loans
    SET lender_metadata_verified_at = NOW(),
        lender_metadata_verification_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_loan_id;
  ELSE
    RAISE EXCEPTION 'Unknown verification step: % (expected docs, video, or metadata)', p_step;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_loan_verification_step(UUID, TEXT, TEXT) TO authenticated;

-- 3. RPC for the lender to clear (un-mark) a verification step. Useful if
-- they ticked something by mistake or want to redo the review.
CREATE OR REPLACE FUNCTION public.unmark_loan_verification_step(
  p_loan_id UUID,
  p_step TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lender UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lender_id, status::TEXT INTO v_lender, v_status
  FROM public.loans WHERE id = p_loan_id;

  IF v_lender IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF v_lender <> auth.uid() THEN
    RAISE EXCEPTION 'Only the lender can clear verification steps';
  END IF;
  IF v_status NOT IN ('pending_offer', 'pending_signatures', 'pending_disbursement') THEN
    RAISE EXCEPTION 'Loan is past the verification stage';
  END IF;

  IF p_step = 'docs' THEN
    UPDATE public.loans
    SET lender_docs_verified_at = NULL, lender_docs_verification_notes = NULL, updated_at = NOW()
    WHERE id = p_loan_id;
  ELSIF p_step = 'video' THEN
    UPDATE public.loans
    SET lender_video_verified_at = NULL, lender_video_verification_notes = NULL, updated_at = NOW()
    WHERE id = p_loan_id;
  ELSIF p_step = 'metadata' THEN
    UPDATE public.loans
    SET lender_metadata_verified_at = NULL, lender_metadata_verification_notes = NULL, updated_at = NOW()
    WHERE id = p_loan_id;
  ELSE
    RAISE EXCEPTION 'Unknown step';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unmark_loan_verification_step(UUID, TEXT) TO authenticated;

-- 4. The actual gate: re-wrap submit_disbursement_proof so it refuses to
-- proceed until all three verification columns are set. Everything else
-- about the existing function is preserved.
CREATE OR REPLACE FUNCTION public.submit_disbursement_proof(
  p_loan_id UUID,
  p_amount DECIMAL,
  p_method TEXT,
  p_reference TEXT DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
  v_missing TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT l.*, b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE l.id = p_loan_id;

  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF v_loan.lender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the lender can submit disbursement proof';
  END IF;
  IF v_loan.status != 'pending_disbursement' THEN
    RAISE EXCEPTION 'Loan is not awaiting disbursement (status: %)', v_loan.status;
  END IF;

  -- THE GATE: all three lender verification steps must be marked complete.
  v_missing := ARRAY[]::TEXT[];
  IF v_loan.lender_docs_verified_at IS NULL THEN
    v_missing := v_missing || 'documents';
  END IF;
  IF v_loan.lender_video_verified_at IS NULL THEN
    v_missing := v_missing || 'video attestation';
  END IF;
  IF v_loan.lender_metadata_verified_at IS NULL THEN
    v_missing := v_missing || 'metadata / risk flags';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot disburse until verification is complete. Still missing: %', array_to_string(v_missing, ', ');
  END IF;

  v_currency_symbol := CASE
    WHEN v_loan.currency = 'USD' THEN '$'
    WHEN v_loan.currency = 'KES' THEN 'KSh'
    WHEN v_loan.currency = 'UGX' THEN 'USh'
    WHEN v_loan.currency = 'TZS' THEN 'TSh'
    WHEN v_loan.currency = 'RWF' THEN 'FRw'
    WHEN v_loan.currency = 'NGN' THEN 'N'
    WHEN v_loan.currency = 'GHS' THEN 'GHC'
    WHEN v_loan.currency = 'ZAR' THEN 'R'
    ELSE v_loan.currency || ' '
  END;

  UPDATE public.disbursement_proofs
  SET
    lender_proof_url = p_proof_url,
    lender_proof_method = p_method,
    lender_proof_reference = p_reference,
    lender_proof_amount = p_amount,
    lender_proof_date = CURRENT_DATE,
    lender_proof_notes = p_notes,
    lender_submitted_at = NOW(),
    updated_at = NOW()
  WHERE loan_id = p_loan_id;

  IF NOT FOUND THEN
    INSERT INTO public.disbursement_proofs (
      loan_id, lender_proof_url, lender_proof_method, lender_proof_reference,
      lender_proof_amount, lender_proof_date, lender_proof_notes, lender_submitted_at
    ) VALUES (
      p_loan_id, p_proof_url, p_method, p_reference,
      p_amount, CURRENT_DATE, p_notes, NOW()
    );
  END IF;

  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id
  LIMIT 1;

  IF v_borrower_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      v_borrower_user_id,
      'disbursement_sent',
      'Funds Sent - Please Confirm',
      'Your lender has sent ' || v_currency_symbol || p_amount::TEXT || '. Please confirm once you receive the funds.',
      '/b/loans',
      'borrower'
    );
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.submit_disbursement_proof(UUID, DECIMAL, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.submit_disbursement_proof IS
  'Lender records sending money to the borrower. Gated: the lender must first mark docs/video/metadata verified via mark_loan_verification_step. The borrower then confirms receipt (confirm_disbursement_receipt) to activate the loan.';

COMMIT;
